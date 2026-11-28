const { spawn } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const PORT = 4310;
const BASE = `http://localhost:${PORT}`;
const CONCURRENCY = 50;
const TOTAL_REQUESTS = 250;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function startBackend(tempDir) {
  return spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    env: {
      ...process.env,
      PORT: String(PORT),
      KOTAMITRA_DATA_FILE: path.join(tempDir, 'businesses.json'),
      KOTAMITRA_SESSIONS_FILE: path.join(tempDir, 'sessions.json'),
      KOTAMITRA_ADMIN_EMAIL: 'load-admin@example.test',
      KOTAMITRA_ADMIN_PASSWORD: 'load-password'
    },
    stdio: 'ignore'
  });
}

async function request(url) {
  return new Promise((resolve, reject) => {
    const start = process.hrtime.bigint();
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const end = process.hrtime.bigint();
        const latencyMs = Number(end - start) / 1000000;
        resolve({ statusCode: res.statusCode, latencyMs });
      });
    }).on('error', reject);
  });
}

async function run() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kotamitra-load-'));
  const server = startBackend(tempDir);
  await wait(1000);

  console.log(`Starting load test with ${TOTAL_REQUESTS} requests, concurrency limit ${CONCURRENCY}...`);
  const results = [];
  const startTotal = process.hrtime.bigint();

  const queue = Array(TOTAL_REQUESTS).fill(`${BASE}/api/health`);
  const activeWorkers = [];

  async function worker() {
    while (queue.length > 0) {
      const url = queue.pop();
      try {
        const res = await request(url);
        results.push(res);
      } catch (err) {
        results.push({ statusCode: 500, error: err.message, latencyMs: 0 });
      }
    }
  }

  for (let i = 0; i < CONCURRENCY; i++) {
    activeWorkers.push(worker());
  }

  await Promise.all(activeWorkers);

  const endTotal = process.hrtime.bigint();
  const totalDurationSec = Number(endTotal - startTotal) / 1000000000;

  const latencies = results.map(r => r.latencyMs).filter(l => l > 0).sort((a, b) => a - b);
  const successCount = results.filter(r => r.statusCode === 200).length;
  const failureCount = TOTAL_REQUESTS - successCount;

  const sum = latencies.reduce((a, b) => a + b, 0);
  const avg = sum / latencies.length;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
  const rps = TOTAL_REQUESTS / totalDurationSec;

  console.log('\n--- Load Test Results ---');
  console.log(`Total Requests: ${TOTAL_REQUESTS}`);
  console.log(`Successful:     ${successCount}`);
  console.log(`Failed:         ${failureCount}`);
  console.log(`Duration:       ${totalDurationSec.toFixed(2)}s`);
  console.log(`RPS:            ${rps.toFixed(1)} req/sec`);
  console.log(`Avg Latency:    ${avg.toFixed(2)}ms`);
  console.log(`p95 Latency:    ${p95.toFixed(2)}ms`);

  server.kill();

  if (failureCount > 0) {
    throw new Error(`Load test detected ${failureCount} failed requests.`);
  }
}

run().catch(err => {
  console.error('Load test failed:', err.message);
  process.exitCode = 1;
});
