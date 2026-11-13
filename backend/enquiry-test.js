const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const port = 4210;
const base = `http://localhost:${port}`;
const tempDataFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kotamitra-enquiry-test-')), 'businesses.json');
const server = spawn(process.execPath, [path.join(__dirname, 'server.js')], { env: { ...process.env, PORT: String(port), KOTAMITRA_DATA_FILE: tempDataFile, KOTAMITRA_ADMIN_EMAIL: 'enquiry-test-admin@example.test', KOTAMITRA_ADMIN_PASSWORD: 'enquiry-test-password' }, stdio: 'ignore' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function request(route, options) { const response = await fetch(`${base}${route}`, options); return { status: response.status, body: await response.json() }; }
async function run() {
  await wait(250);
  const admin = await request('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'enquiry-test-admin@example.test', password: 'enquiry-test-password' }) });
  if (admin.status !== 200) throw new Error('Admin login failed');
  const auth = { Authorization: `Bearer ${admin.body.accessToken}` };
  const businesses = [];
  for (const name of ['Alpha Tiffin', 'Beta Repair']) {
    const result = await request('/api/businesses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, category: name.includes('Tiffin') ? 'Tiffin & Food' : 'Repairs', ownerName: 'Test Owner', phone: '9876543210', area: name.includes('Tiffin') ? 'Talwandi' : 'Vigyan Nagar', address: name.includes('Tiffin') ? '12 Talwandi Main Road' : '24 Vigyan Nagar Market' }) });
    businesses.push(result.body.business);
  }
  for (const business of businesses) await request(`/api/businesses/${business.id}`, { method: 'PATCH', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'approved' }) });
  const created = [];
  for (const [index, businessId] of businesses.map(b => b.id).entries()) {
    const result = await request('/api/enquiries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ businessId, customerName: `Customer ${index + 1}`, customerPhone: `987654321${index}`, message: 'Need details' }) });
    created.push(result.body.enquiry);
  }
  created.push({ id: 'missing-reference-test', businessId: 'does-not-exist', customerName: 'Missing Ref', status: 'new', message: 'Safe fallback' });
  const data = JSON.parse(fs.readFileSync(tempDataFile, 'utf8')); data.enquiries.push(created[created.length - 1]); fs.writeFileSync(tempDataFile, JSON.stringify(data, null, 2));
  const listed = await request('/api/enquiries', { headers: auth });
  const details = listed.body.enquiries.filter(e => created.some(c => c.id === e.id));
  const valid = details.find(e => e.businessId === businesses[0].id); const second = details.find(e => e.businessId === businesses[1].id); const missing = details.find(e => e.businessId === 'does-not-exist');
  if (!valid?.businessDetails || valid.businessDetails.name !== 'Alpha Tiffin' || valid.businessDetails.category !== 'Tiffin & Food' || valid.businessDetails.area !== 'Talwandi') throw new Error('Valid business reference failed');
  if (!second?.businessDetails || second.businessDetails.name !== 'Beta Repair') throw new Error('Multiple business references failed');
  if (missing?.businessDetails !== null) throw new Error('Missing business reference fallback failed');
  const updated = await request(`/api/enquiries/${created[0].id}`, { method: 'PATCH', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'contacted' }) });
  if (updated.status !== 200 || updated.body.enquiry.status !== 'contacted') throw new Error('Contacted status update failed');
  const closed = await request(`/api/enquiries/${created[0].id}`, { method: 'PATCH', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'closed' }) });
  if (closed.status !== 200 || closed.body.enquiry.status !== 'closed') throw new Error('Closed status update failed');
  const reopened = await request(`/api/enquiries/${created[0].id}`, { method: 'PATCH', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'new' }) });
  if (reopened.status !== 200 || reopened.body.enquiry.status !== 'new') throw new Error('New status update failed');
  console.log('Enquiry tests passed: valid reference, missing reference, multiple references, new/contacted/closed status updates');
}
run().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => server.kill());
