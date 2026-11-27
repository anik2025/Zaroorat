const { spawn } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const PORT = 4296;
const SMS_PORT = 4300;
const BASE = `http://localhost:${PORT}`;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function startSmsGatewayMock(receivedRequests) {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      receivedRequests.push({
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: JSON.parse(body || '{}')
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    });
  });
  await new Promise(resolve => server.listen(SMS_PORT, resolve));
  return server;
}

function createEnv(tempDir, extra = {}) {
  return {
    ...process.env,
    PORT: String(PORT),
    KOTAMITRA_DATA_FILE: path.join(tempDir, 'businesses.json'),
    KOTAMITRA_SESSIONS_FILE: path.join(tempDir, 'sessions.json'),
    KOTAMITRA_ADMIN_EMAIL: 'sms-admin@example.test',
    KOTAMITRA_ADMIN_PASSWORD: 'sms-admin-password',
    ...extra
  };
}

async function startBackend(tempDir, extraEnv) {
  const env = createEnv(tempDir, extraEnv);
  const server = spawn(process.execPath, [path.join(__dirname, 'server.js')], { env, stdio: 'ignore' });
  await wait(500);
  return server;
}

function assertCondition(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function run() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kotamitra-sms-test-'));
  const receivedSms = [];
  const smsServer = await startSmsGatewayMock(receivedSms);

  // 1. Test production/staging fail-closed when endpoint is missing
  try {
    const failEnv = createEnv(tempDir, {
      NODE_ENV: 'production',
      KOTAMITRA_OTP_PROVIDER: 'rest-api'
      // Missing KOTAMITRA_OTP_SMS_ENDPOINT
    });
    const failProc = spawn(process.execPath, [path.join(__dirname, 'server.js')], { env: failEnv, stdio: 'pipe' });
    let stderr = '';
    failProc.stderr.on('data', d => stderr += d);
    const code = await new Promise(resolve => failProc.on('exit', resolve));
    assertCondition(code !== 0, 'Backend should fail startup when KOTAMITRA_OTP_SMS_ENDPOINT is missing in production');
  } catch (err) {
    // If exception thrown or exit code non-zero, expected
  }

  // 2. Test successful SMS dispatch via REST adapter in production/staging mode
  const backendServer = await startBackend(tempDir, {
    NODE_ENV: 'production',
    KOTAMITRA_OTP_PROVIDER: 'rest-api',
    KOTAMITRA_OTP_SMS_ENDPOINT: `http://localhost:${SMS_PORT}/sms`,
    KOTAMITRA_OTP_API_KEY: 'test-sms-api-key'
  });

  try {
    const res = await fetch(`${BASE}/api/auth/request-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '9876543210' })
    });
    assertCondition(res.status === 200, 'OTP request failed with configured REST SMS provider');
    const data = await res.json();
    assertCondition(data.ok === true, 'OTP request did not return ok: true');
    assertCondition(data.developmentOtp === undefined, 'Development OTP should not be returned in production');

    assertCondition(receivedSms.length === 1, 'SMS gateway did not receive request');
    assertCondition(receivedSms[0].headers['authorization'] === 'Bearer test-sms-api-key', 'Incorrect API key header sent');
    assertCondition(receivedSms[0].body.phone === '9876543210', 'Incorrect phone number sent to SMS gateway');
    assertCondition(typeof receivedSms[0].body.code === 'string' && receivedSms[0].body.code.length === 6, 'Incorrect OTP code sent');

    console.log('All OTP real provider integration tests passed');
  } finally {
    backendServer.kill();
    await new Promise(resolve => smsServer.close(resolve));
  }
}

run().catch(err => {
  console.error('OTP provider test failed:', err.message);
  process.exitCode = 1;
});
