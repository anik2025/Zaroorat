const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'database', 'data');
const DATA_FILE = process.env.KOTAMITRA_DATA_FILE || path.join(DATA_DIR, 'businesses.json');
const AREAS_FILE = path.join(ROOT, 'database', 'areas.json');
const LOCATIONS_FILE = path.join(ROOT, 'database', 'locations.json');
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
const sessions = new Map();
const customerOtps = new Map();
const VALID_CATEGORIES = new Set(['Tiffin & Food', 'PG & Hostel', 'Laundry', 'Repairs', 'Tutors', 'Salon & Beauty', 'Printing', 'Bakery & Cakes', 'Cleaning', 'Packers & Movers', 'Tailor & Boutique']);
const PHONE_PATTERN = /^[6-9]\d{9}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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
  return { ...input, name, category, ownerName, phone, whatsapp, state, city, area, address, description };
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
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({ businesses: [] }, null, 2));

function readData() { const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); data.enquiries = data.enquiries || []; return data; }
function writeData(data) { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); }
function json(res, status, body) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS' }); res.end(JSON.stringify(body)); }
function body(req) { return new Promise((resolve, reject) => { let raw = ''; req.on('data', chunk => { raw += chunk; if (raw.length > 1000000) req.destroy(); }); req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('Invalid JSON')); } }); req.on('error', reject); }); }
function token(req) { const value = req.headers.authorization || ''; return value.startsWith('Bearer ') ? value.slice(7) : ''; }
function requireAdmin(req, res) { const session = sessions.get(token(req)); if (!session || session.type !== 'admin') { json(res, 401, { error: 'Admin login required' }); return false; } return true; }
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
    if (req.method === 'GET' && url.pathname === '/api/businesses') {
      const status = url.searchParams.get('status') || 'approved';
      if (status === 'all' && !requireAdmin(req, res)) return;
      const data = readData(); const q = (url.searchParams.get('q') || '').toLowerCase(); const area = url.searchParams.get('area') || 'all';
      const businesses = data.businesses.filter(b => (status === 'all' || b.status === status) && (!q || `${b.name} ${b.category} ${b.area}`.toLowerCase().includes(q)) && (area === 'all' || b.area === area));
      const publicBusinesses = status === 'approved' ? businesses.map(({ ownerName, phone, ...business }) => business) : businesses;
      return json(res, 200, { businesses: publicBusinesses });
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/request-otp') {
      const input = await body(req); const phone = String(input.phone || '').replace(/\D/g, '');
      if (!/^\d{10}$/.test(phone)) return json(res, 400, { error: 'Enter a valid 10 digit mobile number' });
      const otp = process.env.NODE_ENV === 'production' ? null : '123456';
      customerOtps.set(phone, { otp: otp || crypto.randomInt(100000, 999999).toString(), expiresAt: Date.now() + 300000 });
      return json(res, 200, { ok: true, message: 'OTP generated for development', ...(process.env.NODE_ENV === 'production' ? {} : { developmentOtp: otp }) });
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/verify-otp') {
      const input = await body(req); const phone = String(input.phone || '').replace(/\D/g, ''); const record = customerOtps.get(phone);
      if (!record || record.expiresAt < Date.now() || String(input.otp) !== record.otp) return json(res, 401, { error: 'Invalid or expired OTP' });
      customerOtps.delete(phone); const accessToken = crypto.randomBytes(32).toString('hex'); sessions.set(accessToken, { phone, type: 'customer', createdAt: Date.now() });
      return json(res, 200, { accessToken, customer: { phone } });
    }
    if (req.method === 'POST' && url.pathname === '/api/admin/login') {
      const input = await body(req);
      if (input.email !== ADMIN_EMAIL || input.password !== ADMIN_PASSWORD) return json(res, 401, { error: 'Invalid admin credentials' });
      const accessToken = crypto.randomBytes(32).toString('hex'); sessions.set(accessToken, { email: ADMIN_EMAIL, type: 'admin', createdAt: Date.now() });
      return json(res, 200, { accessToken, admin: { email: ADMIN_EMAIL } });
    }
    if (req.method === 'POST' && url.pathname === '/api/admin/logout') { sessions.delete(token(req)); return json(res, 200, { ok: true }); }
    if (req.method === 'GET' && url.pathname === '/api/admin/me') { if (!requireAdmin(req, res)) return; return json(res, 200, { admin: sessions.get(token(req)) }); }
    if (req.method === 'GET' && url.pathname === '/api/enquiries') {
      if (!requireAdmin(req, res)) return;
      const data = readData();
      return json(res, 200, { enquiries: resolveEnquiries(data.enquiries, data.businesses) });
    }
    if (req.method === 'POST' && url.pathname === '/api/enquiries') {
      const input = await body(req); const data = readData(); data.enquiries = data.enquiries || [];
      const enquiryInput = validateEnquiryInput(input, data);
      const enquiry = { id: crypto.randomUUID(), ...enquiryInput, status: 'new', createdAt: new Date().toISOString() };
      data.enquiries.push(enquiry); writeData(data); return json(res, 201, { enquiry });
    }
    if (req.method === 'PATCH' && url.pathname.startsWith('/api/enquiries/')) {
      if (!requireAdmin(req, res)) return;
      const id = url.pathname.split('/').pop(); const input = await body(req); const data = readData(); data.enquiries = data.enquiries || [];
      const enquiry = data.enquiries.find(item => item.id === id); if (!enquiry) return json(res, 404, { error: 'Enquiry not found' });
      if (input.status && !['new', 'contacted', 'closed'].includes(input.status)) return json(res, 400, { error: 'Invalid enquiry status' });
      if (input.status) enquiry.status = input.status; enquiry.updatedAt = new Date().toISOString(); writeData(data); return json(res, 200, { enquiry });
    }
    if (req.method === 'POST' && url.pathname === '/api/businesses') {
      const input = await body(req); const businessInput = validateBusinessInput(input); const data = readData();
      const business = { id: crypto.randomUUID(), ...businessInput, status: 'pending', isVerified: false, isFeatured: false, createdAt: new Date().toISOString() };
      data.businesses.push(business); writeData(data); return json(res, 201, { business });
    }
    if (req.method === 'PATCH' && url.pathname.startsWith('/api/businesses/')) {
      if (!requireAdmin(req, res)) return;
      const id = url.pathname.split('/').pop(); const input = await body(req); const data = readData(); const business = data.businesses.find(item => item.id === id);
      if (!business) return json(res, 404, { error: 'Business not found' });
      if (input.status && !['pending', 'approved', 'rejected'].includes(input.status)) return json(res, 400, { error: 'Invalid status' });
      if (input.status) business.status = input.status;
      if (typeof input.isVerified === 'boolean') business.isVerified = input.isVerified;
      if (typeof input.isFeatured === 'boolean') business.isFeatured = input.isFeatured;
      business.updatedAt = new Date().toISOString(); writeData(data); return json(res, 200, { business });
    }
    return json(res, 404, { error: 'Route not found' });
  } catch (error) { return json(res, error.statusCode || (error.message === 'Invalid JSON' ? 400 : 500), { error: error.message }); }
});
server.listen(PORT, () => console.log(`KotaMitra backend running at http://localhost:${PORT}`));

module.exports = { loadAdminConfig };
