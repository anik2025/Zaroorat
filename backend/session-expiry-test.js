const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const port = 4260;
const base = `http://localhost:${port}`;
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zaroorat-session-expiry-test-'));
const dataFile = path.join(tempDir, 'businesses.json');
const sessionsFile = path.join(tempDir, 'sessions.json');
const ownerPhone = '9876543210';
const customerPhone = '9876543222';

fs.writeFileSync(dataFile, JSON.stringify({
  businesses: [{
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Expiry Test Business',
    category: 'Repairs',
    ownerName: 'Expiry Test Owner',
    phone: ownerPhone,
    whatsapp: ownerPhone,
    state: 'Rajasthan',
    city: 'Kota',
    area: 'Talwandi',
    address: '12 Expiry Test Road',
    status: 'approved',
    ownerClaimed: true,
    ownerVerifiedAt: new Date().toISOString()
  }],
  enquiries: [],
  orders: []
}, null, 2));

const env = {
  ...process.env,
  PORT: String(port),
  KOTAMITRA_DATA_FILE: dataFile,
  KOTAMITRA_SESSIONS_FILE: sessionsFile,
  KOTAMITRA_ADMIN_EMAIL: 'expiry-admin@example.test',
  KOTAMITRA_ADMIN_PASSWORD: 'expiry-test-password',
  KOTAMITRA_SESSION_ADMIN_TTL_MS: '120',
  KOTAMITRA_SESSION_CUSTOMER_TTL_MS: '120',
  KOTAMITRA_SESSION_OWNER_TTL_MS: '120'
};

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function request(route, options) {
  const response = await fetch(`${base}${route}`, options);
  return { status: response.status, body: await response.json() };
}
function auth(accessToken) { return { Authorization: `Bearer ${accessToken}` }; }

async function loginOtp(phone) {
  const requested = await request('/api/auth/request-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone })
  });
  if (requested.status !== 200) throw new Error('OTP request failed');
  const verified = await request('/api/auth/verify-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, otp: requested.body.developmentOtp || '123456' })
  });
  if (verified.status !== 200 || !verified.body.accessToken) throw new Error('OTP verification failed');
  return verified.body.accessToken;
}

async function run() {
  const server = spawn(process.execPath, [path.join(__dirname, 'server.js')], { env, stdio: 'ignore' });
  try {
    await wait(500);

    const adminLogin = await request('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: env.KOTAMITRA_ADMIN_EMAIL, password: env.KOTAMITRA_ADMIN_PASSWORD })
    });
    if (adminLogin.status !== 200) throw new Error('Admin login failed');
    const adminToken = adminLogin.body.accessToken;
    if ((await request('/api/admin/me', { headers: auth(adminToken) })).status !== 200) throw new Error('Admin session was not live immediately after login');

    const customerToken = await loginOtp(customerPhone);
    if ((await request('/api/customer/orders', { headers: auth(customerToken) })).status !== 200) throw new Error('Customer session was not live immediately after login');

    const ownerToken = await loginOtp(ownerPhone);
    if ((await request('/api/owner/businesses', { headers: auth(ownerToken) })).status !== 200) throw new Error('Owner session was not live immediately after login');

    await wait(300);

    if ((await request('/api/admin/me', { headers: auth(adminToken) })).status !== 401) throw new Error('Expired admin session remained valid');
    if ((await request('/api/customer/orders', { headers: auth(customerToken) })).status !== 401) throw new Error('Expired customer session remained valid');
    if ((await request('/api/owner/businesses', { headers: auth(ownerToken) })).status !== 401) throw new Error('Expired owner session remained valid');

    console.log('Session expiry tests passed: shortened admin, customer, and owner TTLs');
  } finally {
    server.kill();
  }
}

run().catch(error => {
  console.error('Session expiry test failed:', error.message);
  process.exitCode = 1;
});
