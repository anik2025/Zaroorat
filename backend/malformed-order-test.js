const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

// Configuration
const PORT = 4292;
const BASE = `http://localhost:${PORT}`;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function createEnv(tempDir) {
  return {
    ...process.env,
    PORT: String(PORT),
    KOTAMITRA_DATA_FILE: path.join(tempDir, 'businesses.json'),
    KOTAMITRA_SESSIONS_FILE: path.join(tempDir, 'sessions.json'),
    KOTAMITRA_ADMIN_EMAIL: 'malformed-order-admin@example.test',
    KOTAMITRA_ADMIN_PASSWORD: 'malformed-order-password'
  };
}

async function request(route, options = {}) {
  const resp = await fetch(`${BASE}${route}`, options);
  const text = await resp.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  return { status: resp.status, body };
}

function jsonOptions(value) {
  return { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) };
}

async function startServer() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kotamitra-malformed-order-'));
  const env = createEnv(tempDir);
  const server = spawn(process.execPath, [path.join(__dirname, 'server.js')], { env, stdio: 'ignore' });
  await wait(500);
  return { server, tempDir };
}

async function obtainCustomerToken() {
  // request OTP (dev mode returns fixed otp 123456)
  await request('/api/auth/request-otp', jsonOptions({ phone: '9876543222' }));
  const verify = await request('/api/auth/verify-otp', jsonOptions({ phone: '9876543222', otp: '123456' }));
  if (verify.status !== 200) throw new Error('Customer OTP verify failed');
  return `Bearer ${verify.body.accessToken}`;
}

async function approveBusiness(adminToken, businessId) {
  const res = await request(`/api/businesses/${businessId}`, {
    method: 'PATCH',
    headers: { Authorization: adminToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'approved' })
  });
  if (res.status !== 200) throw new Error('Business approval failed');
}

async function createBusiness() {
  const res = await request('/api/businesses', jsonOptions({
    name: 'TestBiz',
    category: 'Food',
    ownerName: 'Owner',
    phone: '9876543210',
    state: 'Rajasthan',
    city: 'Kota',
    area: 'Talwandi',
    address: '12 Road',
    products: [{ name: 'Lunch', price: 100 }]
  }));
  if (res.status !== 201) throw new Error('Business creation failed');
  return res.body.business.id;
}

async function adminLogin() {
  const res = await request('/api/admin/login', jsonOptions({ email: 'malformed-order-admin@example.test', password: 'malformed-order-password' }));
  if (res.status !== 200) throw new Error('Admin login failed');
  return `Bearer ${res.body.accessToken}`;
}

