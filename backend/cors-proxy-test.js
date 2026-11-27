const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const ROOT = __dirname;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function createEnv(port, tempDir, extra = {}) {
  return {
    ...process.env,
    PORT: String(port),
    KOTAMITRA_DATA_FILE: path.join(tempDir, 'businesses.json'),
    KOTAMITRA_SESSIONS_FILE: path.join(tempDir, 'sessions.json'),
    KOTAMITRA_ADMIN_EMAIL: 'cors-proxy-admin@example.test',
    KOTAMITRA_ADMIN_PASSWORD: 'cors-proxy-password',
    ...extra
  };
}

function seedData(tempDir) {
  fs.writeFileSync(path.join(tempDir, 'businesses.json'), JSON.stringify({ businesses: [], enquiries: [], orders: [] }));
}

async function request(base, route, options = {}) {
  const response = await fetch(`${base}${route}`, options);
  return { status: response.status, headers: response.headers, body: await response.text() };
}

async function startServer(port, extraEnv = {}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zaroorat-cors-proxy-test-'));
  seedData(tempDir);
  const env = createEnv(port, tempDir, extraEnv);
  const server = spawn(process.execPath, [path.join(ROOT, 'server.js')], { env, stdio: 'ignore' });
  await wait(400);
  return { server, base: `http://localhost:${port}` };
}

async function stopServer(server) {
  server.kill();
  await wait(150);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertNoCorsHeaders(response, label) {
  for (const header of ['access-control-allow-origin', 'access-control-allow-headers', 'access-control-allow-methods']) {
    assert(response.headers.get(header) === null, `${label} unexpectedly included ${header}`);
  }
}

async function testCorsAndPreflight() {
  const allowedOrigin = 'https://allowed.example.test';
  const secondOrigin = 'https://second.example.test';
  const serverInfo = await startServer(4261, {
    KOTAMITRA_ALLOWED_ORIGINS: `${allowedOrigin},${secondOrigin}`
  });
  try {
    const noOrigin = await request(serverInfo.base, '/api/health');
    assert(noOrigin.status === 200, 'No-origin health request failed');
    assert(noOrigin.headers.get('access-control-allow-origin') === null, 'No-origin response invented CORS permission');

    const allowed = await request(serverInfo.base, '/api/health', { headers: { Origin: allowedOrigin } });
    assert(allowed.status === 200, 'Allowlisted-origin health request failed');
    assert(allowed.headers.get('access-control-allow-origin') === allowedOrigin, 'Allowlisted origin was not echoed exactly');
    assert(allowed.headers.get('vary')?.toLowerCase().includes('origin'), 'Allowed response omitted Vary: Origin');
    assert(allowed.headers.get('access-control-allow-headers') === 'Authorization, Content-Type, X-CSRF-Token', 'Allowed headers were incorrect');
    assert(allowed.headers.get('access-control-allow-methods') === 'GET,POST,PATCH,OPTIONS', 'Allowed methods were incorrect');

    const prefix = await request(serverInfo.base, '/api/health', { headers: { Origin: `${allowedOrigin}.attacker.test` } });
    assertNoCorsHeaders(prefix, 'Prefix origin');

    const disallowed = await request(serverInfo.base, '/api/health', { headers: { Origin: 'https://blocked.example.test' } });
    assert(disallowed.status === 200, 'Blocked-origin health request unexpectedly failed at HTTP level');
    assertNoCorsHeaders(disallowed, 'Blocked origin');

    const preflight = await request(serverInfo.base, '/api/health', {
      method: 'OPTIONS',
      headers: {
        Origin: secondOrigin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Authorization, Content-Type, X-CSRF-Token'
      }
    });
    assert(preflight.status === 204, 'Allowed preflight did not return 204');
    assert(preflight.headers.get('access-control-allow-origin') === secondOrigin, 'Preflight origin was not echoed exactly');
    assert(preflight.headers.get('access-control-allow-methods') === 'GET,POST,PATCH,OPTIONS', 'Preflight methods were incorrect');
    assert(preflight.headers.get('access-control-allow-headers') === 'Authorization, Content-Type, X-CSRF-Token', 'Preflight headers were incorrect');

    const blockedPreflight = await request(serverInfo.base, '/api/health', {
      method: 'OPTIONS',
      headers: { Origin: 'https://blocked.example.test', 'Access-Control-Request-Method': 'POST' }
    });
    assert(blockedPreflight.status === 204, 'Blocked preflight did not return 204');
    assertNoCorsHeaders(blockedPreflight, 'Blocked preflight');
  } finally {
    await stopServer(serverInfo.server);
  }
}

async function adminAttempts(base, forwardedValues) {
  const responses = [];
  for (const forwarded of forwardedValues) {
    const response = await request(base, '/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': forwarded },
      body: JSON.stringify({ email: 'wrong@example.test', password: 'wrong-password' })
    });
    responses.push(response.status);
  }
  return responses;
}

async function testTrustedProxy() {
  const untrusted = await startServer(4262, { KOTAMITRA_TRUSTED_PROXY: 'false' });
  try {
    const statuses = await adminAttempts(untrusted.base, Array.from({ length: 11 }, (_, i) => `198.51.100.${i + 1}`));
    assert(statuses.slice(0, 10).every(status => status === 401), 'Untrusted proxy test did not receive expected invalid-credential responses');
    assert(statuses[10] === 429, 'Untrusted X-Forwarded-For values bypassed the socket-IP rate-limit bucket');
  } finally {
    await stopServer(untrusted.server);
  }

  const trusted = await startServer(4263, { KOTAMITRA_TRUSTED_PROXY: 'true' });
  try {
    const sameIp = await adminAttempts(trusted.base, Array.from({ length: 11 }, () => '198.51.100.20, 203.0.113.10'));
    assert(sameIp.slice(0, 10).every(status => status === 401), 'Trusted proxy baseline did not receive expected invalid-credential responses');
    assert(sameIp[10] === 429, 'Trusted proxy did not rate-limit the first forwarded IP');

    const differentIp = await adminAttempts(trusted.base, ['198.51.100.21, 203.0.113.10']);
    assert(differentIp[0] === 401, 'A different trusted forwarded IP incorrectly shared the rate-limit bucket');

    const malformed = await request(trusted.base, '/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '   ' },
      body: JSON.stringify({ email: 'wrong@example.test', password: 'wrong-password' })
    });
    assert([401, 429].includes(malformed.status), 'Malformed forwarded header caused an unexpected response');
  } finally {
    await stopServer(trusted.server);
  }
}

(async () => {
  await testCorsAndPreflight();
  await testTrustedProxy();
  console.log('CORS, preflight, and trusted-proxy integration tests passed');
})().catch(error => {
  console.error('CORS/proxy test failed:', error.message);
  process.exitCode = 1;
});
