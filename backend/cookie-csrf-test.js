const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const PORT = 4295;
const BASE = `http://localhost:${PORT}`;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function createEnv(tempDir) {
  return {
    ...process.env,
    PORT: String(PORT),
    KOTAMITRA_DATA_FILE: path.join(tempDir, 'businesses.json'),
    KOTAMITRA_SESSIONS_FILE: path.join(tempDir, 'sessions.json'),
    KOTAMITRA_ADMIN_EMAIL: 'cookie-admin@example.test',
    KOTAMITRA_ADMIN_PASSWORD: 'cookie-admin-password',
    KOTAMITRA_ALLOWED_ORIGINS: 'http://localhost:4100,https://allowed.example.test'
  };
}

async function startServer(tempDir) {
  const env = createEnv(tempDir);
  const server = spawn(process.execPath, [path.join(__dirname, 'server.js')], { env, stdio: 'ignore' });
  await wait(500);
  return server;
}

function assertCondition(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function run() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kotamitra-cookie-csrf-'));
  const server = await startServer(tempDir);

  try {
    // 1. Admin login sets HttpOnly cookie
    const loginRes = await fetch(`${BASE}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'cookie-admin@example.test', password: 'cookie-admin-password' })
    });
    assertCondition(loginRes.status === 200, 'Admin login failed');
    const setCookieHeader = loginRes.headers.get('set-cookie');
    assertCondition(setCookieHeader && setCookieHeader.includes('kotamitra_session='), 'Session cookie not set');
    assertCondition(setCookieHeader.toLowerCase().includes('httponly'), 'Cookie missing HttpOnly flag');
    assertCondition(setCookieHeader.toLowerCase().includes('samesite=strict'), 'Cookie missing SameSite=Strict flag');

    // Extract cookie value for subsequent requests
    const cookieToken = setCookieHeader.split(';')[0];

    // 2. Authenticated GET request using cookie (no Authorization header)
    const meRes = await fetch(`${BASE}/api/admin/me`, {
      headers: { Cookie: cookieToken }
    });
    assertCondition(meRes.status === 200, 'Cookie-authenticated GET request failed');
    const meBody = await meRes.json().catch(() => ({}));
    assertCondition(meBody.admin && meBody.admin.email === 'cookie-admin@example.test', 'Incorrect admin identity returned');

    // 3. CSRF test: State-changing request with cookie but missing/untrusted Origin
    // First, seed an approved business & obtain customer token via Bearer (or cookie) to test POST /api/orders CSRF
    const bizRes = await fetch(`${BASE}/api/businesses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Cookie Biz',
        category: 'Tiffin & Food',
        ownerName: 'Owner',
        phone: '9876543210',
        state: 'Rajasthan',
        city: 'Kota',
        area: 'Talwandi',
        address: '12 Road',
        status: 'approved',
        products: [{ name: 'Lunch', price: 100 }]
      })
    });
    const bizData = await bizRes.json();
    const businessId = bizData.business.id;

    // Approve business via admin cookie
    await fetch(`${BASE}/api/businesses/${businessId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookieToken, Origin: 'https://allowed.example.test' },
      body: JSON.stringify({ status: 'approved' })
    });

    // Customer OTP login
    await fetch(`${BASE}/api/auth/request-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '9876543222' })
    });
    const custVerify = await fetch(`${BASE}/api/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '9876543222', otp: '123456' })
    });
    const custSetCookie = custVerify.headers.get('set-cookie');
    const custCookieToken = custSetCookie.split(';')[0];

    // POST /api/orders with cookie and UNTRUSTED origin -> should fail with 403 CSRF error
    const csrfFailRes = await fetch(`${BASE}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: custCookieToken,
        Origin: 'https://malicious.example.test'
      },
      body: JSON.stringify({ businessId, customerName: 'Bob', items: [{ name: 'Lunch', quantity: 1 }], deliveryAddress: '12345' })
    });
    assertCondition(csrfFailRes.status === 403, 'CSRF check did not reject untrusted origin on cookie request');

    // POST /api/orders with cookie and ALLOWED origin -> should succeed (201)
    const csrfPassRes = await fetch(`${BASE}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: custCookieToken,
        Origin: 'https://allowed.example.test'
      },
      body: JSON.stringify({ businessId, customerName: 'Bob', items: [{ name: 'Lunch', quantity: 1 }], deliveryAddress: '12345' })
    });
    assertCondition(csrfPassRes.status === 201, 'Allowed origin with cookie authentication failed');

    // 4. Logout clears cookie
    const logoutRes = await fetch(`${BASE}/api/admin/logout`, {
      method: 'POST',
      headers: { Cookie: cookieToken, Origin: 'https://allowed.example.test' }
    });
    assertCondition(logoutRes.status === 200, 'Logout failed');
    const logoutCookie = logoutRes.headers.get('set-cookie');
    assertCondition(logoutCookie && logoutCookie.toLowerCase().includes('max-age=0'), 'Logout did not clear session cookie');

    console.log('All HTTP-only cookie and CSRF integration tests passed');
  } finally {
    server.kill();
  }
}

run().catch(err => {
  console.error('Cookie/CSRF test failed:', err.message);
  process.exitCode = 1;
});
