const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'database', 'data');
const DEFAULT_DATA_FILE = path.join(DATA_DIR, 'businesses.json');
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
const SESSIONS_FILE = process.env.KOTAMITRA_SESSIONS_FILE || path.join(DATA_DIR, 'sessions.json');
const sessions = new Map();
const customerOtps = new Map();

function loadAuthStore() {
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      const raw = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
      const now = Date.now();
      if (raw.sessions) {
        for (const [token, s] of Object.entries(raw.sessions)) {
          const maxAge = s.type === 'admin' ? 86400000 : 7 * 86400000;
          if (!s.createdAt || (now - s.createdAt) < maxAge) {
            sessions.set(token, s);
          }
        }
      }
      if (raw.customerOtps) {
        for (const [phone, o] of Object.entries(raw.customerOtps)) {
          if (o.expiresAt && o.expiresAt > now) {
            customerOtps.set(phone, o);
          }
        }
      }
    }
  } catch (err) {
    console.error('Session load error');
  }
}

function saveAuthStore() {
  try {
    fs.mkdirSync(path.dirname(SESSIONS_FILE), { recursive: true });
    const sessObj = {};
    for (const [k, v] of sessions.entries()) sessObj[k] = v;
    const otpsObj = {};
    for (const [k, v] of customerOtps.entries()) otpsObj[k] = v;
    const tmpFile = `${SESSIONS_FILE}.tmp.${Date.now()}.${Math.random().toString(36).slice(2)}`;
    fs.writeFileSync(tmpFile, JSON.stringify({ sessions: sessObj, customerOtps: otpsObj }, null, 2));
    fs.renameSync(tmpFile, SESSIONS_FILE);
  } catch (err) {
    console.error('Session save error');
  }
}

loadAuthStore();

