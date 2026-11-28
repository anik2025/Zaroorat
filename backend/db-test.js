'use strict';
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');
const dbAdapter = require('./db');

const PORT = 4315;
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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kotamitra-db-test-'));
}

function spawnServer(tempDir, extraEnv = {}) {
  return spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    env: {
      ...process.env,
      PORT: String(PORT),
      KOTAMITRA_DB_BACKEND: 'sqlite',
      KOTAMITRA_DB_PATH: path.join(tempDir, 'test.db'),
      KOTAMITRA_SESSIONS_FILE: path.join(tempDir, 'sessions.json'),
      KOTAMITRA_ADMIN_EMAIL: 'db-admin@example.test',
      KOTAMITRA_ADMIN_PASSWORD: 'db-admin-password',
      KOTAMITRA_PAYMENT_DRY_RUN: 'true',
      ...extraEnv
    },
    stdio: 'ignore'
  });
}

async function run() {
  console.log('\nDB Adapter Unit Tests');
  console.log('─────────────────────');

  // ── Unit tests: adapter in-process (no HTTP) ──────────────────────────────

  await test('initDb creates all tables on a fresh DB', () => {
    const dir = makeTempDir();
    const db = dbAdapter.initDb(path.join(dir, 'fresh.db'));
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
    for (const t of ['businesses', 'sessions', 'customer_otps', 'enquiries', 'orders', 'reviews', 'subscriptions', 'catalog_items', 'schema_migrations']) {
      assert(tables.includes(t), `Missing table: ${t}`);
    }
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  await test('initDb is idempotent — calling it twice causes no error', () => {
    const dir = makeTempDir();
    const dbPath = path.join(dir, 'idem.db');
    const db1 = dbAdapter.initDb(dbPath);
    db1.close();
    const db2 = dbAdapter.initDb(dbPath);
    db2.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  await test('writeData + readData round-trips a business with all fields', () => {
    const dir = makeTempDir();
    const db = dbAdapter.initDb(path.join(dir, 'rt.db'));
    const biz = {
      id: crypto.randomUUID(),
      name: 'Round-Trip Bakery',
      category: 'Bakery & Cakes',
      ownerName: 'Owner One',
      phone: '9000000001',
      whatsapp: '9000000001',
      state: 'Rajasthan',
      city: 'Kota',
      area: 'Talwandi',
      address: '1 Test Road',
      description: 'Test description',
      products: [{ name: 'Cake', price: 500 }],
      pricing: 'Starts at ₹500',
      images: ['https://example.com/img.jpg'],
      status: 'approved',
      isVerified: true,
      isFeatured: false,
      ownerClaimed: true,
      ownerPhone: '9000000001',
      ownerVerifiedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };
    dbAdapter.writeData({ businesses: [biz], enquiries: [], orders: [], reviews: [], subscriptions: [], catalog: {} }, db);
    const data = dbAdapter.readData(db);
    assert(data.businesses.length === 1, 'Should have 1 business');
    const b = data.businesses[0];
    assert(b.id === biz.id, 'id mismatch');
    assert(b.name === biz.name, 'name mismatch');
    assert(b.isVerified === true, 'isVerified mismatch');
    assert(b.ownerClaimed === true, 'ownerClaimed mismatch');
    assert(Array.isArray(b.products) && b.products[0].name === 'Cake', 'products not round-tripped');
    assert(Array.isArray(b.images) && b.images[0] === 'https://example.com/img.jpg', 'images not round-tripped');
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  await test('writeData + readData round-trips enquiries', () => {
    const dir = makeTempDir();
    const db = dbAdapter.initDb(path.join(dir, 'enq.db'));
    const enq = { id: crypto.randomUUID(), businessId: crypto.randomUUID(), customerName: 'Alice', customerPhone: '9000000002', message: 'Is it open?', status: 'new', createdAt: new Date().toISOString() };
    dbAdapter.writeData({ businesses: [], enquiries: [enq], orders: [], reviews: [], subscriptions: [], catalog: {} }, db);
    const data = dbAdapter.readData(db);
    assert(data.enquiries.length === 1, 'Should have 1 enquiry');
    assert(data.enquiries[0].customerName === 'Alice', 'customerName mismatch');
    assert(data.enquiries[0].status === 'new', 'status mismatch');
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  await test('writeData + readData round-trips orders with items array', () => {
    const dir = makeTempDir();
    const db = dbAdapter.initDb(path.join(dir, 'ord.db'));
    const order = { id: crypto.randomUUID(), businessId: crypto.randomUUID(), customerName: 'Bob', customerPhone: '9000000003', items: [{ name: 'Cake', price: 500, quantity: 2 }], totalAmount: 1000, deliveryAddress: '10 Main St', status: 'pending', createdAt: new Date().toISOString() };
    dbAdapter.writeData({ businesses: [], enquiries: [], orders: [order], reviews: [], subscriptions: [], catalog: {} }, db);
    const data = dbAdapter.readData(db);
    assert(data.orders.length === 1, 'Should have 1 order');
    assert(data.orders[0].items[0].name === 'Cake', 'items not round-tripped');
    assert(data.orders[0].totalAmount === 1000, 'totalAmount mismatch');
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  await test('writeData + readData round-trips catalog items including deleted flag', () => {
    const dir = makeTempDir();
    const db = dbAdapter.initDb(path.join(dir, 'cat.db'));
    const bizId = crypto.randomUUID();
    const item = { id: crypto.randomUUID(), businessId: bizId, name: 'Truffle Cake', description: 'Rich', price: 650, category: 'Cakes', inStock: true, imageUrl: '', deleted: false, createdAt: new Date().toISOString() };
    const deletedItem = { ...item, id: crypto.randomUUID(), name: 'Deleted Item', deleted: true };
    dbAdapter.writeData({ businesses: [], enquiries: [], orders: [], reviews: [], subscriptions: [], catalog: { [bizId]: [item, deletedItem] } }, db);
    const data = dbAdapter.readData(db);
    const items = data.catalog[bizId] || [];
    assert(items.length === 2, 'Should have 2 items (including deleted)');
    const live = items.filter(i => !i.deleted);
    assert(live.length === 1, 'Should have 1 live item');
    assert(live[0].price === 650, 'price mismatch');
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  await test('writeSessions + readSessions round-trips sessions and OTPs', () => {
    const dir = makeTempDir();
    const db = dbAdapter.initDb(path.join(dir, 'sess.db'));
    const token = crypto.randomBytes(32).toString('hex');
    const sessMap = new Map([[token, { type: 'owner', phone: '9111000001', createdAt: Date.now(), expiresAt: Date.now() + 3600000, capabilities: ['owner'] }]]);
    const otpMap = new Map([['9111000001', { otpHash: 'abc123', expiresAt: Date.now() + 300000, cooldownUntil: 0, attempts: 0 }]]);
    dbAdapter.writeSessions(db, sessMap, otpMap);
    const { sessionsMap, otpsMap } = dbAdapter.readSessions(db);
    assert(sessionsMap.has(token), 'Session not persisted');
    assert(sessionsMap.get(token).phone === '9111000001', 'phone mismatch');
    assert(otpsMap.has('9111000001'), 'OTP not persisted');
    assert(otpsMap.get('9111000001').otpHash === 'abc123', 'otpHash mismatch');
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  await test('readSessions filters out expired sessions', () => {
    const dir = makeTempDir();
    const db = dbAdapter.initDb(path.join(dir, 'exp.db'));
    const liveToken = crypto.randomBytes(32).toString('hex');
    const deadToken = crypto.randomBytes(32).toString('hex');
    const sessMap = new Map([
      [liveToken,  { type: 'customer', phone: '9222000001', createdAt: Date.now() - 1000, expiresAt: Date.now() + 3600000, capabilities: ['customer'] }],
      [deadToken,  { type: 'customer', phone: '9222000002', createdAt: Date.now() - 10000, expiresAt: Date.now() - 1000, capabilities: ['customer'] }]
    ]);
    dbAdapter.writeSessions(db, sessMap, new Map());
    const { sessionsMap } = dbAdapter.readSessions(db);
    assert(sessionsMap.has(liveToken), 'Live session should be present');
    assert(!sessionsMap.has(deadToken), 'Expired session should be filtered out');
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  await test('upsert (INSERT OR REPLACE) on writeData is idempotent', () => {
    const dir = makeTempDir();
    const db = dbAdapter.initDb(path.join(dir, 'upsert.db'));
    const bizId = crypto.randomUUID();
    const biz = { id: bizId, name: 'Original', category: 'Bakery & Cakes', ownerName: 'O', phone: '9333000001', state: 'Rajasthan', city: 'Kota', area: '', address: '1 St', status: 'pending', isVerified: false, isFeatured: false, ownerClaimed: false, ownerPhone: '', createdAt: new Date().toISOString() };
    const base = { enquiries: [], orders: [], reviews: [], subscriptions: [], catalog: {} };
    dbAdapter.writeData({ ...base, businesses: [biz] }, db);
    const updated = { ...biz, name: 'Updated', status: 'approved' };
    dbAdapter.writeData({ ...base, businesses: [updated] }, db);
    const data = dbAdapter.readData(db);
    assert(data.businesses.length === 1, 'Should still have exactly 1 business');
    assert(data.businesses[0].name === 'Updated', 'Name should be updated');
    assert(data.businesses[0].status === 'approved', 'Status should be updated');
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  await test('migration utility runs without errors on empty JSON', async () => {
    const dir = makeTempDir();
    const jsonFile = path.join(dir, 'businesses.json');
    const dbPath = path.join(dir, 'migrate.db');
    fs.writeFileSync(jsonFile, JSON.stringify({ businesses: [], enquiries: [], orders: [] }, null, 2));
    const result = await new Promise(resolve => {
      const p = spawn(process.execPath, [path.join(__dirname, 'db-migrate.js')], {
        env: { ...process.env, KOTAMITRA_DATA_FILE: jsonFile, KOTAMITRA_DB_PATH: dbPath },
        stdio: ['ignore', 'pipe', 'pipe']
      });
      let out = '';
      p.stdout.on('data', d => { out += d; });
      p.stderr.on('data', d => { out += d; });
      p.on('close', code => resolve({ code, out }));
    });
    assert(result.code === 0, `db-migrate.js exited ${result.code}: ${result.out}`);
    assert(result.out.includes('Migration complete'), `Expected completion message, got: ${result.out}`);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  console.log('\nDB Integration Tests (via HTTP)');
  console.log('────────────────────────────────');

  // ── HTTP integration tests: server speaks SQLite ──────────────────────────

  const tempDir = makeTempDir();
  const dbPath = path.join(tempDir, 'test.db');
  let server = spawnServer(tempDir);
  await wait(1400);

  // Admin login helper
  const adminLogin = async () => {
    const r = await fetch(`${BASE}/api/admin/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'db-admin@example.test', password: 'db-admin-password' })
    });
    return (await r.json()).accessToken;
  };

  await test('Server starts and health endpoint responds with SQLite backend', async () => {
    const r = await fetch(`${BASE}/api/health`);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    const data = await r.json();
    assert(data.ok === true, 'health.ok should be true');
  });

  await test('POST /api/businesses writes to SQLite and can be read back', async () => {
    const r = await fetch(`${BASE}/api/businesses`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'SQLite Bakery', category: 'Bakery & Cakes', ownerName: 'DB Owner', phone: '9444000001', state: 'Rajasthan', city: 'Kota', area: 'Talwandi', address: '5 DB Street' })
    });
    assert(r.status === 201, `Expected 201, got ${r.status}`);
    const data = await r.json();
    assert(data.business.id, 'Should have an id');
    // Verify row is in the SQLite file directly
    const db = dbAdapter.initDb(dbPath);
    const row = db.prepare('SELECT * FROM businesses WHERE id = ?').get(data.business.id);
    assert(row, 'Business row not found in SQLite');
    assert(row.name === 'SQLite Bakery', 'name mismatch in DB');
    db.close();
  });

  await test('Sessions persist in SQLite — login survives across reads', async () => {
    const adminToken = await adminLogin();
    assert(adminToken, 'Should get admin token');
    // Verify session is in the DB
    const db = dbAdapter.initDb(dbPath);
    const row = db.prepare('SELECT * FROM sessions WHERE token = ?').get(adminToken);
    assert(row, 'Session not found in SQLite');
    assert(row.type === 'admin', 'type mismatch');
    db.close();
  });

  await test('Approved business appears in GET /api/businesses from SQLite', async () => {
    const adminToken = await adminLogin();
    // Register + approve
    const bizR = await fetch(`${BASE}/api/businesses`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Approved DB Biz', category: 'Bakery & Cakes', ownerName: 'Owner', phone: '9444000002', state: 'Rajasthan', city: 'Kota', area: 'Talwandi', address: '6 DB St' })
    });
    const { business } = await bizR.json();
    await fetch(`${BASE}/api/businesses/${business.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ status: 'approved' })
    });
    const listR = await fetch(`${BASE}/api/businesses?status=approved`);
    const { businesses } = await listR.json();
    const found = businesses.find(b => b.id === business.id);
    assert(found, 'Approved business not in list');
    assert(found.status === 'approved', 'status should be approved');
  });

  await test('Sessions persist across a server restart with same DB', async () => {
    // Log in, get a token
    const adminToken = await adminLogin();
    // Kill and restart with the same DB path
    server.kill();
    await wait(400);
    server = spawnServer(tempDir);
    await wait(1400);
    // Token should still be valid
    const r = await fetch(`${BASE}/api/admin/me`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(r.status === 200, `Expected 200 after restart, got ${r.status}`);
  });

  await test('review round-trip: submit + admin approve + public read from SQLite', async () => {
    const adminToken = await adminLogin();
    // Setup: register, approve, OTP-login customer, review
    const bR = await fetch(`${BASE}/api/businesses`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Review DB Biz', category: 'Bakery & Cakes', ownerName: 'RO', phone: '9444000003', state: 'Rajasthan', city: 'Kota', area: 'Talwandi', address: '7 DB St' })
    });
    const { business: biz } = await bR.json();
    await fetch(`${BASE}/api/businesses/${biz.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ status: 'approved' })
    });
    await fetch(`${BASE}/api/auth/request-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: '9444000003' }) });
    const otpR = await fetch(`${BASE}/api/auth/verify-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: '9444000003', otp: '123456' }) });
    const { accessToken: custToken } = await otpR.json();
    const revR = await fetch(`${BASE}/api/reviews`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${custToken}` },
      body: JSON.stringify({ businessId: biz.id, rating: 5, comment: 'Great SQLite bakery!' })
    });
    assert(revR.status === 201, `Review submission failed: ${revR.status}`);
    const { review } = await revR.json();
    // Admin approves
    await fetch(`${BASE}/api/admin/reviews/${review.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ status: 'approved' })
    });
    // Public read
    const pubR = await fetch(`${BASE}/api/businesses/${biz.id}/reviews`);
    const pubData = await pubR.json();
    assert(pubData.summary.totalReviews === 1, 'Should have 1 approved review');
    assert(pubData.summary.averageRating === 5, 'Average should be 5');
  });

  await test('catalog item persists in SQLite after add via API', async () => {
    const adminToken = await adminLogin();
    // Register + approve + claim
    const bR = await fetch(`${BASE}/api/businesses`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Catalog DB Biz', category: 'Bakery & Cakes', ownerName: 'CO', phone: '9444000004', state: 'Rajasthan', city: 'Kota', area: 'Talwandi', address: '8 DB St' })
    });
    const { business: biz } = await bR.json();
    await fetch(`${BASE}/api/businesses/${biz.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ status: 'approved' })
    });
    await fetch(`${BASE}/api/auth/request-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: '9444000004' }) });
    const otpR = await fetch(`${BASE}/api/auth/verify-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: '9444000004', otp: '123456' }) });
    const { accessToken: ownerToken } = await otpR.json();
    await fetch(`${BASE}/api/owner/claim`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` }, body: JSON.stringify({ businessId: biz.id }) });
    const addR = await fetch(`${BASE}/api/owner/catalog`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ businessId: biz.id, name: 'DB Cake', price: 700, inStock: true })
    });
    assert(addR.status === 201, `Catalog add failed: ${addR.status}`);
    // Verify in SQLite directly
    const db = dbAdapter.initDb(dbPath);
    const rows = db.prepare('SELECT * FROM catalog_items WHERE business_id = ?').all(biz.id);
    assert(rows.length === 1, 'Should have 1 catalog row in SQLite');
    assert(rows[0].name === 'DB Cake', 'name mismatch');
    db.close();
  });

  await test('legacy json backend still works when KOTAMITRA_DB_BACKEND=json', async () => {
    // Kill sqlite server, start a json-backend server on same port
    server.kill();
    await wait(400);
    const jsonDir = makeTempDir();
    const jsonServer = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
      env: {
        ...process.env,
        PORT: String(PORT),
        KOTAMITRA_DB_BACKEND: 'json',
        KOTAMITRA_DATA_FILE: path.join(jsonDir, 'businesses.json'),
        KOTAMITRA_SESSIONS_FILE: path.join(jsonDir, 'sessions.json'),
        KOTAMITRA_ADMIN_EMAIL: 'db-admin@example.test',
        KOTAMITRA_ADMIN_PASSWORD: 'db-admin-password'
      },
      stdio: 'ignore'
    });
    await wait(1400);
    try {
      const r = await fetch(`${BASE}/api/health`);
      assert(r.status === 200, `Expected 200, got ${r.status}`);
      const bizR = await fetch(`${BASE}/api/businesses`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'JSON Backend Biz', category: 'Bakery & Cakes', ownerName: 'JO', phone: '9555000001', state: 'Rajasthan', city: 'Kota', area: 'Talwandi', address: '9 JSON St' })
      });
      assert(bizR.status === 201, `JSON backend registration failed: ${bizR.status}`);
      const { business } = await bizR.json();
      // Verify the JSON file was written
      const fileData = JSON.parse(fs.readFileSync(path.join(jsonDir, 'businesses.json'), 'utf8'));
      assert(fileData.businesses.some(b => b.id === business.id), 'Business not found in JSON file');
    } finally {
      jsonServer.kill();
      fs.rmSync(jsonDir, { recursive: true, force: true });
    }
    // Restart the sqlite server for any downstream tests in the full suite
    server = spawnServer(tempDir);
    await wait(1400);
  });

  server.kill();
  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}

  console.log('');
  if (failed === 0) {
    console.log(`All ${passed} DB integration tests passed successfully!`);
  } else {
    console.error(`${failed} test(s) failed, ${passed} passed.`);
    process.exitCode = 1;
  }
}

run().catch(err => {
  console.error('DB test suite error:', err.message);
  process.exitCode = 1;
});
