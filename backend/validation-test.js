const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const port = 4220;
const base = `http://localhost:${port}`;
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kotamitra-validation-test-'));
const tempDataFile = path.join(tempDir, 'businesses.json');
const env = { ...process.env, PORT: String(port), KOTAMITRA_DATA_FILE: tempDataFile, KOTAMITRA_ADMIN_EMAIL: 'validation-admin@example.test', KOTAMITRA_ADMIN_PASSWORD: 'validation-password' };
const server = spawn(process.execPath, [path.join(__dirname, 'server.js')], { env, stdio: 'ignore' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function request(route, options) {
  const response = await fetch(`${base}${route}`, options);
  const body = await response.text();
  let parsed; try { parsed = body ? JSON.parse(body) : {}; } catch { parsed = { raw: body }; }
  return { status: response.status, body: parsed };
}
const jsonOptions = value => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
const validBusiness = { name: 'Validation Tiffin', category: 'Tiffin & Food', ownerName: 'Valid Owner', phone: '+91 9876543210', whatsapp: '9876543211', state: 'Rajasthan', city: 'Kota', area: 'Talwandi', address: '12 Talwandi Main Road', description: 'Fresh meals for students' };
async function expectStatus(label, route, options, expected) {
  const result = await request(route, options);
  if (result.status !== expected) throw new Error(`${label}: expected ${expected}, received ${result.status} (${result.body.error || 'no error'})`);
  return result;
}
async function run() {
  await wait(250);
  const admin = await request('/api/admin/login', jsonOptions({ email: 'validation-admin@example.test', password: 'validation-password' }));
  if (admin.status !== 200) throw new Error('Admin login failed');
  adminToken = admin.body.accessToken;
  const valid = await expectStatus('Valid business submission', '/api/businesses', jsonOptions(validBusiness), 201);
  const approved = await request(`/api/businesses/${valid.body.business.id}`, { method: 'PATCH', headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'approved' }) });
  if (approved.status !== 200) throw new Error('Could not approve valid business fixture');
  const rejected = await expectStatus('Rejected fixture business', '/api/businesses', jsonOptions({ ...validBusiness, name: 'Rejected Repair', category: 'Repairs' }), 201);
  const rejectedUpdate = await request(`/api/businesses/${rejected.body.business.id}`, { method: 'PATCH', headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'rejected' }) });
  if (rejectedUpdate.status !== 200) throw new Error('Could not reject business fixture');
  const missing = { ...validBusiness }; delete missing.address;
  await expectStatus('Missing required field', '/api/businesses', jsonOptions(missing), 400);
  await expectStatus('Invalid mobile number', '/api/businesses', jsonOptions({ ...validBusiness, phone: '12345' }), 400);
  await expectStatus('Invalid area', '/api/businesses', jsonOptions({ ...validBusiness, area: 'Not Kota' }), 400);
  await expectStatus('Invalid category', '/api/businesses', jsonOptions({ ...validBusiness, category: 'Unknown Category' }), 400);
  await expectStatus('Malformed business JSON', '/api/businesses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad json' }, 400);
  const approvedBusiness = valid.body.business;
  const rejectedBusiness = rejected.body.business;
  const validEnquiry = await expectStatus('Valid enquiry', '/api/enquiries', jsonOptions({ businessId: approvedBusiness.id, customerName: 'Test Customer', customerPhone: '+91 9876543222', message: 'Please share the details' }), 201);
  if (validEnquiry.body.enquiry.status !== 'new' || validEnquiry.body.enquiry.customerPhone !== '9876543222') throw new Error('Valid enquiry normalization failed');
  await expectStatus('Invalid business ID', '/api/enquiries', jsonOptions({ businessId: 'not-a-uuid', customerName: 'Test Customer', customerPhone: '9876543222', message: 'Please share details' }), 400);
  await expectStatus('Non-existent business', '/api/enquiries', jsonOptions({ businessId: '00000000-0000-4000-8000-000000000000', customerName: 'Test Customer', customerPhone: '9876543222', message: 'Please share details' }), 400);
  await expectStatus('Rejected business enquiry', '/api/enquiries', jsonOptions({ businessId: rejectedBusiness.id, customerName: 'Test Customer', customerPhone: '9876543222', message: 'Please share details' }), 400);
  await expectStatus('Invalid enquiry message', '/api/enquiries', jsonOptions({ businessId: approvedBusiness.id, customerName: 'Test Customer', customerPhone: '9876543222', message: 'No' }), 400);
  await expectStatus('Malformed enquiry JSON', '/api/enquiries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad json' }, 400);
  console.log('Validation tests passed: business fields, phone, category, area, malformed JSON, valid enquiry, business references, rejected business, message');
}
let adminToken = '';
run().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => server.kill());
