const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const PORT = 4312;
const BASE = `http://localhost:${PORT}`;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function run() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kotamitra-review-test-'));
  const tempDataFile = path.join(tempDir, 'businesses.json');
  const tempSessionsFile = path.join(tempDir, 'sessions.json');

  const server = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    env: {
      ...process.env,
      PORT: String(PORT),
      KOTAMITRA_DATA_FILE: tempDataFile,
      KOTAMITRA_SESSIONS_FILE: tempSessionsFile,
      KOTAMITRA_ADMIN_EMAIL: 'review-admin@example.test',
      KOTAMITRA_ADMIN_PASSWORD: 'review-admin-password',
      KOTAMITRA_OTP_DRY_RUN: 'true'
    },
    stdio: 'ignore'
  });
  await wait(1200);

  function assert(cond, msg) {
    if (!cond) throw new Error(msg);
  }

  try {
    // 1. Seed business & admin login
    const adminLoginRes = await fetch(`${BASE}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'review-admin@example.test', password: 'review-admin-password' })
    });
    assert(adminLoginRes.status === 200, 'Admin login failed');
    const adminData = await adminLoginRes.json();
    const adminAuthHeader = `Bearer ${adminData.accessToken}`;

    // Register a business as owner
    const bizRes = await fetch(`${BASE}/api/businesses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Review Test Bistro',
        category: 'Tiffin & Food',
        ownerName: 'Test Owner',
        phone: '9876543210',
        state: 'Rajasthan',
        city: 'Kota',
        area: 'Talwandi',
        address: '123 Test Street'
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

    // 2. Customer Authentication
    const customerPhone = '9876543222';
    await fetch(`${BASE}/api/auth/request-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: customerPhone })
    });
    const verifyRes = await fetch(`${BASE}/api/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: customerPhone, otp: '123456' })
    });
    assert(verifyRes.status === 200, 'Customer OTP verification failed');
    const verifyData = await verifyRes.json();
    const customerAuthHeader = `Bearer ${verifyData.accessToken}`;

    // 3. Test Review Validation
    // Invalid rating (> 5)
    const badRatingRes = await fetch(`${BASE}/api/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': customerAuthHeader },
      body: JSON.stringify({ businessId, rating: 6, comment: 'Great food!' })
    });
    assert(badRatingRes.status === 400, 'Should reject rating > 5');

    // Comment too short (< 5 chars)
    const shortCommentRes = await fetch(`${BASE}/api/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': customerAuthHeader },
      body: JSON.stringify({ businessId, rating: 5, comment: 'Good' })
    });
    assert(shortCommentRes.status === 400, 'Should reject short comment');

    // 4. Successful Review Submission
    const validReviewRes = await fetch(`${BASE}/api/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': customerAuthHeader },
      body: JSON.stringify({ businessId, rating: 5, comment: 'Amazing authentic food and excellent service!' })
    });
    assert(validReviewRes.status === 201, 'Valid review submission failed');
    const reviewJson = await validReviewRes.json();
    const reviewId = reviewJson.review.id;
    assert(reviewJson.review.status === 'pending', 'New review status should be pending');

    // 5. Duplicate Review Prevention
    const duplicateRes = await fetch(`${BASE}/api/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': customerAuthHeader },
      body: JSON.stringify({ businessId, rating: 4, comment: 'Another review attempt by same user.' })
    });
    assert(duplicateRes.status === 409, 'Should block duplicate review by same customer');

    // 6. Admin Moderation & Approval
    const adminApproveRes = await fetch(`${BASE}/api/admin/reviews/${reviewId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': adminAuthHeader },
      body: JSON.stringify({ status: 'approved' })
    });
    assert(adminApproveRes.status === 200, 'Admin review approval failed');

    // 7. Public Review Retrieval & Aggregation Summary
    const publicReviewsRes = await fetch(`${BASE}/api/businesses/${businessId}/reviews`);
    assert(publicReviewsRes.status === 200, 'Failed to fetch public reviews');
    const publicReviewsJson = await publicReviewsRes.json();
    assert(publicReviewsJson.summary.totalReviews === 1, 'Total reviews count should be 1');
    assert(publicReviewsJson.summary.averageRating === 5.0, 'Average rating should be 5.0');
    assert(publicReviewsJson.reviews.length === 1, 'Should return 1 approved review');
    assert(publicReviewsJson.reviews[0].comment === 'Amazing authentic food and excellent service!', 'Review comment mismatch');

    console.log('All Review & Rating integration tests passed successfully!');
  } finally {
    server.kill();
  }
}

run().catch(err => {
  console.error('Review integration test failed:', err.message);
  process.exitCode = 1;
});
