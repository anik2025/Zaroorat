const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const port = 4250;
const base = `http://localhost:${port}`;
const tempDataFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kotamitra-order-test-')), 'businesses.json');
const tempSessionsFile = path.join(path.dirname(tempDataFile), 'sessions.json');
const server = spawn(process.execPath, [path.join(__dirname, 'server.js')], { env: { ...process.env, PORT: String(port), KOTAMITRA_DATA_FILE: tempDataFile, KOTAMITRA_SESSIONS_FILE: tempSessionsFile, KOTAMITRA_ADMIN_EMAIL: 'order-test-admin@example.test', KOTAMITRA_ADMIN_PASSWORD: 'order-test-password' }, stdio: 'ignore' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function request(route, options) { const response = await fetch(`${base}${route}`, options); return { status: response.status, body: await response.json() }; }
async function run() {
  await wait(500);
  // Register business
  const bizResult = await request('/api/businesses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Alpha Tiffin', category: 'Tiffin & Food', ownerName: 'Test Owner', phone: '9876543210', state: 'Rajasthan', city: 'Kota', area: 'Talwandi', address: '12 Talwandi Main Road' }) });
  const businessId = bizResult.body.business.id;
  // Approve business (Admin)
  const admin = await request('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'order-test-admin@example.test', password: 'order-test-password' }) });
  await request(`/api/businesses/${businessId}`, { method: 'PATCH', headers: { Authorization: `Bearer ${admin.body.accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'approved' }) });

  // Customer Login (OTP)
  await request('/api/auth/request-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: '9876543222' }) });
  const verify = await request('/api/auth/verify-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: '9876543222', otp: '123456' }) });
  const customerAuth = { Authorization: `Bearer ${verify.body.accessToken}` };

  // Create Order
  const orderResult = await request('/api/orders', { method: 'POST', headers: { ...customerAuth, 'Content-Type': 'application/json' }, body: JSON.stringify({ businessId, customerName: 'Test Customer', customerPhone: '9876543222', items: [{ name: 'Lunch', price: 100 }], totalAmount: 100, deliveryAddress: 'Test Address' }) });
  if (orderResult.status !== 201) throw new Error('Order creation failed');
  const orderId = orderResult.body.order.id;

  // Owner Auth
  // Re-use OTP/Login flow or Admin to mock owner?
  // Owner is linked to business.phone in logic. Biz phone is 9876543210.
  await request('/api/auth/request-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: '9876543210' }) });
  const ownerVerify = await request('/api/auth/verify-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: '9876543210', otp: '123456' }) });
  const ownerAuth = { Authorization: `Bearer ${ownerVerify.body.accessToken}` };

  // Owner Get Orders
  const ownerOrders = await request('/api/owner/orders', { headers: ownerAuth });
  if (ownerOrders.body.orders.length !== 1 || ownerOrders.body.orders[0].id !== orderId) throw new Error('Owner failed to see order');

  // Owner Update Order
  await request(`/api/owner/orders/${orderId}`, { method: 'PATCH', headers: { ...ownerAuth, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'confirmed' }) });

  // Customer Get Orders
  const customerOrders = await request('/api/customer/orders', { headers: customerAuth });
  if (customerOrders.body.orders[0].status !== 'confirmed') throw new Error('Customer failed to see updated status');

  console.log('Order tests passed: creation, owner visibility, owner update, customer visibility');
}
run().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => server.kill());
