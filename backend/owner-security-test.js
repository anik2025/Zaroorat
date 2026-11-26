const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const port = 4230;
const base = `http://localhost:${port}`;
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zaroorat-owner-security-test-'));
const tempDataFile = path.join(tempDir, 'businesses.json');
const tempSessionsFile = path.join(tempDir, 'sessions.json');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function request(route, options = {}) {
  const response = await fetch(`${base}${route}`, options);
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

async function run() {
  const env = {
    ...process.env,
    PORT: String(port),
    KOTAMITRA_DATA_FILE: tempDataFile,
    KOTAMITRA_SESSIONS_FILE: tempSessionsFile
  };

  let server = spawn(process.execPath, [path.join(__dirname, 'server.js')], { env, stdio: 'ignore' });
  await wait(500);

  try {
    // 1. Setup: Register two businesses with different phone numbers
    const b1 = (await request('/api/businesses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Business A', category: 'Repairs', ownerName: 'Owner A', phone: '9000000001', state: 'Rajasthan', city: 'Kota', area: 'Talwandi', address: 'Addr A' }) })).body.business;
    const b2 = (await request('/api/businesses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Business B', category: 'Repairs', ownerName: 'Owner B', phone: '9000000002', state: 'Rajasthan', city: 'Kota', area: 'Vigyan Nagar', address: 'Addr B' }) })).body.business;

    // Auto-approve them for ease of testing
    const adminLogin = (await request('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@kotamitra.local', password: 'change-this-password' }) })).body;
    const authAdmin = { Authorization: `Bearer ${adminLogin.accessToken}` };
    await request(`/api/businesses/${b1.id}`, { method: 'PATCH', headers: { ...authAdmin, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'approved' }) });
    await request(`/api/businesses/${b2.id}`, { method: 'PATCH', headers: { ...authAdmin, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'approved' }) });

    // Submit enquiry to B1
    const enquiry = (await request('/api/enquiries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ businessId: b1.id, customerName: 'Customer', customerPhone: '9999999999', message: 'Hello' }) })).body.enquiry;

    // 2. Owner A login
    await request('/api/auth/request-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: '9000000001' }) });
    const ownerALogin = (await request('/api/auth/verify-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: '9000000001', otp: '123456' }) })).body;
    const authOwnerA = { Authorization: `Bearer ${ownerALogin.accessToken}` };
    const claim = await request('/api/owner/claim', { method: 'POST', headers: { ...authOwnerA, 'Content-Type': 'application/json' }, body: JSON.stringify({ businessId: b1.id }) });
    if (claim.status !== 200 || claim.body.role !== 'owner') throw new Error('Ownership claim failed');

    // 3. Test: Verify ownership isolation
    const ownedBusinesses = (await request('/api/owner/businesses', { headers: authOwnerA })).body.businesses;
    if (ownedBusinesses.length !== 1 || ownedBusinesses[0].id !== b1.id) throw new Error('Owner A cannot access correct business');

    // 4. Test: IDOR protection (Owner A trying to edit Owner B's business)
    const idorRes = await request(`/api/owner/businesses/${b2.id}`, { method: 'PATCH', headers: { ...authOwnerA, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Hacked' }) });
    if (idorRes.status !== 403) throw new Error('IDOR protection failed: Owner A could modify Business B');

    // 5. Test: Privilege Escalation protection
    const privRes = await request(`/api/owner/businesses/${b1.id}`, { method: 'PATCH', headers: { ...authOwnerA, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'rejected', isVerified: true }) });
    const b1Updated = (await request(`/api/businesses?status=all`, { headers: authAdmin })).body.businesses.find(b => b.id === b1.id);
    if (b1Updated.status === 'rejected' || b1Updated.isVerified === true) throw new Error('Privilege escalation failed: Owner A could modify admin-only fields');

    // 6. Test: Enquiry isolation
    const ownerAEnquiries = (await request('/api/owner/enquiries', { headers: authOwnerA })).body.enquiries;
    if (ownerAEnquiries.length !== 1 || ownerAEnquiries[0].id !== enquiry.id) throw new Error('Enquiry isolation failed: Owner A cannot see their own enquiry');

    // 7. Test: Owner status update
    const updateEnq = await request(`/api/owner/enquiries/${enquiry.id}`, { method: 'PATCH', headers: { ...authOwnerA, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'contacted' }) });
    if (updateEnq.status !== 200 || updateEnq.body.enquiry.status !== 'contacted') throw new Error('Owner status update failed');

    console.log('Owner security tests passed: ownership isolation, IDOR protection, privilege escalation prevention, enquiry isolation');
  } finally {
    server.kill();
  }
}

run().catch(error => {
  console.error('Owner security test failed:', error.message);
  process.exitCode = 1;
});
