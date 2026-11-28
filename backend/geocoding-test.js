'use strict';
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const PORT = 4317;
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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kotamitra-geo-test-'));
}

function spawnServer(tempDir) {
  return spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    env: {
      ...process.env,
      PORT: String(PORT),
      KOTAMITRA_DB_BACKEND: 'sqlite',
      KOTAMITRA_DB_PATH: path.join(tempDir, 'test.db'),
      KOTAMITRA_ADMIN_EMAIL: 'geo-admin@example.test',
      KOTAMITRA_ADMIN_PASSWORD: 'geo-admin-password',
      KOTAMITRA_PAYMENT_DRY_RUN: 'true'
    },
    stdio: 'ignore'
  });
}

// Register a business, approve it via admin, return its id
async function registerAndApprove(adminToken, biz) {
  const reg = await fetch(`${BASE}/api/businesses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(biz)
  });
  if (reg.status !== 201) throw new Error(`Registration failed: ${reg.status}`);
  const { business } = await reg.json();
  const approve = await fetch(`${BASE}/api/businesses/${business.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
    body: JSON.stringify({ status: 'approved' })
  });
  if (!approve.ok) throw new Error(`Approval failed: ${approve.status}`);
  return business.id;
}

async function run() {
  console.log('\nGeocoding & Distance Tests');
  console.log('──────────────────────────');

  const tempDir = makeTempDir();
  const server = spawnServer(tempDir);
  await wait(1400);

  try {
    // ── Admin login ────────────────────────────────────────────────────────
    const loginRes = await fetch(`${BASE}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'geo-admin@example.test', password: 'geo-admin-password' })
    });
    assert(loginRes.ok, `Admin login failed: ${loginRes.status}`);
    const { accessToken: adminToken } = await loginRes.json();

    // ── Validation tests ───────────────────────────────────────────────────

    await test('POST /api/businesses rejects latitude > 90', async () => {
      const r = await fetch(`${BASE}/api/businesses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Bad Lat Biz', category: 'Bakery & Cakes', ownerName: 'Owner',
          phone: '9000000001', state: 'Rajasthan', city: 'Kota', address: '1 Test Road',
          latitude: 91, longitude: 75.83
        })
      });
      assert(r.status === 400, `Expected 400, got ${r.status}`);
      const data = await r.json();
      assert(data.error && data.error.includes('Latitude'), `Expected latitude error, got: ${data.error}`);
    });

    await test('POST /api/businesses rejects latitude < -90', async () => {
      const r = await fetch(`${BASE}/api/businesses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Bad Lat Biz 2', category: 'Bakery & Cakes', ownerName: 'Owner',
          phone: '9000000002', state: 'Rajasthan', city: 'Kota', address: '1 Test Road',
          latitude: -91, longitude: 75.83
        })
      });
      assert(r.status === 400, `Expected 400, got ${r.status}`);
    });

    await test('POST /api/businesses rejects longitude > 180', async () => {
      const r = await fetch(`${BASE}/api/businesses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Bad Lng Biz', category: 'Bakery & Cakes', ownerName: 'Owner',
          phone: '9000000003', state: 'Rajasthan', city: 'Kota', address: '1 Test Road',
          latitude: 25.17, longitude: 181
        })
      });
      assert(r.status === 400, `Expected 400, got ${r.status}`);
    });

    await test('POST /api/businesses accepts business without coordinates', async () => {
      const r = await fetch(`${BASE}/api/businesses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'No-Coord Biz', category: 'Bakery & Cakes', ownerName: 'Owner',
          phone: '9000000004', state: 'Rajasthan', city: 'Kota', address: '1 Test Road'
        })
      });
      assert(r.status === 201, `Expected 201, got ${r.status}`);
      const data = await r.json();
      assert(data.business.latitude === null, 'latitude should be null when omitted');
      assert(data.business.longitude === null, 'longitude should be null when omitted');
    });

    await test('POST /api/businesses persists valid coordinates', async () => {
      const r = await fetch(`${BASE}/api/businesses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Coord Biz', category: 'Bakery & Cakes', ownerName: 'Owner',
          phone: '9000000005', state: 'Rajasthan', city: 'Kota', address: '1 Test Road',
          latitude: 25.17, longitude: 75.83
        })
      });
      assert(r.status === 201, `Expected 201, got ${r.status}`);
      const data = await r.json();
      assert(data.business.latitude === 25.17, `latitude mismatch: ${data.business.latitude}`);
      assert(data.business.longitude === 75.83, `longitude mismatch: ${data.business.longitude}`);
    });

    // ── Distance & sorting tests ───────────────────────────────────────────
    // Kota city center ≈ 25.1800, 75.8333
    // Near biz: 25.1700, 75.8300 — ~1.2 km from query point (25.1650, 75.8250)
    // Far biz:  25.2500, 75.9000 — ~11+ km from query point

    const nearId = await registerAndApprove(adminToken, {
      name: 'Near Bakery',
      category: 'Bakery & Cakes', ownerName: 'Near Owner',
      phone: '9100000011', state: 'Rajasthan', city: 'Kota', address: '1 Near Road',
      latitude: 25.1700, longitude: 75.8300
    });

    const farId = await registerAndApprove(adminToken, {
      name: 'Far Bakery',
      category: 'Bakery & Cakes', ownerName: 'Far Owner',
      phone: '9100000022', state: 'Rajasthan', city: 'Kota', address: '2 Far Road',
      latitude: 25.2500, longitude: 75.9000
    });

    await test('GET /api/businesses with lat/lng attaches distanceKm to results', async () => {
      const r = await fetch(`${BASE}/api/businesses?lat=25.1650&lng=75.8250`);
      assert(r.ok, `Expected 200, got ${r.status}`);
      const data = await r.json();
      const geo = data.businesses.filter(b => b.distanceKm !== undefined && b.distanceKm !== null);
      assert(geo.length >= 2, `Expected at least 2 businesses with distanceKm, got ${geo.length}`);
      geo.forEach(b => assert(typeof b.distanceKm === 'number', `distanceKm should be a number for ${b.name}`));
    });

    await test('GET /api/businesses with lat/lng sorts nearest first', async () => {
      const r = await fetch(`${BASE}/api/businesses?lat=25.1650&lng=75.8250`);
      assert(r.ok, `Expected 200, got ${r.status}`);
      const data = await r.json();
      const withCoords = data.businesses.filter(b => b.distanceKm !== undefined && b.distanceKm !== null);
      assert(withCoords.length >= 2, 'Need at least 2 businesses with coords');
      // Near should appear before far
      const nearIdx = withCoords.findIndex(b => b.id === nearId);
      const farIdx = withCoords.findIndex(b => b.id === farId);
      assert(nearIdx !== -1, 'Near business not in results');
      assert(farIdx !== -1, 'Far business not in results');
      assert(nearIdx < farIdx, `Near business (idx ${nearIdx}) should come before far (idx ${farIdx})`);
    });

    await test('GET /api/businesses with lat/lng near business has smaller distanceKm', async () => {
      const r = await fetch(`${BASE}/api/businesses?lat=25.1650&lng=75.8250`);
      const data = await r.json();
      const near = data.businesses.find(b => b.id === nearId);
      const far = data.businesses.find(b => b.id === farId);
      assert(near && far, 'Both businesses should appear in results');
      assert(near.distanceKm < far.distanceKm, `Near (${near.distanceKm} km) should be less than far (${far.distanceKm} km)`);
    });

    await test('GET /api/businesses with radius=5 excludes far business', async () => {
      const r = await fetch(`${BASE}/api/businesses?lat=25.1650&lng=75.8250&radius=5`);
      assert(r.ok, `Expected 200, got ${r.status}`);
      const data = await r.json();
      assert(data.businesses.some(b => b.id === nearId), 'Near business should be within 5 km radius');
      assert(!data.businesses.some(b => b.id === farId), 'Far business should be filtered out by 5 km radius');
    });

    await test('GET /api/businesses without lat/lng returns no distanceKm field', async () => {
      const r = await fetch(`${BASE}/api/businesses`);
      assert(r.ok, `Expected 200, got ${r.status}`);
      const data = await r.json();
      const withDist = data.businesses.filter(b => b.distanceKm !== undefined && b.distanceKm !== null);
      assert(withDist.length === 0, `Expected no distanceKm without lat/lng, got ${withDist.length}`);
    });

    await test('GET /api/businesses with radius but no lat/lng ignores radius filter', async () => {
      const r = await fetch(`${BASE}/api/businesses?radius=1`);
      assert(r.ok, `Expected 200, got ${r.status}`);
      const data = await r.json();
      // Both should appear since no reference point was given
      assert(data.businesses.some(b => b.id === nearId), 'Near business should still appear');
      assert(data.businesses.some(b => b.id === farId), 'Far business should still appear');
    });

    await test('Haversine distance calculation is accurate (< 0.5 km tolerance)', async () => {
      const r = await fetch(`${BASE}/api/businesses?lat=25.1700&lng=75.8300`);
      const data = await r.json();
      // Near biz is AT the same coords as the query point — distance should be ~0
      const near = data.businesses.find(b => b.id === nearId);
      assert(near, 'Near business should be in results');
      assert(near.distanceKm < 0.5, `Expected near ~0 km, got ${near.distanceKm}`);
    });

  } finally {
    server.kill();
    await wait(400);
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  }

  console.log('');
  if (failed === 0) {
    console.log(`All ${passed} geocoding tests passed.`);
  } else {
    console.log(`${passed} passed, ${failed} failed.`);
    process.exit(1);
  }
}

run().catch(err => { console.error(err); process.exit(1); });