// IP-based Rate Limiter Store
const rateLimitMap = new Map();
function checkRateLimit(req, res, actionKey, maxRequests, windowMs) {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : '') || req.socket.remoteAddress || 'unknown';
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
  const products = input.products === undefined ? [] : (Array.isArray(input.products) ? input.products.map(p => {
    if (typeof p === 'object' && p !== null && p.name) return { name: text(p.name), price: Number(p.price || 0) };
    const str = text(p);
    return str ? { name: str, price: 0 } : null;
  }).filter(Boolean) : typeof input.products === 'string' ? input.products.split(',').map(p => { const str = p.trim(); return str ? { name: str, price: 0 } : null; }).filter(Boolean) : []);
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

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
fs.mkdirSync(path.dirname(SESSIONS_FILE), { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({ businesses: [] }, null, 2));

function isDemoMode(req, url) {
  if (!req || !url) return process.env.KOTAMITRA_DEMO_MODE === 'true';
  return process.env.KOTAMITRA_DEMO_MODE === 'true' ||
         req.headers['x-demo-mode'] === 'true' ||
         url.searchParams.get('demo') === 'true';
}

function getDataFilePath(req, url) {
  if (process.env.KOTAMITRA_DATA_FILE) {
    return process.env.KOTAMITRA_DATA_FILE;
  }
  if (isDemoMode(req, url) && fs.existsSync(DEMO_FILE)) {
    return DEMO_FILE;
  }
  return DATA_FILE;
}

function readData(req, url) {
  const file = getDataFilePath(req, url);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  data.enquiries = data.enquiries || [];
  return data;
}

function writeData(data, req, url) {
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

function json(res, status, body) {
  if (res.headersSent) return;
  setSecurityHeaders(res);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS' });
  res.end(JSON.stringify(body));
}
function body(req) { return new Promise((resolve, reject) => { let raw = ''; req.on('data', chunk => { raw += chunk; if (raw.length > 1000000) req.destroy(); }); req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('Invalid JSON')); } }); req.on('error', reject); }); }
function token(req) { const value = req.headers.authorization || ''; return value.startsWith('Bearer ') ? value.slice(7) : ''; }
function requireAdmin(req, res) { const session = sessions.get(token(req)); if (!session || session.type !== 'admin') { json(res, 401, { error: 'Admin login required' }); return false; } return true; }
function requireOwner(req, res) { const session = sessions.get(token(req)); if (!session || !session.phone) { json(res, 401, { error: 'Owner login required' }); return null; } return session; }
function requireCustomer(req, res) { const session = sessions.get(token(req)); if (!session || session.type !== 'customer') { json(res, 401, { error: 'Customer login required' }); return null; } return session; }
function validateOrderInput(input, data, session) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw validationError('Request body must be a JSON object');
  const businessId = text(input.businessId);
  const customerName = text(input.customerName);
  const customerPhone = session?.phone || normalizePhone(input.customerPhone);
  const items = Array.isArray(input.items) ? input.items : [];
  const deliveryAddress = text(input.deliveryAddress);

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
    const itemName = text(item.name);
    const qty = Number(item.quantity || 1);
    if (!itemName || qty < 1 || qty > 100) throw validationError('Invalid item name or quantity');

    let unitPrice = Number(item.price || 0);
    if (isNaN(unitPrice) || unitPrice < 0) unitPrice = 0;

    if (Array.isArray(business.products)) {
      const found = business.products.find(p => typeof p === 'object' && p !== null && p.name && p.name.toLowerCase() === itemName.toLowerCase());
      if (found && typeof found.price === 'number') {
        unitPrice = found.price;
      }
    }

    calculatedTotal += unitPrice * qty;
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
  if (req.method === 'OPTIONS') return json(res, 204, {});
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, { ok: true, service: 'KotaMitra backend' });
    if (req.method === 'GET' && url.pathname === '/api/areas') return json(res, 200, JSON.parse(fs.readFileSync(AREAS_FILE, 'utf8')));
    if (req.method === 'GET' && url.pathname === '/api/locations') return json(res, 200, loadLocations());
    if (req.method === 'GET' && url.pathname === '/api/categories') return json(res, 200, JSON.parse(fs.readFileSync(CATEGORIES_FILE, 'utf8')));
    if (req.method === 'GET' && url.pathname === '/api/businesses') {
      const status = url.searchParams.get('status') || 'approved';
      if (status === 'all' && !requireAdmin(req, res)) return;
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
      const input = await body(req); const phone = String(input.phone || '').replace(/\D/g, '');
      if (!/^\d{10}$/.test(phone)) return json(res, 400, { error: 'Enter a valid 10 digit mobile number' });
      const otp = process.env.NODE_ENV === 'production' ? null : '123456';
      customerOtps.set(phone, { otp: otp || crypto.randomInt(100000, 999999).toString(), expiresAt: Date.now() + 300000 });
      saveAuthStore();
      return json(res, 200, { ok: true, message: 'OTP generated for development', ...(process.env.NODE_ENV === 'production' ? {} : { developmentOtp: otp }) });
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/verify-otp') {
      const input = await body(req); const phone = String(input.phone || '').replace(/\D/g, ''); const record = customerOtps.get(phone);
      if (!record || record.expiresAt < Date.now() || String(input.otp) !== record.otp) return json(res, 401, { error: 'Invalid or expired OTP' });
      customerOtps.delete(phone); const accessToken = crypto.randomBytes(32).toString('hex'); sessions.set(accessToken, { phone, type: 'customer', createdAt: Date.now() });
      saveAuthStore();
      return json(res, 200, { accessToken, customer: { phone } });
    }
    if (req.method === 'POST' && url.pathname === '/api/admin/login') {
      if (!checkRateLimit(req, res, 'admin-login', 10, 60000)) return;
      const input = await body(req);
      if (input.email !== ADMIN_EMAIL || input.password !== ADMIN_PASSWORD) return json(res, 401, { error: 'Invalid admin credentials' });
      const accessToken = crypto.randomBytes(32).toString('hex'); sessions.set(accessToken, { email: ADMIN_EMAIL, type: 'admin', createdAt: Date.now() });
      saveAuthStore();
      return json(res, 200, { accessToken, admin: { email: ADMIN_EMAIL } });
    }
    if (req.method === 'POST' && url.pathname === '/api/admin/logout') { sessions.delete(token(req)); saveAuthStore(); return json(res, 200, { ok: true }); }
    if (req.method === 'GET' && url.pathname === '/api/admin/me') { if (!requireAdmin(req, res)) return; return json(res, 200, { admin: sessions.get(token(req)) }); }
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
    if (req.method === 'POST' && url.pathname === '/api/businesses') {
      const input = await body(req); const businessInput = validateBusinessInput(input); const data = readData(req, url);
      const business = { id: crypto.randomUUID(), ...businessInput, status: 'pending', isVerified: false, isFeatured: false, createdAt: new Date().toISOString() };
      data.businesses.push(business); writeData(data, req, url); return json(res, 201, { business });
    }
    if (req.method === 'GET' && url.pathname === '/api/owner/businesses') {
      const session = requireOwner(req, res); if (!session) return;
      const data = readData(req, url);
      const businesses = (data.businesses || []).filter(b => b.phone === session.phone);
      return json(res, 200, { businesses });
    }
    if (req.method === 'PATCH' && url.pathname.startsWith('/api/owner/businesses/')) {
      const session = requireOwner(req, res); if (!session) return;
      const id = url.pathname.split('/').pop();
      const input = await body(req);
      const data = readData(req, url);
      const business = (data.businesses || []).find(item => item.id === id);
      if (!business) return json(res, 404, { error: 'Business not found' });
      if (business.phone !== session.phone) return json(res, 403, { error: 'Access denied: You do not own this business' });

      const name = text(input.name); const category = text(input.category); const ownerName = text(input.ownerName); const address = text(input.address); const description = input.description === undefined ? business.description : text(input.description);
      if (name && (name.length < 2 || name.length > 100)) return json(res, 400, { error: 'Business name must be 2 to 100 characters' });
      if (category && !VALID_CATEGORIES.has(category)) return json(res, 400, { error: 'Select a valid business category' });
      if (ownerName && (ownerName.length < 2 || ownerName.length > 100)) return json(res, 400, { error: 'Owner name must be 2 to 100 characters' });
      if (address && (address.length < 5 || address.length > 300)) return json(res, 400, { error: 'Address must be 5 to 300 characters' });
      if (description !== null && description.length > 1000) return json(res, 400, { error: 'Description must be at most 1000 characters' });

      if (name) business.name = name;
      if (category) business.category = category;
      if (ownerName) business.ownerName = ownerName;
      if (address) business.address = address;
      if (description !== undefined) business.description = description;
      if (input.whatsapp !== undefined) {
        const whatsapp = input.whatsapp === '' ? '' : normalizePhone(input.whatsapp);
        if (input.whatsapp !== '' && !whatsapp) return json(res, 400, { error: 'WhatsApp number must be a valid Indian 10 digit mobile number' });
        business.whatsapp = whatsapp;
      }
      if (input.state) business.state = text(input.state);
      if (input.city) business.city = text(input.city);
      if (input.area !== undefined) business.area = text(input.area);
      if (input.products !== undefined) {
        business.products = Array.isArray(input.products) ? input.products.map(p => text(p)).filter(Boolean) : typeof input.products === 'string' ? input.products.split(',').map(p => p.trim()).filter(Boolean) : [];
      }
      if (input.pricing !== undefined) {
        business.pricing = text(input.pricing);
      }
      if (input.images !== undefined) {
        business.images = Array.isArray(input.images) ? input.images.map(i => text(i)).filter(Boolean) : typeof input.images === 'string' ? input.images.split(',').map(i => i.trim()).filter(Boolean) : [];
      }

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
    // Static file serving
    if (req.method === 'GET') {
      let relativePath = url.pathname;
      if (relativePath === '/' || relativePath === '') relativePath = '/customer-site/index.html';
      else if (relativePath === '/business-panel' || relativePath === '/business-panel/') relativePath = '/business-panel/index.html';
      else if (relativePath === '/admin-panel' || relativePath === '/admin-panel/') relativePath = '/admin-panel/index.html';

      let targetFile = path.join(ROOT, relativePath);
      // Check if file exists in the specific directory (e.g., customer-site/...)
      if (!fs.existsSync(targetFile)) {
         if (fs.existsSync(path.join(ROOT, 'customer-site', relativePath))) targetFile = path.join(ROOT, 'customer-site', relativePath);
         else if (fs.existsSync(path.join(ROOT, 'business-panel', relativePath))) targetFile = path.join(ROOT, 'business-panel', relativePath);
         else if (fs.existsSync(path.join(ROOT, 'admin-panel', relativePath))) targetFile = path.join(ROOT, 'admin-panel', relativePath);
      }

      if (fs.existsSync(targetFile) && fs.statSync(targetFile).isFile()) {
        const ext = path.extname(targetFile);
        const mimeTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
        setSecurityHeaders(res);
        res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
        fs.createReadStream(targetFile).pipe(res);
        return;
      }
    }
    return json(res, 404, { error: 'Route not found' });
  } catch (error) { return json(res, error.statusCode || (error.message === 'Invalid JSON' ? 400 : 500), { error: error.message }); }
});
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
