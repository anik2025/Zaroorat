const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');

const PORT = 4313;
const BASE = `http://localhost:${PORT}`;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function run() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kotamitra-payment-test-'));
  const tempDataFile = path.join(tempDir, 'businesses.json');
  const tempSessionsFile = path.join(tempDir, 'sessions.json');

  const server = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    env: {
      ...process.env,
      PORT: String(PORT),
      KOTAMITRA_DATA_FILE: tempDataFile,
      KOTAMITRA_SESSIONS_FILE: tempSessionsFile,
      KOTAMITRA_ADMIN_EMAIL: 'payment-admin@example.test',
      KOTAMITRA_ADMIN_PASSWORD: 'payment-admin-password',
      KOTAMITRA_PAYMENT_DRY_RUN: 'true'
    },
    stdio: 'ignore'
  });
  await wait(1200);

  function assert(cond, msg) {
    if (!cond) throw new Error(msg);
  }

  try {
    // 1. Admin login & approve business
    const adminLoginRes = await fetch(`${BASE}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'payment-admin@example.test', password: 'payment-admin-password' })
    });
    assert(adminLoginRes.status === 200, 'Admin login failed');
    const adminData = await adminLoginRes.json();
    const adminAuthHeader = `Bearer ${adminData.accessToken}`;

    // Register a business as owner
    const bizRes = await fetch(`${BASE}/api/businesses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Payment Test Cafe',
        category: 'Tiffin & Food',
        ownerName: 'Payment Owner',
        phone: '9876543333',
        state: 'Rajasthan',
        city: 'Kota',
        area: 'Talwandi',
        address: '456 Test Avenue'
      })
    });
    assert(bizRes.status === 201, 'Business registration failed');
    const bizJson = await bizRes.json();
    const businessId = bizJson.business.id;

    // Admin approves business
    const approveBizRes = await fetch(`${BASE}/api/businesses/${businessId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': adminAuthHeader },
      body: JSON.stringify({ status: 'approved', isVerified: true })
    });
    assert(approveBizRes.status === 200, 'Business approval failed');

    // 2. Owner OTP login
    const ownerPhone = '9876543333';
    await fetch(`${BASE}/api/auth/request-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: ownerPhone })
    });
    const verifyRes = await fetch(`${BASE}/api/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: ownerPhone, otp: '123456' })
    });
    assert(verifyRes.status === 200, 'Owner OTP verification failed');
    const verifyData = await verifyRes.json();
    const ownerAuthHeader = `Bearer ${verifyData.accessToken}`;

    // Claim business as owner
    const claimRes = await fetch(`${BASE}/api/owner/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': ownerAuthHeader },
      body: JSON.stringify({ businessId })
    });
    assert(claimRes.status === 200, 'Owner claim failed');

    // 3. Get subscription plans
    const plansRes = await fetch(`${BASE}/api/subscriptions/plans`);
    assert(plansRes.status === 200, 'Failed to fetch subscription plans');
    const plansJson = await plansRes.json();
    assert(plansJson.plans.length > 0, 'Should have subscription plans');
    const featuredPlanId = plansJson.plans.find(p => p.tier === 'featured').id;

    // 4. Create subscription order
    const orderRes = await fetch(`${BASE}/api/owner/subscriptions/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': ownerAuthHeader },
      body: JSON.stringify({ businessId, planId: featuredPlanId })
    });
    assert(orderRes.status === 201, 'Failed to create subscription order');
    const orderJson = await orderRes.json();
    assert(orderJson.orderId, 'Order ID should be returned');
    assert(orderJson.amount > 0, 'Amount should be greater than 0');

    // 5. Verify payment and activate subscription
    const verifyPaymentRes = await fetch(`${BASE}/api/owner/subscriptions/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': ownerAuthHeader },
      body: JSON.stringify({
        businessId,
        orderId: orderJson.orderId,
        paymentId: 'pay_mock_' + Date.now(),
        signature: 'sig_mock_' + Date.now()
      })
    });
    assert(verifyPaymentRes.status === 200, 'Subscription payment verification failed');
    const verifyPaymentJson = await verifyPaymentRes.json();
    assert(verifyPaymentJson.subscription.status === 'active', 'Subscription status should be active');

    // 6. Check owner subscriptions list & business featured status
    const ownerSubsRes = await fetch(`${BASE}/api/owner/subscriptions`, {
      headers: { 'Authorization': ownerAuthHeader }
    });
    assert(ownerSubsRes.status === 200, 'Failed to fetch owner subscriptions');
    const ownerSubsJson = await ownerSubsRes.json();
    assert(ownerSubsJson.subscriptions.length === 1, 'Should have 1 active subscription');
    assert(ownerSubsJson.subscriptions[0].planId === featuredPlanId, 'Plan ID should match');

    // Check public business profile has isFeatured = true
    const publicBizRes = await fetch(`${BASE}/api/businesses?status=approved`);
    assert(publicBizRes.status === 200, 'Failed to fetch businesses');
    const publicBizJson = await publicBizRes.json();
    const business = publicBizJson.businesses.find(b => b.id === businessId);
    assert(business, 'Business not found in list');
    assert(business.isFeatured === true, 'Business should be marked as featured');

    console.log('All Payments & Subscriptions integration tests passed successfully!');
  } finally {
    server.kill();
  }
}

run().catch(err => {
  console.error('Payment integration test failed:', err.message);
  process.exitCode = 1;
});
