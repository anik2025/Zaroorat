const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const PORT = 4284;
const BASE = `http://localhost:${PORT}`;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function createEnv(tempDir) {
  return {
    ...process.env,
    PORT: String(PORT),
    KOTAMITRA_DATA_FILE: path.join(tempDir, 'businesses.json'),
    KOTAMITRA_SESSIONS_FILE: path.join(tempDir, 'sessions.json'),
    KOTAMITRA_ADMIN_EMAIL: 'claim-admin@example.test',
    KOTAMITRA_ADMIN_PASSWORD: 'claim-admin-password'
  };
}

async function request(route, options = {}) {
  const resp = await fetch(`${BASE}${route}`, options);
  const text = await resp.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  return { status: resp.status, body };
}

function jsonOptions(value, headers = {}) {
  return { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(value) };
}

async function startServer(tempDir) {
  const env = createEnv(tempDir);
  const server = spawn(process.execPath, [path.join(__dirname, 'server.js')], { env, stdio: 'ignore' });
  await wait(500);
  return server;
}

async function obtainCustomerToken(phone) {
  await request('/api/auth/request-otp', jsonOptions({ phone }));
  const verify = await request('/api/auth/verify-otp', jsonOptions({ phone, otp: '123456' }));
  if (verify.status !== 200) throw new Error(`Customer OTP verify failed for ${phone}`);
  return verify.body.accessToken;
}

async function createBusiness(phone, name = 'Claim Biz') {
  const res = await request('/api/businesses', jsonOptions({
    name,
    category: 'Tiffin & Food',
    ownerName: 'Owner',
    phone,
    state: 'Rajasthan',
    city: 'Kota',
    area: 'Talwandi',
    address: '12 Road'
  }));
  if (res.status !== 201) throw new Error('Business creation failed');
  return res.body.business.id;
}

function assertCondition(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function run() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kotamitra-claim-hardening-'));
  let server = await startServer(tempDir);

  try {
    const ownerPhone = '9876543210';
    const otherPhone = '9876543222';
    const businessId = await createBusiness(ownerPhone, 'Biz One');
    const businessIdTwo = await createBusiness(ownerPhone, 'Biz Two');

    const customerToken = await obtainCustomerToken(ownerPhone);
    const otherToken = await obtainCustomerToken(otherPhone);
    const authHeader = { Authorization: `Bearer ${customerToken}` };
    const otherAuthHeader = { Authorization: `Bearer ${otherToken}` };

    // 1. Phone mismatch test (other customer tries to claim ownerPhone's business)
    const mismatchRes = await request('/api/owner/claim', {
      method: 'POST',
      headers: { ...otherAuthHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ businessId })
    });
    assertCondition(mismatchRes.status === 403 && /Ownership verification failed/.test(mismatchRes.body.error), 'Phone mismatch claim not rejected with 403');

    // 2. Successful claim test
    const claimRes = await request('/api/owner/claim', {
      method: 'POST',
      headers: { ...authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ businessId })
    });
    assertCondition(claimRes.status === 200 && claimRes.body.role === 'owner' && claimRes.body.business.ownerClaimed === true, 'Successful business claim failed');

    // 3. Already claimed conflict test (409)
    const repeatClaimRes = await request('/api/owner/claim', {
      method: 'POST',
      headers: { ...authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ businessId })
    });
    assertCondition(repeatClaimRes.status === 409 && /already been claimed/.test(repeatClaimRes.body.error), 'Already claimed business claim did not return 409');

    // 4. Rate-limiting test on /api/owner/claim (limit: 10 per minute)
    // We attempt 11 rapid claims for businessIdTwo using another fresh customer
    const ratePhone = '9876543233';
    const rateBusinessId = await createBusiness(ratePhone, 'Rate Biz');
    const rateToken = await obtainCustomerToken(ratePhone);
    const rateAuth = { Authorization: `Bearer ${rateToken}` };

    let lastStatus = 200;
    for (let i = 0; i < 12; i++) {
      const res = await request('/api/owner/claim', {
        method: 'POST',
        headers: { ...rateAuth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId: rateBusinessId })
      });
      lastStatus = res.status;
      if (res.status === 429) break;
    }
    assertCondition(lastStatus === 429, 'Claim endpoint rate-limiting did not trigger 429');

    // 5. Session persistence across server restarts test
    server.kill();
    await wait(1000);
    server = await startServer(tempDir);

    // Verify that the customerToken whose session was upgraded to owner is still valid as owner after restart
    const ownerBusinessesRes = await request('/api/owner/businesses', {
      headers: { Authorization: `Bearer ${customerToken}` }
    });
    assertCondition(ownerBusinessesRes.status === 200 && ownerBusinessesRes.body.businesses.length === 2, 'Owner session did not persist across server restart');

    console.log('All claim hardening & ownership persistence tests passed');
  } finally {
    server.kill();
  }
}

run().catch(err => {
  console.error('Claim hardening test failed:', err.message);
  process.exitCode = 1;
});
