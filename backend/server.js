const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const dbAdapter = require('./db');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'database', 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const DEFAULT_DATA_FILE = path.join(DATA_DIR, 'businesses.json');
const DEFAULT_DB_PATH = path.join(DATA_DIR, 'kotamitra.db');

// DB backend selection: 'sqlite' (default) or 'json' (legacy fallback)
// If KOTAMITRA_DATA_FILE is set explicitly, default to json so existing test
// suites that only pass KOTAMITRA_DATA_FILE continue to work unchanged.
const DB_BACKEND = process.env.KOTAMITRA_DB_BACKEND ||
  (process.env.KOTAMITRA_DATA_FILE ? 'json' : 'sqlite');
const DB_PATH = process.env.KOTAMITRA_DB_PATH || DEFAULT_DB_PATH;
// Legacy JSON path (used when DB_BACKEND=json or for demo mode JSON fallback)
const DATA_FILE = process.env.KOTAMITRA_DATA_FILE || DEFAULT_DATA_FILE;
const AREAS_FILE = path.join(ROOT, 'database', 'areas.json');
const LOCATIONS_FILE = path.join(ROOT, 'database', 'locations.json');
const CATEGORIES_FILE = path.join(ROOT, 'database', 'categories.json');
const DEMO_FILE = path.join(ROOT, 'database', 'demo', 'businesses.json');
const PORT = Number(process.env.PORT || 4100);
const DEV_ADMIN_EMAIL = 'admin@kotamitra.local';
const DEV_ADMIN_PASSWORD = 'change-this-password';
function loadAdminConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const email = env.KOTAMITRA_ADMIN_EMAIL || (production ? '' : DEV_ADMIN_EMAIL);
  const password = env.KOTAMITRA_ADMIN_PASSWORD || (production ? '' : DEV_ADMIN_PASSWORD);
  const missing = !email || !password;
  const unsafe = email === DEV_ADMIN_EMAIL || password === DEV_ADMIN_PASSWORD;
  if (production && (missing || unsafe)) throw new Error('Production admin credentials must be configured with non-default values');
  return { email, password };
}
const { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } = loadAdminConfig();
// SESSIONS_FILE is kept for json-backend compatibility only
const SESSIONS_FILE = process.env.KOTAMITRA_SESSIONS_FILE || path.join(DATA_DIR, 'sessions.json');
// db handle — initialised after startup dir setup below
let db = null;
const sessions = new Map();
const customerOtps = new Map();
const OTP_TTL_MS = Number(process.env.KOTAMITRA_OTP_TTL_MS || 300000);
const OTP_MAX_ATTEMPTS = Number(process.env.KOTAMITRA_OTP_MAX_ATTEMPTS || 5);
const OTP_RESEND_COOLDOWN_MS = Number(process.env.KOTAMITRA_OTP_RESEND_COOLDOWN_MS || 30000);
const OTP_DRY_RUN = process.env.KOTAMITRA_OTP_DRY_RUN === 'true' || process.env.DRY_RUN === 'true';
const SESSION_CUSTOMER_TTL_MS = Number(process.env.KOTAMITRA_SESSION_CUSTOMER_TTL_MS || 7 * 86400000);
const SESSION_OWNER_TTL_MS = Number(process.env.KOTAMITRA_SESSION_OWNER_TTL_MS || 7 * 86400000);
const SESSION_ADMIN_TTL_MS = Number(process.env.KOTAMITRA_SESSION_ADMIN_TTL_MS || 86400000);

class MockProvider {
  constructor() { this.name = 'mock'; }
  async send(phone, code) {
    // Test-safe delivery: deliberately no network or external provider call.
    return { delivered: true, phone, code };
  }
}

