'use strict';
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const PORT = 4318;
const BASE = `http://localhost:${PORT}`;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function test(label, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${label}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${label}: ${err.message}`);
  }
}

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kotamitra-inv-test-'));
}

function spawnServer(tempDir) {
  return spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    env: {
      ...process.env,
      PORT: String(PORT),
      KOTAMITRA_DB_BACKEND: 'sqlite',
      KOTAMITRA_DB_PATH: path.join(tempDir, 'test.db'),
      KOTAMITRA_ADMIN_EMAIL: 'inv-admin@example.test',
      KOTAMITRA_ADMIN_PASSWORD: 'inv-admin-password',
      KOTAMITRA_PAYMENT_DRY_RUN: 'true'
    },
    stdio: 'ignore'
  });
}

async function run() {
  console.log('\nInventory & Availability Tests');
  console.log('──────────────────────────────');

  const tempDir = makeTempDir();
  const server = spawnServer(tempDir);
  await wait(1400);

  try {
    // 1. Admin login
    const loginRes = await fetch(`${BASE}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'inv-admin@example.test', password: 'inv-admin-password' })
    });
    assert(loginRes.ok, 'Admin login failed');
    const { accessToken: adminToken } = await loginRes.json();

    // 2. Register business
    const regRes = await fetch(`${BASE}/api/businesses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Inventory Bakery',
        category: 'Bakery & Cakes',
        ownerName: 'Inv Owner',
        phone: '9200000001',
        state: 'Rajasthan',
        city: 'Kota',
        address: '10 Inventory Road'
      })
    });
    assert(regRes.status === 201, 'Business registration failed');
    const { business } = await regRes.json();
    const businessId = business.id;

    // Approve business
    await fetch(`${BASE}/api/businesses/${businessId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ status: 'approved' })
    });

    // Owner OTP login & claim
    await fetch(`${BASE}/api/auth/request-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '9200000001' })
    });
    const otpRes = await fetch(`${BASE}/api/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '9200000001', otp: '123456' })
    });
    const { accessToken: ownerToken } = await otpRes.json();

    await fetch(`${BASE}/api/owner/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ownerToken}` },
      body: JSON.stringify({ businessId })
    });

    await test('Owner creates catalog item with stock tracking', async () => {
      const res = await fetch(`${BASE}/api/owner/catalog`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ownerToken}` },
        body: JSON.stringify({
          businessId,
          name: 'Stocked Cake',
          price: 500,
          stockQuantity: 5,
          trackStock: true,
          lowStockThreshold: 2
        })
      });
      assert(res.status === 201, `Expected 201, got ${res.status}`);
      const data = await res.json();
      assert(data.item.stockQuantity === 5, 'stockQuantity should be 5');
      assert(data.item.trackStock === true, 'trackStock should be true');
    });

    // Customer OTP login
    await fetch(`${BASE}/api/auth/request-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '9300000002' })
    });
    const custOtpRes = await fetch(`${BASE}/api/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '9300000002', otp: '123456' })
    });
    const { accessToken: custToken } = await custOtpRes.json();

    await test('Order succeeds when stock is sufficient and decrements stock', async () => {
      const res = await fetch(`${BASE}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${custToken}`, 'Origin': BASE },
        body: JSON.stringify({
          businessId,
          customerName: 'Customer One',
          customerPhone: '9300000002',
          items: [{ name: 'Stocked Cake', quantity: 2, price: 500 }],
          deliveryAddress: '12 Customer St'
        })
      });
      assert(res.status === 201, `Expected 201, got ${res.status}`);

      // Verify catalog stock is now 3
      const catRes = await fetch(`${BASE}/api/businesses/${businessId}/catalog`);
      const catData = await catRes.json();
      const item = catData.items.find(i => i.name === 'Stocked Cake');
      assert(item.stockQuantity === 3, `Stock should be decremented to 3, got ${item.stockQuantity}`);
    });

    await test('Order fails with 400 when quantity exceeds available stock', async () => {
      const res = await fetch(`${BASE}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${custToken}`, 'Origin': BASE },
        body: JSON.stringify({
          businessId,
          customerName: 'Customer One',
          customerPhone: '9300000002',
          items: [{ name: 'Stocked Cake', quantity: 10, price: 500 }],
          deliveryAddress: '12 Customer St'
        })
      });
      assert(res.status === 400, `Expected 400 for out-of-stock, got ${res.status}`);
    });

  } finally {
    server.kill();
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
    console.log(`\nTests passed: ${passed}, failed: ${failed}`);
    if (failed > 0) process.exit(1);
  }
}

run();
