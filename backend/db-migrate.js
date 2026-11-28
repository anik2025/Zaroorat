'use strict';
const fs = require('node:fs');
const path = require('node:path');
const dbAdapter = require('./db');

const DATA_FILE = process.env.KOTAMITRA_DATA_FILE || path.join(__dirname, '..', 'database', 'data', 'businesses.json');
const DB_PATH = process.env.KOTAMITRA_DB_PATH || path.join(__dirname, '..', 'database', 'data', 'kotamitra.db');

async function migrate() {
  console.log('🔄 Reading JSON data from:', DATA_FILE);
  if (!fs.existsSync(DATA_FILE)) {
    console.error('❌ JSON data file not found:', DATA_FILE);
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  data.businesses = data.businesses || [];
  data.enquiries = data.enquiries || [];
  data.orders = data.orders || [];
  data.reviews = data.reviews || [];
  data.subscriptions = data.subscriptions || [];

  console.log('📊 Found:');
  console.log(`   • ${data.businesses.length} businesses`);
  console.log(`   • ${data.enquiries.length} enquiries`);
  console.log(`   • ${data.orders.length} orders`);
  console.log(`   • ${data.reviews.length} reviews`);
  console.log(`   • ${data.subscriptions.length} subscriptions`);

  // Build a fake db-like object for the adapter that we can write to
  const fakeDb = {
    businesses: data.businesses,
    enquiries: data.enquiries,
    orders: data.orders,
    reviews: data.reviews,
    subscriptions: data.subscriptions,
    catalog: data.catalog || {}
  };

  // Also need the sessions file for OTP migration if it exists
  const sessionsFile = process.env.KOTAMITRA_SESSIONS_FILE || path.join(__dirname, '..', 'database', 'data', 'sessions.json');
  let sessionsMap = new Map();
  let otpsMap = new Map();
  if (fs.existsSync(sessionsFile)) {
    try {
      const raw = JSON.parse(fs.readFileSync(sessionsFile, 'utf8'));
      if (raw.sessions) {
        for (const [token, s] of Object.entries(raw.sessions)) {
          sessionsMap.set(token, s);
        }
      }
      if (raw.customerOtps) {
        for (const [phone, o] of Object.entries(raw.customerOtps)) {
          otpsMap.set(phone, o);
        }
      }
    } catch (e) { /* ignore malformed sessions file */ }
  }

  console.log('\n🔄 Initialising SQLite database:', DB_PATH);
  const db = dbAdapter.initDb(DB_PATH);
  console.log('✅ Database created and migrations applied');

  console.log('\n💾 Writing data to SQLite...');
  dbAdapter.writeData(fakeDb, db);
  dbAdapter.writeSessions(db, sessionsMap, otpsMap);
  console.log('✅ All data migrated');

  // Verify counts
  const countBusiness = db.prepare('SELECT COUNT(*) as c FROM businesses').get().c;
  const countEnquiry = db.prepare('SELECT COUNT(*) as c FROM enquiries').get().c;
  const countOrder = db.prepare('SELECT COUNT(*) as c FROM orders').get().c;
  const countReview = db.prepare('SELECT COUNT(*) as c FROM reviews').get().c;
  const countSubscription = db.prepare('SELECT COUNT(*) as c FROM subscriptions').get().c;

  console.log('\n📈 Verification (SQLite counts):');
  console.log(`   • ${countBusiness} businesses`);
  console.log(`   • ${countEnquiry} enquiries`);
  console.log(`   • ${countOrder} orders`);
  console.log(`   • ${countReview} reviews`);
  console.log(`   • ${countSubscription} subscriptions`);

  if (countBusiness !== data.businesses.length) {
    console.error('❌ Business count mismatch!');
    process.exit(1);
  }

  console.log('\n✅ Migration complete!');
  console.log('💡 To use the new DB, run: KOTAMITRA_DB_BACKEND=sqlite node backend/server.js');
}

migrate();