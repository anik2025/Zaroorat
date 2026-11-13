const { spawn } = require('node:child_process');
const path = require('node:path');
const port = 4199;
const base = `http://localhost:${port}`;
const server = spawn(process.execPath, [path.join(__dirname, 'server.js')], { env: { ...process.env, PORT: String(port), KOTAMITRA_ADMIN_EMAIL: 'test-admin@kotamitra.local', KOTAMITRA_ADMIN_PASSWORD: 'test-password' }, stdio: 'ignore' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function request(route, options) { const response = await fetch(`${base}${route}`, options); return { status: response.status, body: await response.json() }; }
async function run() {
  await wait(250);
  const checks = [];
  const health = await request('/api/health'); checks.push(['health', health.status === 200 && health.body.ok]);
  const publicAll = await request('/api/businesses?status=all'); checks.push(['all listings protected', publicAll.status === 401]);
  const otp = await request('/api/auth/request-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: '9876543210' }) });
  const customer = await request('/api/auth/verify-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: '9876543210', otp: otp.body.developmentOtp }) });
  const customerAll = await request('/api/businesses?status=all', { headers: { Authorization: `Bearer ${customer.body.accessToken}` } }); checks.push(['customer cannot access admin listings', customerAll.status === 401]);
  const admin = await request('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'test-admin@kotamitra.local', password: 'test-password' }) });
  const adminAll = await request('/api/businesses?status=all', { headers: { Authorization: `Bearer ${admin.body.accessToken}` } }); checks.push(['admin can access all listings', adminAll.status === 200]);
  const failed = checks.filter(([, passed]) => !passed); if (failed.length) throw new Error(`Failed checks: ${failed.map(([name]) => name).join(', ')}`);
  console.log(`Smoke tests passed: ${checks.length}`);
}
run().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => server.kill());