function assertCondition(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function run() {
  const { server, tempDir } = await startServer();
  try {
    // Setup fixtures
    const businessId = await createBusiness();
    const adminToken = await adminLogin();
    await approveBusiness(adminToken, businessId);
    const customerAuth = await obtainCustomerToken();

    // Helper to send order request with given body
    const orderReq = async (body, headers = {}) => request('/api/orders', {
      method: 'POST',
      headers: { Authorization: customerAuth, 'Content-Type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body)
    });

    // ==== Malformed order tests (expect 400) ====
    // 1. Non‑object JSON (array)
    let resp = await orderReq([1,2,3]);
    assertCondition(resp.status === 400 && /Request body must be a JSON object/.test(resp.body.error), 'Non‑object array payload not rejected');

    // 2. Invalid business UUID format
    resp = await orderReq({ businessId: 'not-a-uuid', customerName: 'Bob', items: [{ name: 'Lunch', quantity: 1 }], deliveryAddress: 'Addr' });
    assertCondition(resp.status === 400 && /Enter a valid business ID/.test(resp.body.error), 'Invalid UUID not rejected');

    // 3. Empty items array
    resp = await orderReq({ businessId, customerName: 'Bob', items: [], deliveryAddress: 'Addr' });
    assertCondition(resp.status === 400 && /Order must contain at least one item/.test(resp.body.error), 'Empty items not rejected');

    // 4. Too many items (>50)
    const many = Array.from({ length: 51 }, () => ({ name: 'Lunch', quantity: 1 }));
    resp = await orderReq({ businessId, customerName: 'Bob', items: many, deliveryAddress: 'Addr' });
    assertCondition(resp.status === 400 && /Order cannot contain more than 50 items/.test(resp.body.error), 'Too many items not rejected');

    // 5. Invalid quantity (zero)
    resp = await orderReq({ businessId, customerName: 'Bob', items: [{ name: 'Lunch', quantity: 0 }], deliveryAddress: 'Addr' });
    assertCondition(resp.status === 400 && /Invalid item name or quantity/.test(resp.body.error), 'Zero quantity not rejected');

    // 6. Unknown catalog item
    resp = await orderReq({ businessId, customerName: 'Bob', items: [{ name: 'Pizza', quantity: 1 }], deliveryAddress: 'Addr' });
    assertCondition(resp.status === 400 && /Order item is not available in this business catalog/.test(resp.body.error), 'Unknown catalog item not rejected');

    // 7. Missing/short customer name
    resp = await orderReq({ businessId, customerName: 'A', items: [{ name: 'Lunch', quantity: 1 }], deliveryAddress: 'Addr' });
    assertCondition(resp.status === 400 && /Customer name must be 2 to 100 characters/.test(resp.body.error), 'Short customer name not rejected');

    // 8. Short delivery address
    resp = await orderReq({ businessId, customerName: 'Bob', items: [{ name: 'Lunch', quantity: 1 }], deliveryAddress: '123' });
    assertCondition(resp.status === 400 && /Delivery address must be 5 to 300 characters/.test(resp.body.error), 'Short address not rejected');

    // ==== Content‑type and auth safety ====
    // 9. Wrong Content‑Type
    resp = await orderReq({ businessId, customerName: 'Bob', items: [{ name: 'Lunch', quantity: 1 }], deliveryAddress: 'Addr' }, { 'Content-Type': 'text/plain' });
    assertCondition(resp.status === 415 && /Content-Type must be application\/json/.test(resp.body.error), 'Wrong Content-Type not rejected');

    // 10. Missing Authorization header
    resp = await request('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ businessId, customerName: 'Bob', items: [{ name: 'Lunch', quantity: 1 }], deliveryAddress: 'Addr' }) });
    assertCondition(resp.status === 401 && /Customer login required/.test(resp.body.error), 'Missing auth not rejected');

    // ==== Payload size limit (413) ====
    const bigPayload = 'A'.repeat(1_000_005); // exceeds 1MB limit
    resp = await request('/api/orders', { method: 'POST', headers: { Authorization: customerAuth, 'Content-Type': 'application/json' }, body: bigPayload });
    assertCondition(resp.status === 413 && /Request body is too large/.test(resp.body.error), 'Oversized payload not rejected');

    // ==== Safe 500 error (no leak) ====
    // Corrupt the data file to force a read error
    fs.writeFileSync(path.join(tempDir, 'businesses.json'), 'THIS_IS_NOT_JSON');
    const errResp = await request('/api/businesses', { method: 'GET' });
    assertCondition(errResp.status === 500 && errResp.body.error === 'Internal server error', 'Safe 500 response not as expected');
    // Ensure no sensitive tokens/stack traces leaked
    const forbidden = ['stack', 'at ', 'businesses.json', 'sessions.json', 'admin', 'password'];
    for (const kw of forbidden) {
      if (JSON.stringify(errResp.body).toLowerCase().includes(kw)) {
        throw new Error(`Leak detected in 500 response: ${kw}`);
      }
    }

    console.log('All malformed‑order & safe‑error tests passed');
  } finally {
    server.kill();
  }
}

run().catch(err => {
  console.error('Test failed:', err.message);
  process.exitCode = 1;
});
