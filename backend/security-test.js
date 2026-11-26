const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const port = 4220;
const base = `http://localhost:${port}`;
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zaroorat-security-test-'));
const tempDataFile = path.join(tempDir, 'businesses.json');
const tempSessionsFile = path.join(tempDir, 'sessions.json');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function request(route, options) {
  const response = await fetch(`${base}${route}`, options);
  return { status: response.status, body: await response.json() };
}

async function run() {
  // 1. Start initial server instance
  const env = {
    ...process.env,
    PORT: String(port),
    KOTAMITRA_DATA_FILE: tempDataFile,
    KOTAMITRA_SESSIONS_FILE: tempSessionsFile,
    KOTAMITRA_ADMIN_EMAIL: 'security-admin@example.test',
    KOTAMITRA_ADMIN_PASSWORD: 'secure-password-123'
  };

  let server = spawn(process.execPath, [path.join(__dirname, 'server.js')], { env, stdio: 'ignore' });
  await wait(400);

  try {
    // Test admin login & token creation
    const loginRes = await request('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'security-admin@example.test', password: 'secure-password-123' })
    });
    if (loginRes.status !== 200 || !loginRes.body.accessToken) {
      throw new Error('Initial admin login failed');
    }
    const token = loginRes.body.accessToken;

    // Verify session works
    const meRes = await request('/api/admin/me', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (meRes.status !== 200 || meRes.body.admin?.email !== 'security-admin@example.test') {
      throw new Error('/api/admin/me verification failed');
    }

    // Kill server to test persistence across restart
    server.kill();
    await wait(300);

    // Start new server instance using the same sessions file
    server = spawn(process.execPath, [path.join(__dirname, 'server.js')], { env, stdio: 'ignore' });
    await wait(400);

    // Verify persisted session still works without re-logging in
    const meAfterRestart = await request('/api/admin/me', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (meAfterRestart.status !== 200 || meAfterRestart.body.admin?.email !== 'security-admin@example.test') {
      throw new Error('Session persistence across server restart failed');
    }

    // Test logout
    const logoutRes = await request('/api/admin/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (logoutRes.status !== 200) {
      throw new Error('Logout request failed');
    }

    // Verify session is now invalid
    const meAfterLogout = await request('/api/admin/me', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (meAfterLogout.status !== 401) {
      throw new Error('Logged out session was not invalidated');
    }

    // Test role-neutral customer logout and revocation.
    const customerPhone = '9876543210';
    const customerOtp = await request('/api/auth/request-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: customerPhone })
    });
    const customerLogin = await request('/api/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: customerPhone, otp: customerOtp.body.developmentOtp || '123456' })
    });
    if (customerLogin.status !== 200 || !customerLogin.body.accessToken) {
      throw new Error('Customer login setup for logout test failed');
    }
    const customerToken = customerLogin.body.accessToken;
    const customerLogout = await request('/api/auth/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` }
    });
    if (customerLogout.status !== 200) throw new Error('Customer logout request failed');
    const customerAfterLogout = await request('/api/customer/orders', {
      headers: { Authorization: `Bearer ${customerToken}` }
    });
    if (customerAfterLogout.status !== 401) throw new Error('Customer session was not revoked');

    // Test Rate Limiting on OTP request endpoint (limit is 10 per minute)
    let rateLimited = false;
    for (let i = 0; i < 12; i++) {
      const otpRes = await request('/api/auth/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '9876543210' })
      });
      if (otpRes.status === 429) {
        rateLimited = true;
        break;
      }
    }
    if (!rateLimited) {
      throw new Error('Rate limiting on /api/auth/request-otp failed to trigger 429');
    }

    console.log('Security tests passed: session persistence across restart, logout invalidation, and rate limiting (429)');
  } finally {
    server.kill();
  }
}

run().catch(error => {
  console.error('Security test failed:', error.message);
  process.exitCode = 1;
});
