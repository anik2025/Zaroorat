const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const port = 4260;
const base = `http://localhost:${port}`;
const tempDataFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kotamitra-security-test-')), 'businesses.json');
const tempSessionsFile = path.join(path.dirname(tempDataFile), 'sessions.json');
const server = spawn(process.execPath, [path.join(__dirname, 'server.js')], { env: { ...process.env, PORT: String(port), KOTAMITRA_DATA_FILE: tempDataFile, KOTAMITRA_SESSIONS_FILE: tempSessionsFile }, stdio: 'ignore' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function request(route, options) { const response = await fetch(`${base}${route}`, options); return { status: response.status, body: await response.json() }; }
async function run() {
  await wait(500);
  // Setup business with a known product price
  const biz = await request('/api/businesses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Alpha Tiffin', category: 'Tiffin & Food', ownerName: 'Test Owner', phone: '9876543210', state: 'Rajasthan', city: 'Kota', area: 'Talwandi', address: '12 Road', products: [{ name: 'Lunch', price: 100 }] }) });
  const businessId = biz.body.business.id;
  // Manually approve business in data file (for demo mode bypassing admin login)
  const data = JSON.parse(fs.readFileSync(tempDataFile, 'utf8'));
  data.businesses[0].status = 'approved';
  fs.writeFileSync(tempDataFile, JSON.stringify(data, null, 2));

  // Customer Login (OTP)
  await request('/api/auth/request-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: '9876543222' }) });
  const verify = await request('/api/auth/verify-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: '9876543222', otp: '123456' }) });
  const customerAuth = { Authorization: `Bearer ${verify.body.accessToken}` };

  // Attempt Price Manipulation: Browser sends price 1, server should override to 100
  const orderResult = await request('/api/orders', { method: 'POST', headers: { ...customerAuth, 'Content-Type': 'application/json' }, body: JSON.stringify({ businessId, customerName: 'Test Customer', customerPhone: '9876543222', items: [{ name: 'Lunch', price: 1, quantity: 1 }], totalAmount: 1, deliveryAddress: 'Test Address' }) });

  if (orderResult.status !== 201) throw new Error('Order creation failed');
  if (orderResult.body.order.items[0].price !== 100 || orderResult.body.order.totalAmount !== 100) {
    throw new Error(`Security Failure: Price manipulation succeeded! Expected total 100, got ${orderResult.body.order.totalAmount}`);
  }
  console.log('Price manipulation test passed: server ignored manipulated price and used trusted price.');
}
run().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => server.kill());