class RestSmsAdapter {
  constructor() {
    this.name = 'rest-api';
    this.endpoint = process.env.KOTAMITRA_OTP_SMS_ENDPOINT || '';
    this.apiKey = process.env.KOTAMITRA_OTP_API_KEY || '';
    this.senderId = process.env.KOTAMITRA_OTP_SENDER_ID || 'KOTAMITRA';
  }
  async send(phone, code) {
    if (!this.endpoint) {
      return { delivered: false, error: 'KOTAMITRA_OTP_SMS_ENDPOINT is not configured' };
    }
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}`, 'X-API-Key': this.apiKey } : {})
        },
        body: JSON.stringify({
          phone,
          code,
          senderId: this.senderId,
          message: `Your KotaMitra verification code is ${code}. Valid for 5 minutes.`
        })
      });
      if (!response.ok) {
        return { delivered: false, error: `SMS gateway returned status ${response.status}` };
      }
      return { delivered: true };
    } catch (err) {
      return { delivered: false, error: err.message };
    }
  }
}

class UnconfiguredProvider {
  constructor() { this.name = 'unconfigured'; }
  async send() { return { delivered: false }; }
}

const SUBSCRIPTION_PLANS = [
  { id: 'plan_featured_monthly', name: 'Featured Listing', tier: 'featured', amount: 99900, currency: 'INR', interval: 'monthly', description: 'Top placement in search results and homepage spotlight.' },
  { id: 'plan_verified_annual', name: 'Verified Trust Badge', tier: 'verified', amount: 249900, currency: 'INR', interval: 'annually', description: 'Verified trust badge and priority customer support.' }
];

const PAYMENT_DRY_RUN = process.env.KOTAMITRA_PAYMENT_DRY_RUN === 'true';

async function createPaymentGatewayOrder(plan, businessId) {
  if (PAYMENT_DRY_RUN || !process.env.KOTAMITRA_RAZORPAY_KEY_ID || !process.env.KOTAMITRA_RAZORPAY_KEY_SECRET) {
    return { orderId: `order_mock_${crypto.randomUUID().slice(0, 12)}`, amount: plan.amount, currency: plan.currency };
  }
  const keyId = process.env.KOTAMITRA_RAZORPAY_KEY_ID;
  const keySecret = process.env.KOTAMITRA_RAZORPAY_KEY_SECRET;
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  const response = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      amount: plan.amount,
      currency: plan.currency,
      receipt: `rcpt_${businessId.slice(0, 8)}_${Date.now()}`
    })
  });
  if (!response.ok) {
    throw new Error(`Payment gateway error: status ${response.status}`);
  }
  const data = await response.json();
  return { orderId: data.id, amount: data.amount, currency: data.currency };
}

function verifyPaymentSignature(orderId, paymentId, signature) {
  if (PAYMENT_DRY_RUN || !process.env.KOTAMITRA_RAZORPAY_KEY_SECRET) {
    return true;
  }
  const keySecret = process.env.KOTAMITRA_RAZORPAY_KEY_SECRET;
  const generatedSignature = crypto
    .createHmac('sha256', keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  return generatedSignature === signature;
}

function getOtpProvider() {
  const environment = process.env.NODE_ENV || 'development';
  if ((environment === 'test' || environment === 'development' || environment === 'staging') && OTP_DRY_RUN) {
    return new MockProvider();
  }
  const providerType = process.env.KOTAMITRA_OTP_PROVIDER;
  if (providerType === 'rest-api' || providerType === 'configured') {
    const endpoint = process.env.KOTAMITRA_OTP_SMS_ENDPOINT;
    if (!endpoint) {
      if (environment === 'production' || environment === 'staging') {
        throw new Error('Configured OTP provider requires KOTAMITRA_OTP_SMS_ENDPOINT');
      }
      return new UnconfiguredProvider();
    }
    return new RestSmsAdapter();
  }
  if (environment === 'test' || environment === 'development') {
    return new MockProvider();
  }
  return new UnconfiguredProvider();
}

function assertOtpProviderConfiguration() {
  const environment = process.env.NODE_ENV || 'development';
  const providerType = process.env.KOTAMITRA_OTP_PROVIDER;
  if ((environment === 'production' || environment === 'staging') && providerType && providerType !== 'mock') {
    const endpoint = process.env.KOTAMITRA_OTP_SMS_ENDPOINT;
    if (!endpoint) {
      throw new Error(`Production/Staging OTP provider '${providerType}' requires KOTAMITRA_OTP_SMS_ENDPOINT`);
    }
  }
}

function hashOtp(phone, otp) {
  return crypto.createHash('sha256').update(`${phone}:${otp}`).digest('hex');
}

function sessionTtl(type) {
  if (type === 'admin') return SESSION_ADMIN_TTL_MS;
  if (type === 'owner') return SESSION_OWNER_TTL_MS;
  return SESSION_CUSTOMER_TTL_MS;
}

function normalizeSession(session) {
  if (!session || typeof session !== 'object') return null;
  const type = session.type === 'admin' ? 'admin' : session.type === 'owner' ? 'owner' : 'customer';
  const parsedCreatedAt = parseTimestamp(session.createdAt);
  const createdAt = parsedCreatedAt === null ? Date.now() : parsedCreatedAt;
  const parsedExpiresAt = parseTimestamp(session.expiresAt);
  const expiresAt = parsedExpiresAt === null ? createdAt + sessionTtl(type) : parsedExpiresAt;
  return {
    ...session,
    type,
    createdAt,
    expiresAt,
    role: type,
    capabilities: Array.isArray(session.capabilities) ? session.capabilities : (type === 'admin' ? ['admin'] : [type])
  };
}

function getLiveSession(req) {
  const accessToken = token(req);
  const session = normalizeSession(sessions.get(accessToken));
  if (!session || session.expiresAt <= Date.now()) {
    if (accessToken && sessions.delete(accessToken)) saveAuthStore();
    return null;
  }
  sessions.set(accessToken, session);
  return session;
}

function loadAuthStore() {
  if (DB_BACKEND === 'sqlite' && db) {
    try {
      const { sessionsMap, otpsMap } = dbAdapter.readSessions(db);
      const now = Date.now();
      for (const [token, s] of sessionsMap.entries()) {
        if (s.expiresAt > now) sessions.set(token, normalizeSession(s));
      }
      for (const [phone, o] of otpsMap.entries()) {
        if (o.expiresAt > now && (o.attempts || 0) < OTP_MAX_ATTEMPTS) customerOtps.set(phone, o);
      }
    } catch (err) { console.error('Session load error (sqlite):', err.message); }
    return;
  }
  // json fallback
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      const raw = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
      const now = Date.now();
      if (raw.sessions) {
        for (const [token, s] of Object.entries(raw.sessions)) {
          const type = s.type === 'admin' ? 'admin' : s.type === 'owner' ? 'owner' : 'customer';
          const createdAt = parseTimestamp(s.createdAt);
          const expiresAt = parseTimestamp(s.expiresAt);
          const effectiveExpiresAt = expiresAt === null
            ? (createdAt === null ? now : createdAt + sessionTtl(type))
            : expiresAt;
          if (effectiveExpiresAt > now) {
            sessions.set(token, normalizeSession({ ...s, createdAt: createdAt === null ? now : createdAt, expiresAt: effectiveExpiresAt }));
          }
        }
      }
      if (raw.customerOtps) {
        for (const [phone, o] of Object.entries(raw.customerOtps)) {
          if (o.expiresAt && o.expiresAt > now && (o.attempts || 0) < OTP_MAX_ATTEMPTS) {
            customerOtps.set(phone, o);
          }
        }
      }
    }
  } catch (err) { console.error('Session load error'); }
}

function saveAuthStore() {
  if (DB_BACKEND === 'sqlite' && db) {
    try { dbAdapter.writeSessions(db, sessions, customerOtps); }
    catch (err) { console.error('Session save error (sqlite):', err.message); }
    return;
  }
  // json fallback
  try {
    fs.mkdirSync(path.dirname(SESSIONS_FILE), { recursive: true });
    const sessObj = {};
    for (const [k, v] of sessions.entries()) sessObj[k] = v;
    const otpsObj = {};
    for (const [k, v] of customerOtps.entries()) otpsObj[k] = v;
    const tmpFile = `${SESSIONS_FILE}.tmp.${Date.now()}.${Math.random().toString(36).slice(2)}`;
    fs.writeFileSync(tmpFile, JSON.stringify({ sessions: sessObj, customerOtps: otpsObj }, null, 2));
    fs.renameSync(tmpFile, SESSIONS_FILE);
  } catch (err) { console.error('Session save error'); }
}

// IP-based Rate Limiter Store
const rateLimitMap = new Map();
function trustedProxyEnabled() {
  return process.env.KOTAMITRA_TRUSTED_PROXY === 'true';
}

function clientIp(req) {
  const socketIp = req.socket.remoteAddress || 'unknown';
  if (!trustedProxyEnabled()) return socketIp;
  const forwarded = req.headers['x-forwarded-for'];
  return (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : '') || socketIp;
}

function checkRateLimit(req, res, actionKey, maxRequests, windowMs) {
  const ip = clientIp(req);
  const key = `${ip}:${actionKey}`;
  const now = Date.now();
  let record = rateLimitMap.get(key);
  if (!record || record.resetTime < now) {
    record = { count: 1, resetTime: now + windowMs };
    rateLimitMap.set(key, record);
    return true;
  }
  record.count++;
  if (record.count > maxRequests) {
    json(res, 429, { error: 'Too many requests, please try again later.' });
    return false;
  }
  return true;
}

const VALID_CATEGORIES = new Set(['Tiffin & Food', 'PG & Hostel', 'Laundry', 'Repairs', 'Tutors', 'Salon & Beauty', 'Printing', 'Bakery & Cakes', 'Cleaning', 'Packers & Movers', 'Tailor & Boutique', 'Shopping & Retail', 'Property: Buy/Rent/Sell', 'Land & Plots', 'Houses & Flats', 'Commercial Property', 'Vehicles', 'Agriculture', 'Travel & Tourism', 'Healthcare', 'Jobs']);
const PHONE_PATTERN = /^[6-9]\d{9}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function text(value) { return typeof value === 'string' ? value.trim() : null; }
function parseTimestamp(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}
function normalizePhone(value) {
  if (typeof value !== 'string' || !/^[+()\-\s\d]+$/.test(value.trim())) return null;
  const digits = value.replace(/\D/g, '');
  const phone = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
  return PHONE_PATTERN.test(phone) ? phone : null;
}
function validationError(message) { const error = new Error(message); error.statusCode = 400; return error; }
function loadLocations() { return JSON.parse(fs.readFileSync(LOCATIONS_FILE, 'utf8')); }
function findLocation(input) {
  const locations = loadLocations();
  const region = (locations.regions || []).find(item => item.name === input.state);
  const city = region?.cities?.find(item => item.name === input.city);
  return { region, city };
}
function validateBusinessInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw validationError('Request body must be a JSON object');
  const name = text(input.name); const category = text(input.category); const ownerName = text(input.ownerName); const address = text(input.address); const description = input.description === undefined ? '' : text(input.description);
  if (!name || name.length < 2 || name.length > 100) throw validationError('Business name must be 2 to 100 characters');
  if (!category || !VALID_CATEGORIES.has(category)) throw validationError('Select a valid business category');
  if (!ownerName || ownerName.length < 2 || ownerName.length > 100) throw validationError('Owner name must be 2 to 100 characters');
  const phone = normalizePhone(input.phone); if (!phone) throw validationError('Enter a valid Indian 10 digit mobile number');
  const whatsapp = input.whatsapp === undefined || input.whatsapp === '' ? '' : normalizePhone(input.whatsapp); if (input.whatsapp !== undefined && input.whatsapp !== '' && !whatsapp) throw validationError('WhatsApp number must be a valid Indian 10 digit mobile number');
  const state = text(input.state); const city = text(input.city); const area = input.area === undefined || input.area === '' ? '' : text(input.area);
  const { region, city: selectedCity } = findLocation({ state, city });
  if (!region) throw validationError('Select a valid State / UT');
  if (!selectedCity) throw validationError('Select a valid city for the selected State / UT');
  if (area && !(selectedCity.areas || []).includes(area)) throw validationError('Select a valid area for the selected city');
  if (!address || address.length < 5 || address.length > 300) throw validationError('Address must be 5 to 300 characters');
  if (description === null || description.length > 1000) throw validationError('Description must be at most 1000 characters');
  const rawProducts = input.products === undefined ? [] : (Array.isArray(input.products) ? input.products : typeof input.products === 'string' ? input.products.split(',') : []);
  if (rawProducts.length > 50) throw validationError('A business can have at most 50 products');
  const products = rawProducts.map(p => {
    const product = typeof p === 'object' && p !== null ? p : { name: p, price: 0 };
    const productName = text(product.name);
    const productPrice = product.price === undefined || product.price === '' ? 0 : Number(product.price);
    if (!productName || productName.length > 200) throw validationError('Product names must be 1 to 200 characters');
    if (!Number.isFinite(productPrice) || productPrice < 0) throw validationError('Product prices must be finite and non-negative');
    return { name: productName, price: productPrice };
  });
  const pricing = input.pricing === undefined ? '' : text(input.pricing);
  const images = input.images === undefined ? [] : (Array.isArray(input.images) ? input.images.map(i => text(i)).filter(Boolean) : typeof input.images === 'string' ? input.images.split(',').map(i => i.trim()).filter(Boolean) : []);
  return { ...input, name, category, ownerName, phone, whatsapp, state, city, area, address, description, products, pricing, images };
}
function validateEnquiryInput(input, data) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw validationError('Request body must be a JSON object');
  const businessId = text(input.businessId); const customerName = text(input.customerName); const customerPhone = normalizePhone(input.customerPhone); const message = text(input.message);
  if (!businessId || !UUID_PATTERN.test(businessId)) throw validationError('Enter a valid business ID');
  const business = (Array.isArray(data.businesses) ? data.businesses : []).find(item => item.id === businessId);
  if (!business) throw validationError('Business not found');
  if (business.status !== 'approved') throw validationError('This business is not currently accepting enquiries');
  if (!customerName || customerName.length < 2 || customerName.length > 100) throw validationError('Customer name must be 2 to 100 characters');
  if (!customerPhone) throw validationError('Enter a valid Indian 10 digit mobile number');
  if (!message || message.length < 5 || message.length > 1000) throw validationError('Message must be 5 to 1000 characters');
  return { businessId, customerName, customerPhone, message };
}

function validateReviewInput(input, data) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw validationError('Request body must be a JSON object');
  const businessId = text(input.businessId);
  const rating = Number(input.rating);
  const comment = text(input.comment);

  if (!businessId || !UUID_PATTERN.test(businessId)) throw validationError('Enter a valid business ID');
  const business = (Array.isArray(data.businesses) ? data.businesses : []).find(item => item.id === businessId);
  if (!business) throw validationError('Business not found');
  if (business.status !== 'approved') throw validationError('Reviews can only be submitted for approved businesses');

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw validationError('Rating must be an integer between 1 and 5');
  if (!comment || comment.length < 5 || comment.length > 500) throw validationError('Review comment must be 5 to 500 characters');

  return { businessId, rating, comment };
}

function validateCatalogItemInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw validationError('Request body must be a JSON object');
  const name = text(input.name);
  if (!name || name.length < 1 || name.length > 150) throw validationError('Item name must be 1 to 150 characters');
  const description = input.description === undefined ? '' : text(input.description);
  if (description === null || description.length > 500) throw validationError('Description must be at most 500 characters');
  const price = input.price === undefined ? 0 : Number(input.price);
  if (!Number.isFinite(price) || price < 0 || price > 10000000) throw validationError('Price must be a non-negative number up to 1,00,00,000');
  const category = input.category === undefined ? '' : text(input.category);
  if (category === null || category.length > 80) throw validationError('Category must be at most 80 characters');
  const inStock = input.inStock === undefined ? true : Boolean(input.inStock);
  const imageUrl = input.imageUrl === undefined ? '' : text(input.imageUrl);
  if (imageUrl === null || imageUrl.length > 500) throw validationError('Image URL must be at most 500 characters');
  if (imageUrl && !/^https?:\/\/|^\/uploads\//.test(imageUrl)) throw validationError('Image URL must start with http://, https://, or /uploads/');
  return { name, description, price, category, inStock, imageUrl };
}

function recalculateBusinessRating(businessId, data) {
  const business = (data.businesses || []).find(b => b.id === businessId);
  if (!business) return;
  const approvedReviews = (data.reviews || []).filter(r => r.businessId === businessId && r.status === 'approved');
  const totalReviews = approvedReviews.length;
  if (totalReviews === 0) {
    business.rating = 'New';
    business.reviewCount = 0;
  } else {
    const sum = approvedReviews.reduce((acc, r) => acc + r.rating, 0);
    business.rating = Number((sum / totalReviews).toFixed(1));
    business.reviewCount = totalReviews;
  }
}

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
fs.mkdirSync(path.dirname(SESSIONS_FILE), { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({ businesses: [] }, null, 2));

// Initialise the DB backend before loading sessions
if (DB_BACKEND === 'sqlite') {
  db = dbAdapter.initDb(DB_PATH);
}

loadAuthStore();

function isDemoMode(req, url) {
  if (!req || !url) return process.env.KOTAMITRA_DEMO_MODE === 'true';
  return process.env.KOTAMITRA_DEMO_MODE === 'true' ||
         req.headers['x-demo-mode'] === 'true' ||
         url.searchParams.get('demo') === 'true';
}

function getDataFilePath(req, url) {
  if (isDemoMode(req, url)) {
    if (process.env.KOTAMITRA_DATA_FILE && process.env.KOTAMITRA_DEMO_DATA_FILE) return process.env.KOTAMITRA_DEMO_DATA_FILE;
    if (fs.existsSync(DEMO_FILE)) return DEMO_FILE;
    throw new Error('Demo mode requires a dedicated demo data file');
  }
  return process.env.KOTAMITRA_DATA_FILE || DATA_FILE;
}

function readData(req, url) {
  if (DB_BACKEND === 'sqlite' && db && !isDemoMode(req, url)) {
    const data = dbAdapter.readData(db);
    data.enquiries = data.enquiries || [];
    return data;
  }
  // json fallback (also used for demo mode)
  const file = getDataFilePath(req, url);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  data.enquiries = data.enquiries || [];
  return data;
}

function writeData(data, req, url) {
  if (DB_BACKEND === 'sqlite' && db && !isDemoMode(req, url)) {
    dbAdapter.writeData(data, db);
    return;
  }
  // json fallback (also used for demo mode)
  const file = getDataFilePath(req, url);
  if (file === DEFAULT_DATA_FILE && isDemoMode(req, url)) {
    throw new Error('SAFETY ABORT: Attempted to write to real data in Demo Mode!');
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmpFile = `${file}.tmp.${Date.now()}.${Math.random().toString(36).slice(2)}`;
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2));
  fs.renameSync(tmpFile, file);
}
function setSecurityHeaders(res) {
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self';");
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
}

function allowedOrigins() {
  return String(process.env.KOTAMITRA_ALLOWED_ORIGINS || 'http://localhost:4100')
    .split(',').map(origin => origin.trim()).filter(Boolean);
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (!origin) return;
  if (allowedOrigins().includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-CSRF-Token');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS');
  }
}

function json(res, status, body, req = null) {
  if (res.headersSent) return;
  setSecurityHeaders(res);
  applyCors(req || res.__request, res);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}
function body(req) {
  return new Promise((resolve, reject) => {
    const contentType = String(req.headers['content-type'] || '').toLowerCase();
    if (req.method !== 'GET' && req.method !== 'HEAD' && contentType && !contentType.startsWith('application/json') && !contentType.startsWith('multipart/form-data')) {
      const error = validationError('Content-Type must be application/json');
      error.statusCode = 415;
      reject(error);
      return;
    }
    let raw = '';
    let tooLarge = false;
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 1000000 && !tooLarge) {
        tooLarge = true;
        const error = validationError('Request body is too large');
        error.statusCode = 413;
        reject(error);
        req.resume();
      }
    });
    req.on('end', () => {
      if (tooLarge) return;
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}
function parseCookies(req) {
  const list = {};
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return list;
  cookieHeader.split(';').forEach(cookie => {
    const parts = cookie.split('=');
    if (parts.length >= 2) {
      const name = parts[0].trim();
      const val = parts.slice(1).join('=').trim();
      list[name] = decodeURIComponent(val);
    }
  });
  return list;
}

function setSessionCookie(res, tokenValue, maxAgeMs = SESSION_CUSTOMER_TTL_MS) {
  const secureFlag = (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging') ? '; Secure' : '';
  const maxAgeSec = Math.floor(maxAgeMs / 1000);
  res.setHeader('Set-Cookie', `kotamitra_session=${tokenValue}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${maxAgeSec}${secureFlag}`);
}

function clearSessionCookie(res) {
  const secureFlag = (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging') ? '; Secure' : '';
  res.setHeader('Set-Cookie', `kotamitra_session=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0${secureFlag}`);
}

function token(req) {
  const cookies = parseCookies(req);
  if (cookies['kotamitra_session']) return cookies['kotamitra_session'];
  const value = req.headers.authorization || '';
  return value.startsWith('Bearer ') ? value.slice(7) : '';
}

function validateCsrfOrOrigin(req, res) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return true;
  const origin = req.headers.origin;
  const cookies = parseCookies(req);
  // If request uses cookie authentication for a state-changing method, validate Origin header
  if (cookies['kotamitra_session']) {
    if (!origin || !allowedOrigins().includes(origin)) {
      json(res, 403, { error: 'CSRF validation failed: Invalid or missing Origin' });
      return false;
    }
  }
  return true;
}

function requireAdmin(req, res) { const session = getLiveSession(req); if (!session || session.role !== 'admin') { json(res, 401, { error: 'Admin login required' }); return false; } return true; }
function requireOwner(req, res) { const session = getLiveSession(req); if (!session || session.role !== 'owner' || !session.phone) { json(res, 401, { error: 'Owner login required' }); return null; } return session; }
function requireCustomer(req, res) { const session = getLiveSession(req); if (!session || !session.phone || !['customer', 'owner'].includes(session.role)) { json(res, 401, { error: 'Customer login required' }); return null; } return session; }
function validateOrderInput(input, data, session) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw validationError('Request body must be a JSON object');
  const businessId = text(input.businessId);
  const customerName = text(input.customerName);
  const customerPhone = session?.phone || normalizePhone(input.customerPhone);
  const items = Array.isArray(input.items) ? input.items : [];
  const deliveryAddress = text(input.deliveryAddress);

  if (items.length > 50) throw validationError('Order cannot contain more than 50 items');

  if (!businessId || !UUID_PATTERN.test(businessId)) throw validationError('Enter a valid business ID');
  const business = (Array.isArray(data.businesses) ? data.businesses : []).find(item => item.id === businessId);
  if (!business) throw validationError('Business not found');
  if (business.status !== 'approved') throw validationError('This business is not currently accepting orders');
  if (!customerName || customerName.length < 2 || customerName.length > 100) throw validationError('Customer name must be 2 to 100 characters');
  if (!customerPhone) throw validationError('Enter a valid Indian 10 digit mobile number');
  if (!deliveryAddress || deliveryAddress.length < 5 || deliveryAddress.length > 300) throw validationError('Delivery address must be 5 to 300 characters');
  if (items.length === 0) throw validationError('Order must contain at least one item');

  // Server-side trusted price calculation & item validation (Prevents price manipulation)
  let calculatedTotal = 0;
  const validatedItems = items.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw validationError('Each order item must be an object');
    const itemName = text(item.name);
    const qty = Number(item.quantity === undefined ? 1 : item.quantity);
    if (!itemName || itemName.length > 200 || !Number.isInteger(qty) || qty < 1 || qty > 100) throw validationError('Invalid item name or quantity');

    let unitPrice = Number(item.price === undefined ? 0 : item.price);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) unitPrice = 0;

    if (Array.isArray(business.products)) {
      const found = business.products.find(p => {
        const catalogName = typeof p === 'object' && p !== null ? p.name : p;
        return typeof catalogName === 'string' && catalogName.toLowerCase() === itemName.toLowerCase();
      });
      if (!found) throw validationError('Order item is not available in this business catalog');
      const catalogPrice = typeof found === 'object' && found !== null ? Number(found.price) : 0;
      if (Number.isFinite(catalogPrice) && catalogPrice >= 0) unitPrice = catalogPrice;
    }

    calculatedTotal += unitPrice * qty;
    if (!Number.isFinite(calculatedTotal)) throw validationError('Order total is invalid');
    return { name: itemName, price: unitPrice, quantity: qty };
  });

  return { businessId, customerName, customerPhone, items: validatedItems, totalAmount: calculatedTotal, deliveryAddress };
}
function resolveEnquiries(enquiries, businesses) {
  const byId = new Map((Array.isArray(businesses) ? businesses : []).map(business => [String(business.id), business]));
  return (Array.isArray(enquiries) ? enquiries : []).map(enquiry => {
    const business = byId.get(String(enquiry.businessId));
    return { ...enquiry, businessDetails: business ? { name: business.name || 'Unnamed business', category: business.category || '', area: business.area || '' } : null };
  });
}

const server = http.createServer(async (req, res) => {
  res.__request = req;
  if (!validateCsrfOrOrigin(req, res)) return;
  if (req.method === 'OPTIONS') {
    applyCors(req, res);
    return json(res, 204, {}, req);
  }
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, {
      ok: true,
      service: 'KotaMitra backend',
      env: process.env.NODE_ENV || 'development',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      activeSessions: sessions.size
    });
    if (req.method === 'GET' && url.pathname === '/api/areas') return json(res, 200, JSON.parse(fs.readFileSync(AREAS_FILE, 'utf8')));
    if (req.method === 'GET' && url.pathname === '/api/locations') return json(res, 200, loadLocations());
    if (req.method === 'GET' && url.pathname === '/api/locations/autocomplete') {
      const q = (url.searchParams.get('q') || '').toLowerCase().trim();
      const locs = loadLocations();
      const results = [];
      for (const region of (locs.regions || [])) {
        for (const city of (region.cities || [])) {
          if (!q || city.name.toLowerCase().includes(q) || region.name.toLowerCase().includes(q)) {
            results.push({ city: city.name, state: region.name, type: region.type });
          }
          for (const area of (city.areas || [])) {
            if (!q || area.toLowerCase().includes(q)) {
              results.push({ area, city: city.name, state: region.name, type: 'AREA' });
            }
          }
        }
      }
      return json(res, 200, { results: results.slice(0, 20) });
    }
    if (req.method === 'GET' && url.pathname === '/api/search/unified') {
      const q = (url.searchParams.get('q') || '').toLowerCase().trim();
      const state = url.searchParams.get('state') || '';
      const city = url.searchParams.get('city') || '';
      const area = url.searchParams.get('area') || '';
      const data = readData(req, url);

      const matchedBusinesses = (data.businesses || []).filter(b => {
        if (b.status !== 'approved') return false;
        if (state && b.state !== state) return false;
        if (city && b.city !== city) return false;
        if (area && b.area !== area) return false;
        if (!q) return true;
        const searchBlob = `${b.name} ${b.category} ${b.area} ${b.city || ''} ${b.state || ''} ${b.description || ''} ${JSON.stringify(b.products || '')}`.toLowerCase();
        return searchBlob.includes(q);
      });

      const matchedProducts = [];
      for (const b of matchedBusinesses) {
        if (Array.isArray(b.products)) {
          for (const p of b.products) {
            const pName = typeof p === 'object' && p !== null ? String(p.name || '') : String(p);
            const businessName = String(b.name || '');
            if (!q || pName.toLowerCase().includes(q) || businessName.toLowerCase().includes(q)) {
              matchedProducts.push({
                businessId: b.id,
                businessName: b.name,
                cityName: b.city,
                stateName: b.state,
                productName: pName,
                price: typeof p === 'object' && p !== null ? p.price : 0
              });
            }
          }
        }
      }

      const publicBusinesses = matchedBusinesses.map(({ ownerName, phone, ...bus }) => bus);
      return json(res, 200, { query: q, businesses: publicBusinesses, products: matchedProducts });
    }
    if (req.method === 'GET' && url.pathname === '/api/categories') return json(res, 200, JSON.parse(fs.readFileSync(CATEGORIES_FILE, 'utf8')));
    if (req.method === 'GET' && url.pathname === '/api/businesses') {
      const status = url.searchParams.get('status') || 'approved';
      if (status !== 'approved' && !requireAdmin(req, res)) return;
      const data = readData(req, url);
      const q = (url.searchParams.get('q') || '').toLowerCase();
      const categoryFilter = url.searchParams.get('category') || '';
      const area = url.searchParams.get('area') || 'all';
      const cityFilter = url.searchParams.get('city') || '';
      const stateFilter = url.searchParams.get('state') || '';
      const businesses = data.businesses.filter(b => {
        if (status !== 'all' && b.status !== status) return false;
        if (categoryFilter && b.category !== categoryFilter) return false;
        if (stateFilter && b.state !== stateFilter) return false;
        if (cityFilter && b.city !== cityFilter) return false;
        if (area !== 'all' && b.area !== area) return false;
        if (q && !`${b.name} ${b.category} ${b.area} ${b.city || ''} ${b.state || ''} ${b.description || ''}`.toLowerCase().includes(q)) return false;
        return true;
      });
      const publicBusinesses = status === 'approved' ? businesses.map(({ ownerName, phone, ...business }) => business) : businesses;
      return json(res, 200, { businesses: publicBusinesses });
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/request-otp') {
      if (!checkRateLimit(req, res, 'request-otp', 10, 60000)) return;
      const input = await body(req); const phone = normalizePhone(String(input.phone || ''));
      if (!phone) return json(res, 400, { error: 'Enter a valid 10 digit mobile number' });
      const existing = customerOtps.get(phone);
      if (existing && existing.cooldownUntil > Date.now()) return json(res, 429, { error: 'Please wait before requesting another OTP' });
      const provider = getOtpProvider();
      const environment = process.env.NODE_ENV || 'development';
      const development = environment === 'development' || environment === 'test';
      const otp = development ? (process.env.KOTAMITRA_OTP_DEV_CODE || '123456') : crypto.randomInt(100000, 999999).toString();
      const delivery = await provider.send(phone, otp);
      if (!delivery.delivered) return json(res, 503, { error: 'OTP delivery is not configured' });
      customerOtps.set(phone, {
        otpHash: hashOtp(phone, otp),
        expiresAt: Date.now() + OTP_TTL_MS,
        cooldownUntil: Date.now() + OTP_RESEND_COOLDOWN_MS,
        attempts: 0
      });
      saveAuthStore();
      return json(res, 200, { ok: true, message: 'OTP sent successfully', ...(development ? { developmentOtp: otp } : {}) });
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/verify-otp') {
      const input = await body(req); const phone = normalizePhone(String(input.phone || '')); const record = customerOtps.get(phone);
      if (!phone || !record || record.expiresAt < Date.now() || record.attempts >= OTP_MAX_ATTEMPTS) return json(res, 401, { error: 'Invalid or expired OTP' });
      const suppliedOtp = String(input.otp || '');
      if (!/^\d{6}$/.test(suppliedOtp) || hashOtp(phone, suppliedOtp) !== record.otpHash) {
        record.attempts += 1;
        if (record.attempts >= OTP_MAX_ATTEMPTS) customerOtps.delete(phone);
        saveAuthStore();
        return json(res, 401, { error: 'Invalid or expired OTP' });
      }
      customerOtps.delete(phone);
      const accessToken = crypto.randomBytes(32).toString('hex');
      const authData = readData(req, url);
      const claimedBusiness = (authData.businesses || []).some(business => business.phone === phone && business.ownerClaimed === true);
      const sessionType = claimedBusiness ? 'owner' : 'customer';
      const session = normalizeSession({ phone, type: sessionType, createdAt: Date.now(), capabilities: claimedBusiness ? ['owner'] : ['customer'] });
      sessions.set(accessToken, session);
      saveAuthStore();
      setSessionCookie(res, accessToken, sessionType === 'owner' ? SESSION_OWNER_TTL_MS : SESSION_CUSTOMER_TTL_MS);
      return json(res, 200, { accessToken, customer: { phone }, role: sessionType }, req);
    }
    if (req.method === 'POST' && url.pathname === '/api/admin/login') {
      if (!checkRateLimit(req, res, 'admin-login', 10, 60000)) return;
      const input = await body(req);
      if (input.email !== ADMIN_EMAIL || input.password !== ADMIN_PASSWORD) return json(res, 401, { error: 'Invalid admin credentials' });
      const accessToken = crypto.randomBytes(32).toString('hex');
      sessions.set(accessToken, normalizeSession({ email: ADMIN_EMAIL, type: 'admin', createdAt: Date.now(), capabilities: ['admin'] }));
      saveAuthStore();
      setSessionCookie(res, accessToken, SESSION_ADMIN_TTL_MS);
      return json(res, 200, { accessToken, admin: { email: ADMIN_EMAIL } }, req);
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
      const accessToken = token(req);
      if (accessToken) {
        sessions.delete(accessToken);
        saveAuthStore();
      }
      clearSessionCookie(res);
      return json(res, 200, { ok: true }, req);
    }
    if (req.method === 'POST' && url.pathname === '/api/admin/logout') {
      sessions.delete(token(req));
      saveAuthStore();
      clearSessionCookie(res);
      return json(res, 200, { ok: true }, req);
    }
    if (req.method === 'GET' && url.pathname === '/api/admin/me') { if (!requireAdmin(req, res)) return; const session = sessions.get(token(req)); return json(res, 200, { admin: { email: session.email, type: session.type } }); }
    if (req.method === 'GET' && url.pathname === '/api/enquiries') {
      if (!requireAdmin(req, res)) return;
      const data = readData(req, url);
      return json(res, 200, { enquiries: resolveEnquiries(data.enquiries, data.businesses) });
    }
    if (req.method === 'POST' && url.pathname === '/api/enquiries') {
      if (!checkRateLimit(req, res, 'enquiries', 20, 60000)) return;
      const input = await body(req); const data = readData(req, url); data.enquiries = data.enquiries || [];
      const enquiryInput = validateEnquiryInput(input, data);
      const enquiry = { id: crypto.randomUUID(), ...enquiryInput, status: 'new', createdAt: new Date().toISOString() };
      data.enquiries.push(enquiry); writeData(data, req, url); return json(res, 201, { enquiry });
    }
    if (req.method === 'PATCH' && url.pathname.startsWith('/api/enquiries/')) {
      if (!requireAdmin(req, res)) return;
      const id = url.pathname.split('/').pop(); const input = await body(req); const data = readData(req, url); data.enquiries = data.enquiries || [];
      const enquiry = data.enquiries.find(item => item.id === id); if (!enquiry) return json(res, 404, { error: 'Enquiry not found' });
      if (input.status && !['new', 'contacted', 'closed'].includes(input.status)) return json(res, 400, { error: 'Invalid enquiry status' });
      if (input.status) enquiry.status = input.status; enquiry.updatedAt = new Date().toISOString(); writeData(data, req, url); return json(res, 200, { enquiry });
    }
    if (req.method === 'POST' && url.pathname === '/api/orders') {
      if (!checkRateLimit(req, res, 'orders', 20, 60000)) return;
      const session = requireCustomer(req, res);
      if (!session) return;
      const input = await body(req); const data = readData(req, url); data.orders = data.orders || [];
      const orderInput = validateOrderInput(input, data, session);
      const order = { id: crypto.randomUUID(), ...orderInput, status: 'pending', createdAt: new Date().toISOString() };
      data.orders.push(order); writeData(data, req, url); return json(res, 201, { order });
    }
    if (req.method === 'GET' && url.pathname === '/api/customer/orders') {
      const session = requireCustomer(req, res); if (!session) return;
      const data = readData(req, url);
      const orders = (data.orders || []).filter(o => o.customerPhone === session.phone);
      return json(res, 200, { orders });
    }
    if (req.method === 'GET' && url.pathname === '/api/owner/orders') {
      const session = requireOwner(req, res); if (!session) return;
      const data = readData(req, url);
      const ownedIds = new Set((data.businesses || []).filter(b => b.phone === session.phone).map(b => b.id));
      const orders = (data.orders || []).filter(o => ownedIds.has(o.businessId));
      return json(res, 200, { orders });
    }
    if (req.method === 'POST' && url.pathname === '/api/reviews') {
      if (!checkRateLimit(req, res, 'reviews', 10, 60000)) return;
      const session = requireCustomer(req, res);
      if (!session) return;
      const input = await body(req);
      const data = readData(req, url);
      data.reviews = data.reviews || [];
      const reviewInput = validateReviewInput(input, data);

      const existing = data.reviews.find(r => r.businessId === reviewInput.businessId && r.customerPhone === session.phone);
      if (existing) return json(res, 409, { error: 'You have already reviewed this business' });

      const review = {
        id: crypto.randomUUID(),
        businessId: reviewInput.businessId,
        customerPhone: session.phone,
        rating: reviewInput.rating,
        comment: reviewInput.comment,
        status: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      data.reviews.push(review);
      writeData(data, req, url);
      return json(res, 201, { review });
    }
    if (req.method === 'GET' && url.pathname.match(/^\/api\/businesses\/[0-9a-fA-F-]+\/reviews$/)) {
      const parts = url.pathname.split('/');
      const businessId = parts[3];
      const data = readData(req, url);
      const business = (data.businesses || []).find(b => b.id === businessId);
      if (!business) return json(res, 404, { error: 'Business not found' });

      const approvedReviews = (data.reviews || []).filter(r => r.businessId === businessId && r.status === 'approved');
      const totalReviews = approvedReviews.length;
      let averageRating = 0;
      const starBreakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };

      if (totalReviews > 0) {
        const sum = approvedReviews.reduce((acc, r) => {
          starBreakdown[r.rating] = (starBreakdown[r.rating] || 0) + 1;
          return acc + r.rating;
        }, 0);
        averageRating = Number((sum / totalReviews).toFixed(1));
      }

      const reviews = approvedReviews
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 50)
        .map(({ customerPhone, ...r }) => ({ ...r, customerPhoneMasked: customerPhone ? `${customerPhone.slice(0, 2)}****${customerPhone.slice(6)}` : 'Anonymous' }));

      return json(res, 200, {
        summary: {
          averageRating: totalReviews > 0 ? averageRating : 'New',
          totalReviews,
          starBreakdown
        },
        reviews
      });
    }
    if (req.method === 'GET' && url.pathname === '/api/owner/reviews') {
      const session = requireOwner(req, res);
      if (!session) return;
      const data = readData(req, url);
      const ownedIds = new Set((data.businesses || []).filter(b => b.phone === session.phone).map(b => b.id));
      const reviews = (data.reviews || []).filter(r => ownedIds.has(r.businessId));
      return json(res, 200, { reviews });
    }
    if (req.method === 'GET' && url.pathname === '/api/admin/reviews') {
      if (!requireAdmin(req, res)) return;
      const statusFilter = url.searchParams.get('status') || 'all';
      const data = readData(req, url);
      const reviews = (data.reviews || []).filter(r => statusFilter === 'all' || r.status === statusFilter);
      return json(res, 200, { reviews });
    }
    if (req.method === 'PATCH' && url.pathname.startsWith('/api/admin/reviews/')) {
      if (!requireAdmin(req, res)) return;
      const id = url.pathname.split('/').pop();
      const input = await body(req);
      const data = readData(req, url);
      data.reviews = data.reviews || [];
      const review = data.reviews.find(item => item.id === id);
      if (!review) return json(res, 404, { error: 'Review not found' });
      if (input.status && !['pending', 'approved', 'rejected'].includes(input.status)) {
        return json(res, 400, { error: 'Invalid review status' });
      }
      if (input.status) review.status = input.status;
      review.updatedAt = new Date().toISOString();
      recalculateBusinessRating(review.businessId, data);
      writeData(data, req, url);
      return json(res, 200, { review });
    }
    if (req.method === 'PATCH' && url.pathname.startsWith('/api/owner/orders/')) {
      const session = requireOwner(req, res); if (!session) return;
      const id = url.pathname.split('/').pop();
      const input = await body(req);
      const data = readData(req, url);
      const order = (data.orders || []).find(item => item.id === id);
      if (!order) return json(res, 404, { error: 'Order not found' });
      const business = (data.businesses || []).find(item => item.id === order.businessId);
      if (!business || business.phone !== session.phone) return json(res, 403, { error: 'Access denied: Order does not belong to your business' });
      if (input.status && !['pending', 'confirmed', 'completed', 'cancelled'].includes(input.status)) return json(res, 400, { error: 'Invalid order status' });
      if (input.status) order.status = input.status;
      order.updatedAt = new Date().toISOString();
      writeData(data, req, url);
      return json(res, 200, { order });
    }
    if (req.method === 'GET' && url.pathname === '/api/subscriptions/plans') {
      return json(res, 200, { plans: SUBSCRIPTION_PLANS });
    }
    if (req.method === 'POST' && url.pathname === '/api/owner/subscriptions/create-order') {
      const session = requireOwner(req, res); if (!session) return;
      const input = await body(req);
      const businessId = text(input.businessId);
      const planId = text(input.planId);
      if (!businessId || !UUID_PATTERN.test(businessId)) return json(res, 400, { error: 'Enter a valid business ID' });
      const data = readData(req, url);
      const business = (data.businesses || []).find(b => b.id === businessId);
      if (!business || business.phone !== session.phone) return json(res, 403, { error: 'Access denied: Business does not belong to you' });
      const plan = SUBSCRIPTION_PLANS.find(p => p.id === planId);
      if (!plan) return json(res, 400, { error: 'Invalid subscription plan ID' });

      const gatewayOrder = await createPaymentGatewayOrder(plan, businessId);
      data.subscriptions = data.subscriptions || [];
      const subscription = {
        id: crypto.randomUUID(),
        businessId,
        ownerPhone: session.phone,
        planId: plan.id,
        tier: plan.tier,
        amount: plan.amount,
        currency: plan.currency,
        status: 'pending',
        gatewayOrderId: gatewayOrder.orderId,
        createdAt: new Date().toISOString()
      };
      data.subscriptions.push(subscription);
      writeData(data, req, url);
      return json(res, 201, { orderId: gatewayOrder.orderId, amount: gatewayOrder.amount, currency: gatewayOrder.currency, subscriptionId: subscription.id });
    }
    if (req.method === 'POST' && url.pathname === '/api/owner/subscriptions/verify') {
      const session = requireOwner(req, res); if (!session) return;
      const input = await body(req);
      const businessId = text(input.businessId);
      const orderId = text(input.orderId);
      const paymentId = text(input.paymentId);
      const signature = text(input.signature);
      if (!businessId || !orderId) return json(res, 400, { error: 'Missing businessId or orderId' });

      const data = readData(req, url);
      data.subscriptions = data.subscriptions || [];
      const subscription = data.subscriptions.find(s => s.gatewayOrderId === orderId && s.businessId === businessId);
      if (!subscription) return json(res, 404, { error: 'Subscription order not found' });

      if (!verifyPaymentSignature(orderId, paymentId || 'pay_mock', signature || 'sig_mock')) {
        subscription.status = 'failed';
        writeData(data, req, url);
        return json(res, 400, { error: 'Invalid payment signature' });
      }

      subscription.status = 'active';
      subscription.gatewayPaymentId = paymentId || 'pay_mock';
      subscription.activatedAt = new Date().toISOString();
      const expiresAt = new Date(Date.now() + (subscription.tier === 'verified' ? 365 : 30) * 86400000).toISOString();
      subscription.expiresAt = expiresAt;

      const business = (data.businesses || []).find(b => b.id === businessId);
      if (business) {
        business.isFeatured = true;
        business.subscriptionTier = subscription.tier;
        business.subscriptionExpiresAt = expiresAt;
        business.updatedAt = new Date().toISOString();
      }

      writeData(data, req, url);
      return json(res, 200, { ok: true, subscription });
    }
    if (req.method === 'GET' && url.pathname === '/api/owner/subscriptions') {
      const session = requireOwner(req, res); if (!session) return;
      const data = readData(req, url);
      const ownedIds = new Set((data.businesses || []).filter(b => b.phone === session.phone).map(b => b.id));
      const subscriptions = (data.subscriptions || []).filter(s => ownedIds.has(s.businessId));
      return json(res, 200, { subscriptions });
    }
    if (req.method === 'POST' && url.pathname === '/api/payments/webhook') {
      return json(res, 200, { received: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/owner/upload') {
      const session = requireOwner(req, res); if (!session) return;
      // Accept multipart/form-data or application/json with base64 data
      const contentType = String(req.headers['content-type'] || '').toLowerCase();
      const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
      const MAX_BYTES = 3 * 1024 * 1024; // 3 MB

      if (contentType.startsWith('multipart/form-data')) {
        // Parse simple multipart body (single file field named "file")
        const boundary = contentType.split('boundary=')[1];
        if (!boundary) return json(res, 400, { error: 'Missing multipart boundary' });
        const chunks = [];
        let totalSize = 0;
        let tooLarge = false;
        await new Promise((resolve, reject) => {
          req.on('data', chunk => {
            totalSize += chunk.length;
            if (totalSize > MAX_BYTES + 65536 && !tooLarge) { tooLarge = true; req.resume(); }
            if (!tooLarge) chunks.push(chunk);
          });
          req.on('end', resolve);
          req.on('error', reject);
        });
        if (tooLarge) return json(res, 413, { error: 'Image file too large (max 3 MB)' });
        const rawBuffer = Buffer.concat(chunks);
        const rawStr = rawBuffer.toString('binary');
        const sep = `--${boundary}`;
        const parts = rawStr.split(sep).slice(1, -1);
        if (!parts.length) return json(res, 400, { error: 'No file data in multipart body' });
        const part = parts[0];
        const headerEnd = part.indexOf('\r\n\r\n');
        if (headerEnd === -1) return json(res, 400, { error: 'Malformed multipart part' });
        const headers = part.slice(0, headerEnd);
        const bodyBinary = part.slice(headerEnd + 4, part.endsWith('\r\n') ? part.length - 2 : part.length);
        const ctMatch = headers.match(/content-type:\s*([^\r\n]+)/i);
        const detectedMime = ctMatch ? ctMatch[1].trim().toLowerCase() : 'application/octet-stream';
        if (!ALLOWED_MIME.has(detectedMime)) return json(res, 400, { error: 'Only JPEG, PNG, and WebP images are allowed' });
        const ext = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }[detectedMime];
        const fileBuffer = Buffer.from(bodyBinary, 'binary');
        if (fileBuffer.length > MAX_BYTES) return json(res, 413, { error: 'Image file too large (max 3 MB)' });
        const filename = `${crypto.randomUUID()}${ext}`;
        const destPath = path.join(UPLOADS_DIR, filename);
        fs.writeFileSync(destPath, fileBuffer);
        return json(res, 201, { url: `/uploads/${filename}` });
      } else if (contentType.startsWith('application/json')) {
        const input = await body(req);
        const dataUri = text(input.data);
        if (!dataUri) return json(res, 400, { error: 'Missing data field (base64 data URI expected)' });
        const match = dataUri.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/i);
        if (!match) return json(res, 400, { error: 'Only JPEG, PNG, and WebP images are allowed as base64 data URIs' });
        const mimeType = match[1].toLowerCase();
        if (!ALLOWED_MIME.has(mimeType)) return json(res, 400, { error: 'Only JPEG, PNG, and WebP images are allowed' });
        const fileBuffer = Buffer.from(match[2], 'base64');
        if (fileBuffer.length > MAX_BYTES) return json(res, 413, { error: 'Image file too large (max 3 MB)' });
        const ext = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }[mimeType];
        const filename = `${crypto.randomUUID()}${ext}`;
        const destPath = path.join(UPLOADS_DIR, filename);
        fs.writeFileSync(destPath, fileBuffer);
        return json(res, 201, { url: `/uploads/${filename}` });
      } else {
        return json(res, 415, { error: 'Content-Type must be multipart/form-data or application/json' });
      }
    }
    if (req.method === 'GET' && url.pathname.match(/^\/api\/businesses\/[0-9a-fA-F-]+\/catalog$/)) {
      const businessId = url.pathname.split('/')[3];
      const data = readData(req, url);
      const business = (data.businesses || []).find(b => b.id === businessId);
      if (!business) return json(res, 404, { error: 'Business not found' });
      data.catalog = data.catalog || {};
      const items = (data.catalog[businessId] || []).filter(item => item && !item.deleted);
      return json(res, 200, { businessId, items });
    }
    if (req.method === 'POST' && url.pathname === '/api/owner/catalog') {
      const session = requireOwner(req, res); if (!session) return;
      const input = await body(req);
      const businessId = text(input.businessId);
      if (!businessId || !UUID_PATTERN.test(businessId)) return json(res, 400, { error: 'Enter a valid business ID' });
      const data = readData(req, url);
      const business = (data.businesses || []).find(b => b.id === businessId);
      if (!business || business.phone !== session.phone) return json(res, 403, { error: 'Access denied: Business does not belong to you' });
      let itemInput;
      try { itemInput = validateCatalogItemInput(input); } catch (err) { return json(res, err.statusCode || 400, { error: err.message }); }
      data.catalog = data.catalog || {};
      data.catalog[businessId] = data.catalog[businessId] || [];
      if (data.catalog[businessId].filter(i => !i.deleted).length >= 200) return json(res, 400, { error: 'A business can have at most 200 catalog items' });
      const item = { id: crypto.randomUUID(), businessId, ...itemInput, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      data.catalog[businessId].push(item);
      writeData(data, req, url);
      return json(res, 201, { item });
    }
    if (req.method === 'PATCH' && url.pathname.match(/^\/api\/owner\/catalog\/[0-9a-fA-F-]+$/)) {
      const session = requireOwner(req, res); if (!session) return;
      const itemId = url.pathname.split('/').pop();
      const input = await body(req);
      const data = readData(req, url);
      data.catalog = data.catalog || {};
      let foundItem = null;
      let foundBizId = null;
      for (const [bizId, items] of Object.entries(data.catalog)) {
        const match = (items || []).find(i => i.id === itemId && !i.deleted);
        if (match) { foundItem = match; foundBizId = bizId; break; }
      }
      if (!foundItem) return json(res, 404, { error: 'Catalog item not found' });
      const business = (data.businesses || []).find(b => b.id === foundBizId);
      if (!business || business.phone !== session.phone) return json(res, 403, { error: 'Access denied: Item does not belong to your business' });
      let patchInput;
      try { patchInput = validateCatalogItemInput({ ...foundItem, ...input }); } catch (err) { return json(res, err.statusCode || 400, { error: err.message }); }
      Object.assign(foundItem, patchInput, { updatedAt: new Date().toISOString() });
      writeData(data, req, url);
      return json(res, 200, { item: foundItem });
    }
    if (req.method === 'DELETE' && url.pathname.match(/^\/api\/owner\/catalog\/[0-9a-fA-F-]+$/)) {
      const session = requireOwner(req, res); if (!session) return;
      const itemId = url.pathname.split('/').pop();
      const data = readData(req, url);
      data.catalog = data.catalog || {};
      let foundItem = null;
      let foundBizId = null;
      for (const [bizId, items] of Object.entries(data.catalog)) {
        const match = (items || []).find(i => i.id === itemId && !i.deleted);
        if (match) { foundItem = match; foundBizId = bizId; break; }
      }
      if (!foundItem) return json(res, 404, { error: 'Catalog item not found' });
      const business = (data.businesses || []).find(b => b.id === foundBizId);
      if (!business || business.phone !== session.phone) return json(res, 403, { error: 'Access denied: Item does not belong to your business' });
      foundItem.deleted = true;
      foundItem.updatedAt = new Date().toISOString();
      writeData(data, req, url);
      return json(res, 200, { ok: true });
    }
    if (req.method === 'GET' && url.pathname === '/api/owner/catalog') {
      const session = requireOwner(req, res); if (!session) return;
      const businessId = url.searchParams.get('businessId');
      if (!businessId || !UUID_PATTERN.test(businessId)) return json(res, 400, { error: 'Enter a valid business ID' });
      const data = readData(req, url);
      const business = (data.businesses || []).find(b => b.id === businessId);
      if (!business || business.phone !== session.phone) return json(res, 403, { error: 'Access denied: Business does not belong to you' });
      data.catalog = data.catalog || {};
      const items = (data.catalog[businessId] || []).filter(item => item && !item.deleted);
      return json(res, 200, { businessId, items });
    }
    if (req.method === 'POST' && url.pathname === '/api/businesses') {
      const input = await body(req); const businessInput = validateBusinessInput(input); const data = readData(req, url);
      const business = {
        id: crypto.randomUUID(),
        ...businessInput,
        status: 'pending',
        isVerified: false,
        isFeatured: false,
        ownerClaimed: false,
        ownerVerifiedAt: null,
        createdAt: new Date().toISOString()
      };
      data.businesses.push(business); writeData(data, req, url); return json(res, 201, { business });
    }
    if (req.method === 'GET' && url.pathname === '/api/owner/businesses') {
      const session = requireOwner(req, res); if (!session) return;
      const data = readData(req, url);
      const businesses = (data.businesses || []).filter(b => b.phone === session.phone);
      return json(res, 200, { businesses });
    }
    if (req.method === 'POST' && url.pathname === '/api/owner/claim') {
      if (!checkRateLimit(req, res, 'owner-claim', 10, 60000)) return;
      const session = requireCustomer(req, res); if (!session) return;
      const input = await body(req);
      const businessId = text(input.businessId);
      if (!businessId || !UUID_PATTERN.test(businessId)) return json(res, 400, { error: 'Enter a valid business ID' });
      const data = readData(req, url);
      const business = (data.businesses || []).find(item => item.id === businessId);
      if (!business) return json(res, 404, { error: 'Business not found' });
      if (business.phone !== session.phone) return json(res, 403, { error: 'Ownership verification failed' });
      if (business.ownerClaimed === true) return json(res, 409, { error: 'Business ownership has already been claimed' });
      business.ownerClaimed = true;
      business.ownerPhone = session.phone;
      business.ownerVerifiedAt = new Date().toISOString();
      writeData(data, req, url);
      const refreshedSession = normalizeSession({ ...session, type: 'owner', role: 'owner', capabilities: ['owner'] });
      const accessToken = token(req);
      sessions.set(accessToken, refreshedSession);
      saveAuthStore();
      setSessionCookie(res, accessToken, SESSION_OWNER_TTL_MS);
      return json(res, 200, { ok: true, business: { id: business.id, ownerClaimed: true, ownerVerifiedAt: business.ownerVerifiedAt }, role: 'owner' }, req);
    }
    if (req.method === 'PATCH' && url.pathname.startsWith('/api/owner/businesses/')) {
      const session = requireOwner(req, res); if (!session) return;
      const id = url.pathname.split('/').pop();
      const input = await body(req);
      const data = readData(req, url);
      const business = (data.businesses || []).find(item => item.id === id);
      if (!business) return json(res, 404, { error: 'Business not found' });
      if (business.phone !== session.phone) return json(res, 403, { error: 'Access denied: You do not own this business' });

      const mergedInput = { ...business, ...input, phone: business.phone, status: business.status };
      let validated;
      try { validated = validateBusinessInput(mergedInput); } catch (error) { return json(res, error.statusCode || 400, { error: error.message }); }
      const editableFields = ['name', 'category', 'ownerName', 'phone', 'whatsapp', 'state', 'city', 'area', 'address', 'description', 'products', 'pricing', 'images'];
      for (const field of editableFields) business[field] = validated[field];
      business.updatedAt = new Date().toISOString();
      writeData(data, req, url);
      return json(res, 200, { business });
    }
    if (req.method === 'GET' && url.pathname === '/api/owner/enquiries') {
      const session = requireOwner(req, res); if (!session) return;
      const data = readData(req, url);
      const ownedIds = new Set((data.businesses || []).filter(b => b.phone === session.phone).map(b => b.id));
      const enquiries = (data.enquiries || []).filter(e => ownedIds.has(e.businessId)).map(e => ({
        id: e.id,
        businessId: e.businessId,
        customerName: e.customerName,
        customerPhone: e.customerPhone,
        message: e.message,
        status: e.status,
        createdAt: e.createdAt
      }));
      return json(res, 200, { enquiries });
    }
    if (req.method === 'PATCH' && url.pathname.startsWith('/api/owner/enquiries/')) {
      const session = requireOwner(req, res); if (!session) return;
      const id = url.pathname.split('/').pop();
      const input = await body(req);
      const data = readData(req, url);
      const enquiry = (data.enquiries || []).find(item => item.id === id);
      if (!enquiry) return json(res, 404, { error: 'Enquiry not found' });
      const business = (data.businesses || []).find(item => item.id === enquiry.businessId);
      if (!business || business.phone !== session.phone) return json(res, 403, { error: 'Access denied: Enquiry does not belong to your business' });
      if (input.status && !['new', 'contacted', 'closed'].includes(input.status)) return json(res, 400, { error: 'Invalid enquiry status' });
      if (input.status) enquiry.status = input.status;
      enquiry.updatedAt = new Date().toISOString();
      writeData(data, req, url);
      return json(res, 200, { enquiry });
    }
    if (req.method === 'PATCH' && url.pathname.startsWith('/api/businesses/')) {
      if (!requireAdmin(req, res)) return;
      const id = url.pathname.split('/').pop(); const input = await body(req); const data = readData(req, url); const business = data.businesses.find(item => item.id === id);
      if (!business) return json(res, 404, { error: 'Business not found' });
      if (input.status && !['pending', 'approved', 'rejected'].includes(input.status)) return json(res, 400, { error: 'Invalid status' });
      if (input.status) business.status = input.status;
      if (typeof input.isVerified === 'boolean') business.isVerified = input.isVerified;
      if (typeof input.isFeatured === 'boolean') business.isFeatured = input.isFeatured;
      business.updatedAt = new Date().toISOString(); writeData(data, req, url); return json(res, 200, { business });
    }
    // Static file serving is restricted to public portal directories only.
    if (req.method === 'GET') {
      // Serve uploaded images from /uploads/
      if (url.pathname.startsWith('/uploads/')) {
        const filename = path.basename(url.pathname);
        if (!/^[0-9a-f-]+\.(jpg|png|webp)$/i.test(filename)) return json(res, 404, { error: 'Not found' });
        const filePath = path.join(UPLOADS_DIR, filename);
        if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return json(res, 404, { error: 'Not found' });
        const ext = path.extname(filename).toLowerCase();
        const mimeTypes = { '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
        setSecurityHeaders(res);
        res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream', 'Cache-Control': 'public, max-age=31536000, immutable' });
        fs.createReadStream(filePath).pipe(res);
        return;
      }
      let relativePath = url.pathname;
      if (relativePath === '/' || relativePath === '') relativePath = '/customer-site/index.html';
      else if (relativePath === '/business-panel' || relativePath === '/business-panel/') relativePath = '/business-panel/index.html';
      else if (relativePath === '/admin-panel' || relativePath === '/admin-panel/') relativePath = '/admin-panel/index.html';

      const publicRoots = [
        path.join(ROOT, 'customer-site'),
        path.join(ROOT, 'business-panel'),
        path.join(ROOT, 'admin-panel')
      ];
      const cleanPath = relativePath.replace(/^\/+/, '');
      const rootPublicFiles = new Set(['frontend-motion.js']);
      const candidates = rootPublicFiles.has(cleanPath)
        ? [path.join(ROOT, cleanPath)]
        : relativePath.startsWith('/customer-site/') || relativePath.startsWith('/business-panel/') || relativePath.startsWith('/admin-panel/')
          ? [path.join(ROOT, cleanPath)]
          : publicRoots.map(root => path.join(root, cleanPath));
      const targetFile = candidates.find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());

      if (targetFile) {
        const ext = path.extname(targetFile);
        const mimeTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
        setSecurityHeaders(res);
        res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
        fs.createReadStream(targetFile).pipe(res);
        return;
      }
    }
    return json(res, 404, { error: 'Route not found' });
  } catch (error) {
    const statusCode = error.statusCode || (error.message === 'Invalid JSON' ? 400 : 500);
    const publicMessage = statusCode >= 500 ? 'Internal server error' : error.message;
    if (statusCode >= 500) console.error('Request handling error:', error.message);
    return json(res, statusCode, { error: publicMessage });
  }
});
assertOtpProviderConfiguration();
server.listen(PORT, () => console.log(`KotaMitra backend running at http://localhost:${PORT}`));

function handleShutdown(signal) {
  server.close(() => {
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

module.exports = { loadAdminConfig };
