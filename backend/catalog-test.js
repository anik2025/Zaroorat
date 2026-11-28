const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');

const PORT = 4314;
const BASE = `http://localhost:${PORT}`;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function run() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kotamitra-catalog-test-'));
  const tempDataFile = path.join(tempDir, 'businesses.json');
  const tempSessionsFile = path.join(tempDir, 'sessions.json');

  const server = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    env: {
      ...process.env,
      PORT: String(PORT),
      KOTAMITRA_DATA_FILE: tempDataFile,
      KOTAMITRA_SESSIONS_FILE: tempSessionsFile,
      KOTAMITRA_ADMIN_EMAIL: 'catalog-admin@example.test',
      KOTAMITRA_ADMIN_PASSWORD: 'catalog-admin-password',
      KOTAMITRA_PAYMENT_DRY_RUN: 'true'
    },
    stdio: 'ignore'
  });
  await wait(1200);

  let passed = 0;
  let failed = 0;

  function assert(cond, msg) {
    if (!cond) throw new Error(msg);
  }

  function pass(label) {
    passed++;
    console.log(`  ✓ ${label}`);
  }

  async function test(label, fn) {
    try {
      await fn();
      pass(label);
    } catch (err) {
      failed++;
      console.error(`  ✗ ${label}: ${err.message}`);
    }
  }

  try {
    // --- Setup: Admin login, register + approve business, owner OTP + claim ---
    const adminRes = await fetch(`${BASE}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'catalog-admin@example.test', password: 'catalog-admin-password' })
    });
    assert(adminRes.status === 200, 'Admin login failed');
    const { accessToken: adminToken } = await adminRes.json();
    const adminAuth = `Bearer ${adminToken}`;

    const bizRes = await fetch(`${BASE}/api/businesses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Catalog Test Bakery',
        category: 'Bakery & Cakes',
        ownerName: 'Catalog Owner',
        phone: '9988776655',
        state: 'Rajasthan',
        city: 'Kota',
        area: 'Talwandi',
        address: '10 Catalog Street'
      })
    });
    assert(bizRes.status === 201, `Business registration failed: ${bizRes.status}`);
    const { business } = await bizRes.json();
    const businessId = business.id;

    await fetch(`${BASE}/api/businesses/${businessId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: adminAuth },
      body: JSON.stringify({ status: 'approved', isVerified: true })
    });

    const ownerPhone = '9988776655';
    await fetch(`${BASE}/api/auth/request-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: ownerPhone })
    });
    const otpRes = await fetch(`${BASE}/api/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: ownerPhone, otp: '123456' })
    });
    assert(otpRes.status === 200, 'Owner OTP verification failed');
    const { accessToken: ownerToken } = await otpRes.json();
    const ownerAuth = `Bearer ${ownerToken}`;

    await fetch(`${BASE}/api/owner/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: ownerAuth },
      body: JSON.stringify({ businessId })
    });

    console.log('\nCatalog Management Tests');
    console.log('------------------------');

    // 1. Public catalog starts empty
    await test('Public catalog is empty on new business', async () => {
      const res = await fetch(`${BASE}/api/businesses/${businessId}/catalog`);
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const data = await res.json();
      assert(Array.isArray(data.items), 'items should be an array');
      assert(data.items.length === 0, 'Should start with 0 items');
    });

    // 2. Owner adds a catalog item
    let itemId;
    await test('Owner adds a catalog item', async () => {
      const res = await fetch(`${BASE}/api/owner/catalog`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: ownerAuth },
        body: JSON.stringify({
          businessId,
          name: 'Chocolate Truffle Cake',
          description: '500g rich chocolate cake',
          price: 650,
          category: 'Cakes',
          inStock: true,
          imageUrl: ''
        })
      });
      assert(res.status === 201, `Expected 201, got ${res.status}`);
      const data = await res.json();
      assert(data.item.name === 'Chocolate Truffle Cake', 'Name mismatch');
      assert(data.item.price === 650, 'Price mismatch');
      assert(data.item.inStock === true, 'inStock mismatch');
      assert(data.item.id, 'Should have an id');
      itemId = data.item.id;
    });

    // 3. Owner adds a second item
    let item2Id;
    await test('Owner adds a second catalog item', async () => {
      const res = await fetch(`${BASE}/api/owner/catalog`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: ownerAuth },
        body: JSON.stringify({
          businessId,
          name: 'Red Velvet Pastry',
          description: 'Single serving pastry',
          price: 80,
          category: 'Pastries',
          inStock: true
        })
      });
      assert(res.status === 201, `Expected 201, got ${res.status}`);
      item2Id = (await res.json()).item.id;
      assert(item2Id, 'Should have id');
    });

    // 4. Public catalog now shows 2 items
    await test('Public catalog shows 2 items after adds', async () => {
      const res = await fetch(`${BASE}/api/businesses/${businessId}/catalog`);
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const data = await res.json();
      assert(data.items.length === 2, `Expected 2 items, got ${data.items.length}`);
    });

    // 5. Owner reads own catalog via authenticated endpoint
    await test('Owner reads own catalog with correct businessId', async () => {
      const res = await fetch(`${BASE}/api/owner/catalog?businessId=${businessId}`, {
        headers: { Authorization: ownerAuth }
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const data = await res.json();
      assert(data.items.length === 2, `Expected 2 items, got ${data.items.length}`);
    });

    // 6. Owner updates a catalog item
    await test('Owner updates a catalog item', async () => {
      const res = await fetch(`${BASE}/api/owner/catalog/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: ownerAuth },
        body: JSON.stringify({ name: 'Chocolate Truffle Cake (1kg)', price: 1200, inStock: true })
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const data = await res.json();
      assert(data.item.name === 'Chocolate Truffle Cake (1kg)', 'Name not updated');
      assert(data.item.price === 1200, 'Price not updated');
    });

    // 7. Owner marks item out of stock
    await test('Owner marks item out of stock', async () => {
      const res = await fetch(`${BASE}/api/owner/catalog/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: ownerAuth },
        body: JSON.stringify({ inStock: false })
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const data = await res.json();
      assert(data.item.inStock === false, 'inStock should be false');
    });

    // 8. Owner deletes a catalog item
    await test('Owner deletes a catalog item', async () => {
      const res = await fetch(`${BASE}/api/owner/catalog/${item2Id}`, {
        method: 'DELETE',
        headers: { Authorization: ownerAuth }
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const data = await res.json();
      assert(data.ok === true, 'Should return ok:true');
    });

    // 9. Public catalog no longer shows deleted item
    await test('Public catalog hides deleted item', async () => {
      const res = await fetch(`${BASE}/api/businesses/${businessId}/catalog`);
      const data = await res.json();
      assert(data.items.length === 1, `Expected 1 item after delete, got ${data.items.length}`);
      assert(data.items[0].id === itemId, 'Remaining item should be the first item');
    });

    // 10. Upload: reject non-image base64 content type
    await test('Upload rejects unsupported image type', async () => {
      const fakeGifData = `data:image/gif;base64,${Buffer.from('GIF89a').toString('base64')}`;
      const res = await fetch(`${BASE}/api/owner/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: ownerAuth },
        body: JSON.stringify({ data: fakeGifData })
      });
      assert(res.status === 400, `Expected 400, got ${res.status}`);
    });

    // 11. Upload: reject data URI that's too large
    await test('Upload rejects oversized image (>3MB)', async () => {
      const bigData = `data:image/png;base64,${Buffer.alloc(4 * 1024 * 1024, 0x41).toString('base64')}`;
      const res = await fetch(`${BASE}/api/owner/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: ownerAuth },
        body: JSON.stringify({ data: bigData })
      });
      assert(res.status === 413, `Expected 413, got ${res.status}`);
    });

    // 12. Upload: accept valid base64 PNG
    let uploadedUrl;
    await test('Upload accepts valid base64 PNG and returns /uploads/ URL', async () => {
      // 1×1 PNG (smallest valid PNG)
      const minimalPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const res = await fetch(`${BASE}/api/owner/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: ownerAuth },
        body: JSON.stringify({ data: `data:image/png;base64,${minimalPng}` })
      });
      assert(res.status === 201, `Expected 201, got ${res.status}`);
      const data = await res.json();
      assert(data.url && data.url.startsWith('/uploads/'), `Expected /uploads/ URL, got ${data.url}`);
      assert(data.url.endsWith('.png'), 'Should end with .png');
      uploadedUrl = data.url;
    });

    // 13. Uploaded file is publicly accessible
    await test('Uploaded image is publicly accessible via /uploads/', async () => {
      const res = await fetch(`${BASE}${uploadedUrl}`);
      assert(res.status === 200, `Expected 200 for uploaded file, got ${res.status}`);
      assert((res.headers.get('content-type') || '').startsWith('image/png'), 'Should serve as image/png');
    });

    // 14. Catalog item with imageUrl referencing upload
    await test('Owner creates catalog item with uploaded image URL', async () => {
      const res = await fetch(`${BASE}/api/owner/catalog`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: ownerAuth },
        body: JSON.stringify({
          businessId,
          name: 'Strawberry Cake',
          price: 950,
          inStock: true,
          imageUrl: uploadedUrl
        })
      });
      assert(res.status === 201, `Expected 201, got ${res.status}`);
      const data = await res.json();
      assert(data.item.imageUrl === uploadedUrl, 'imageUrl should match uploaded URL');
    });

    // 15. Unauthenticated owner catalog access is rejected
    await test('Unauthenticated POST /api/owner/catalog is rejected', async () => {
      const res = await fetch(`${BASE}/api/owner/catalog`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId, name: 'Hack Cake', price: 0, inStock: true })
      });
      assert(res.status === 401, `Expected 401, got ${res.status}`);
    });

    // 16. Upload without auth is rejected
    await test('Unauthenticated POST /api/owner/upload is rejected', async () => {
      const res = await fetch(`${BASE}/api/owner/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: 'data:image/png;base64,abc' })
      });
      assert(res.status === 401, `Expected 401, got ${res.status}`);
    });

    // 17. Validation: item name too long
    await test('Rejects catalog item with name > 150 chars', async () => {
      const res = await fetch(`${BASE}/api/owner/catalog`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: ownerAuth },
        body: JSON.stringify({ businessId, name: 'A'.repeat(151), price: 100, inStock: true })
      });
      assert(res.status === 400, `Expected 400, got ${res.status}`);
    });

    // 18. Validation: negative price
    await test('Rejects catalog item with negative price', async () => {
      const res = await fetch(`${BASE}/api/owner/catalog`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: ownerAuth },
        body: JSON.stringify({ businessId, name: 'Free Cake', price: -1, inStock: true })
      });
      assert(res.status === 400, `Expected 400, got ${res.status}`);
    });

    // 19. Cross-business access: second owner cannot modify first owner's catalog
    await test('Second owner cannot modify another owner\'s catalog item', async () => {
      // Register and approve second business
      const biz2Res = await fetch(`${BASE}/api/businesses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Second Bakery',
          category: 'Bakery & Cakes',
          ownerName: 'Second Owner',
          phone: '9111222333',
          state: 'Rajasthan', city: 'Kota', area: 'Talwandi',
          address: '20 Second Street'
        })
      });
      const biz2Id = (await biz2Res.json()).business.id;
      await fetch(`${BASE}/api/businesses/${biz2Id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: adminAuth },
        body: JSON.stringify({ status: 'approved' })
      });
      await fetch(`${BASE}/api/auth/request-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '9111222333' })
      });
      const otp2Res = await fetch(`${BASE}/api/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '9111222333', otp: '123456' })
      });
      const { accessToken: owner2Token } = await otp2Res.json();
      const owner2Auth = `Bearer ${owner2Token}`;
      await fetch(`${BASE}/api/owner/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: owner2Auth },
        body: JSON.stringify({ businessId: biz2Id })
      });

      // Try to PATCH item that belongs to owner1
      const res = await fetch(`${BASE}/api/owner/catalog/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: owner2Auth },
        body: JSON.stringify({ price: 1 })
      });
      assert(res.status === 403, `Expected 403, got ${res.status}`);
    });

    // 20. Public catalog of non-existent business returns 404
    await test('Public catalog of non-existent business returns 404', async () => {
      const fakeId = crypto.randomUUID();
      const res = await fetch(`${BASE}/api/businesses/${fakeId}/catalog`);
      assert(res.status === 404, `Expected 404, got ${res.status}`);
    });

    console.log('');
    if (failed === 0) {
      console.log(`All ${passed} catalog integration tests passed successfully!`);
    } else {
      console.error(`${failed} test(s) failed, ${passed} passed.`);
      process.exitCode = 1;
    }
  } finally {
    server.kill();
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  }
}

run().catch(err => {
  console.error('Catalog integration test suite error:', err.message);
  process.exitCode = 1;
});
