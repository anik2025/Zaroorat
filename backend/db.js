'use strict';
const fs = require('node:fs');
const path = require('node:path');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'database', 'migrations');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function j(value) {
  return value === undefined || value === null ? null : JSON.stringify(value);
}
function p(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return value; }
  }
  return value;
}
function bool(value) { return value ? 1 : 0; }
function unbool(value) { return value === 1 || value === true; }

// ─── Migration runner ─────────────────────────────────────────────────────────

function runMigrations(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`);
  const applied = new Set(
    db.prepare('SELECT filename FROM schema_migrations').all().map(r => r.filename)
  );
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    db.exec(sql);
    db.prepare('INSERT INTO schema_migrations (filename, applied_at) VALUES (?, ?)').run(file, new Date().toISOString());
  }
}

// ─── initDb ───────────────────────────────────────────────────────────────────

function initDb(dbPath) {
  const { DatabaseSync } = require('node:sqlite');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  // WAL mode for better concurrent read performance
  db.exec('PRAGMA journal_mode=WAL');
  db.exec('PRAGMA foreign_keys=ON');
  runMigrations(db);
  return db;
}

// ─── readData ─────────────────────────────────────────────────────────────────
// Returns the same shape as the JSON store: { businesses[], enquiries[], orders[],
// reviews[], subscriptions[], catalog{} }

function readData(db) {
  const businesses = db.prepare('SELECT * FROM businesses').all().map(rowToBusiness);

  const enquiries = db.prepare('SELECT * FROM enquiries').all().map(r => ({
    id: r.id,
    businessId: r.business_id,
    customerName: r.customer_name,
    customerPhone: r.customer_phone,
    message: r.message,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at || undefined
  }));

  const orders = db.prepare('SELECT * FROM orders').all().map(r => ({
    id: r.id,
    businessId: r.business_id,
    customerName: r.customer_name,
    customerPhone: r.customer_phone,
    items: p(r.items) || [],
    totalAmount: r.total_amount,
    deliveryAddress: r.delivery_address,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at || undefined
  }));

  const reviews = db.prepare('SELECT * FROM reviews').all().map(r => ({
    id: r.id,
    businessId: r.business_id,
    customerPhone: r.customer_phone,
    rating: r.rating,
    comment: r.comment,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at || undefined
  }));

  const subscriptions = db.prepare('SELECT * FROM subscriptions').all().map(r => ({
    id: r.id,
    businessId: r.business_id,
    ownerPhone: r.owner_phone,
    planId: r.plan_id,
    tier: r.tier,
    amount: r.amount,
    currency: r.currency,
    status: r.status,
    gatewayOrderId: r.gateway_order_id || undefined,
    gatewayPaymentId: r.gateway_payment_id || undefined,
    activatedAt: r.activated_at || undefined,
    expiresAt: r.expires_at || undefined,
    createdAt: r.created_at
  }));

  const catalogRows = db.prepare('SELECT * FROM catalog_items').all();
  const catalog = {};
  for (const r of catalogRows) {
    if (!catalog[r.business_id]) catalog[r.business_id] = [];
    catalog[r.business_id].push({
      id: r.id,
      businessId: r.business_id,
      name: r.name,
      description: r.description,
      price: r.price,
      category: r.category,
      inStock: unbool(r.in_stock),
      imageUrl: r.image_url,
      deleted: unbool(r.deleted),
      createdAt: r.created_at,
      updatedAt: r.updated_at || undefined
    });
  }

  return { businesses, enquiries, orders, reviews, subscriptions, catalog };
}

function rowToBusiness(r) {
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    ownerName: r.owner_name,
    phone: r.phone,
    whatsapp: r.whatsapp || '',
    state: r.state,
    city: r.city,
    area: r.area || '',
    address: r.address,
    description: r.description || '',
    products: p(r.products) || [],
    pricing: r.pricing || '',
    images: p(r.images) || [],
    status: r.status,
    isVerified: unbool(r.is_verified),
    isFeatured: unbool(r.is_featured),
    ownerClaimed: unbool(r.owner_claimed),
    ownerPhone: r.owner_phone || '',
    ownerVerifiedAt: r.owner_verified_at || null,
    subscriptionTier: r.subscription_tier || undefined,
    subscriptionExpiresAt: r.subscription_expires_at || undefined,
    rating: r.rating === null || r.rating === undefined ? undefined : (r.rating === 'New' ? 'New' : Number(r.rating)),
    reviewCount: r.review_count || 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at || undefined
  };
}

// ─── writeData ────────────────────────────────────────────────────────────────
// Accepts the mutated in-memory object and upserts all collections.

function writeData(data, db) {
  const upsertBusiness = db.prepare(`INSERT OR REPLACE INTO businesses
    (id, name, category, owner_name, phone, whatsapp, state, city, area, address,
     description, products, pricing, images, status, is_verified, is_featured,
     owner_claimed, owner_phone, owner_verified_at, subscription_tier,
     subscription_expires_at, rating, review_count, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

  const upsertEnquiry = db.prepare(`INSERT OR REPLACE INTO enquiries
    (id, business_id, customer_name, customer_phone, message, status, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?)`);

  const upsertOrder = db.prepare(`INSERT OR REPLACE INTO orders
    (id, business_id, customer_name, customer_phone, items, total_amount,
     delivery_address, status, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`);

  const upsertReview = db.prepare(`INSERT OR REPLACE INTO reviews
    (id, business_id, customer_phone, rating, comment, status, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?)`);

  const upsertSubscription = db.prepare(`INSERT OR REPLACE INTO subscriptions
    (id, business_id, owner_phone, plan_id, tier, amount, currency, status,
     gateway_order_id, gateway_payment_id, activated_at, expires_at, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);

  const upsertCatalogItem = db.prepare(`INSERT OR REPLACE INTO catalog_items
    (id, business_id, name, description, price, category, in_stock, image_url,
     deleted, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`);

  db.exec('BEGIN');
  try {
    for (const b of (data.businesses || [])) {
      upsertBusiness.run(
        b.id, b.name, b.category, b.ownerName, b.phone, b.whatsapp || '',
        b.state, b.city, b.area || '', b.address, b.description || '',
        j(b.products || []), b.pricing || '', j(b.images || []),
        b.status, bool(b.isVerified), bool(b.isFeatured),
        bool(b.ownerClaimed), b.ownerPhone || '',
        b.ownerVerifiedAt || null, b.subscriptionTier || null,
        b.subscriptionExpiresAt || null,
        b.rating === undefined ? null : String(b.rating),
        b.reviewCount || 0, b.createdAt, b.updatedAt || null
      );
    }
    for (const e of (data.enquiries || [])) {
      upsertEnquiry.run(e.id, e.businessId, e.customerName, e.customerPhone,
        e.message, e.status, e.createdAt, e.updatedAt || null);
    }
    for (const o of (data.orders || [])) {
      upsertOrder.run(o.id, o.businessId, o.customerName, o.customerPhone,
        j(o.items || []), o.totalAmount, o.deliveryAddress, o.status,
        o.createdAt, o.updatedAt || null);
    }
    for (const r of (data.reviews || [])) {
      upsertReview.run(r.id, r.businessId, r.customerPhone, r.rating,
        r.comment, r.status, r.createdAt, r.updatedAt || null);
    }
    for (const s of (data.subscriptions || [])) {
      upsertSubscription.run(s.id, s.businessId, s.ownerPhone, s.planId,
        s.tier, s.amount, s.currency, s.status,
        s.gatewayOrderId || null, s.gatewayPaymentId || null,
        s.activatedAt || null, s.expiresAt || null, s.createdAt);
    }
    for (const [bizId, items] of Object.entries(data.catalog || {})) {
      for (const item of (items || [])) {
        upsertCatalogItem.run(item.id, bizId, item.name, item.description || '',
          item.price || 0, item.category || '', bool(item.inStock !== false),
          item.imageUrl || '', bool(item.deleted), item.createdAt, item.updatedAt || null);
      }
    }
    db.exec('COMMIT');
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch {}
    throw err;
  }
}

// ─── Session store ─────────────────────────────────────────────────────────────

function readSessions(db) {
  const now = Date.now();
  const sessionsMap = new Map();
  for (const r of db.prepare('SELECT * FROM sessions WHERE expires_at > ?').all(now)) {
    sessionsMap.set(r.token, {
      type: r.type,
      phone: r.phone || undefined,
      email: r.email || undefined,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
      capabilities: p(r.capabilities) || [r.type]
    });
  }
  const otpsMap = new Map();
  for (const r of db.prepare('SELECT * FROM customer_otps WHERE expires_at > ?').all(now)) {
    otpsMap.set(r.phone, {
      otpHash: r.otp_hash,
      expiresAt: r.expires_at,
      cooldownUntil: r.cooldown_until,
      attempts: r.attempts
    });
  }
  return { sessionsMap, otpsMap };
}

function writeSessions(db, sessionsMap, otpsMap) {
  const upsertSession = db.prepare(`INSERT OR REPLACE INTO sessions
    (token, type, phone, email, created_at, expires_at, capabilities)
    VALUES (?,?,?,?,?,?,?)`);
  const upsertOtp = db.prepare(`INSERT OR REPLACE INTO customer_otps
    (phone, otp_hash, expires_at, cooldown_until, attempts)
    VALUES (?,?,?,?,?)`);

  const now = Date.now();
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
    db.prepare('DELETE FROM customer_otps WHERE expires_at <= ?').run(now);
    for (const [token, s] of sessionsMap.entries()) {
      upsertSession.run(token, s.type, s.phone || null, s.email || null,
        s.createdAt, s.expiresAt, j(s.capabilities || [s.type]));
    }
    for (const [phone, o] of otpsMap.entries()) {
      upsertOtp.run(phone, o.otpHash, o.expiresAt, o.cooldownUntil || 0, o.attempts || 0);
    }
    db.exec('COMMIT');
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch {}
    throw err;
  }
}

module.exports = { initDb, readData, writeData, readSessions, writeSessions };
