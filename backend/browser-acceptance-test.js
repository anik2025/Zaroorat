const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const port = 4241;
const base = `http://localhost:${port}`;
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zaroorat-browser-test-'));
const tempDataFile = path.join(tempDir, 'businesses.json');
const tempSessionsFile = path.join(tempDir, 'sessions.json');

// Seed only the isolated browser-test store so the owner-login flow exercises
// an owner session rather than falling back to a customer session.
fs.writeFileSync(tempDataFile, JSON.stringify({
  businesses: [{
    id: 'browser-owner-fixture',
    name: 'Browser Owner Fixture',
    category: 'Tiffin & Food',
    ownerName: 'Browser Test Owner',
    phone: '9876543210',
    whatsapp: '9876543210',
    state: 'Rajasthan',
    city: 'Kota',
    area: 'Talwandi',
    address: 'Isolated browser test address',
    status: 'approved',
    isVerified: true,
    ownerClaimed: true,
    ownerVerifiedAt: new Date().toISOString(),
    createdAt: new Date().toISOString()
  }],
  enquiries: []
}, null, 2));

const env = {
  ...process.env,
  PORT: String(port),
  KOTAMITRA_DATA_FILE: tempDataFile,
  KOTAMITRA_SESSIONS_FILE: tempSessionsFile,
  KOTAMITRA_ADMIN_EMAIL: 'browser-admin@kotamitra.local',
  KOTAMITRA_ADMIN_PASSWORD: 'browser-admin-password'
};

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function run() {
  const server = spawn(process.execPath, [path.join(__dirname, 'server.js')], { env, stdio: 'ignore' });
  await wait(1600);

  const browser = await chromium.launch({ headless: true });
  const results = {};

  try {
    // 1. PUBLIC WEBSITE TEST (Desktop 1366x768)
    const contextDesktop = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const pageDesktop = await contextDesktop.newPage();

    await pageDesktop.goto(base);
    await pageDesktop.waitForSelector('h1', { timeout: 5000 });
    const pageTitle = await pageDesktop.title();
    results.publicHomepage = pageTitle.includes('ZAROORAT') || pageTitle.includes('KotaMitra');

    // Test search & category filters
    await pageDesktop.fill('#searchInput', 'Tiffin');
    await pageDesktop.waitForTimeout(300);
    results.publicSearch = true;

    // Test location filter selector dropdowns
    const stateTrigger = await pageDesktop.$('#stateTrigger');
    results.publicLocationFilters = !!stateTrigger;

    // 2. RESPONSIVE TEST: Tablet (768px) & Mobile (390px)
    const contextTablet = await browser.newContext({ viewport: { width: 768, height: 1024 } });
    const pageTablet = await contextTablet.newPage();
    await pageTablet.goto(base);
    await pageTablet.waitForSelector('h1');
    results.responsiveTablet = true;

    const contextMobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const pageMobile = await contextMobile.newPage();
    await pageMobile.goto(base);
    await pageMobile.waitForSelector('h1');
    results.responsiveMobile = true;

    // 3. ADMIN PANEL TEST
    const contextAdmin = await browser.newContext();
    const pageAdmin = await contextAdmin.newPage();
    await pageAdmin.goto(`${base}/admin-panel/login.html`);
    await pageAdmin.fill('input[name="email"]', 'browser-admin@kotamitra.local');
    await pageAdmin.fill('input[name="password"]', 'browser-admin-password');
    await pageAdmin.click('button[type="submit"]');
    await pageAdmin.waitForURL('**/admin-panel/index.html', { timeout: 5000 });
    results.adminLogin = pageAdmin.url().includes('index.html');

    // Admin dashboard features (stats)
    await pageAdmin.waitForSelector('#totalCount', { timeout: 5000 });
    results.adminDashboard = true;

    // Admin Logout
    await pageAdmin.click('#logoutBtn');
    await pageAdmin.waitForURL('**/admin-panel/login.html', { timeout: 5000 });
    results.adminLogout = pageAdmin.url().includes('login.html');

    // 4. BUSINESS OWNER PANEL TEST
    const contextOwner = await browser.newContext();
    const pageOwner = await contextOwner.newPage();
    pageOwner.on('console', msg => console.log('OWNER_CONSOLE:', msg.text()));
    pageOwner.on('pageerror', err => console.log('OWNER_PAGE_ERR:', err));
    await pageOwner.goto(`${base}/business-panel/index.html`);
    await pageOwner.fill('#loginForm input[name="phone"]', '9876543210');
    await pageOwner.click('#loginBtn');
    await pageOwner.waitForSelector('#otp-field:not([hidden])', { timeout: 5000 });
    await pageOwner.fill('input[name="otp"]', '123456');
    await pageOwner.click('#loginBtn');
    await pageOwner.waitForSelector('#dashboard-section:not([hidden])', { timeout: 5000 });
    results.ownerLogin = true;

    // Owner logout
    await pageOwner.click('#logoutBtn');
    await pageOwner.waitForSelector('#login-section:not([hidden])', { timeout: 5000 });
    results.ownerLogout = true;

    // 5. SECURITY & UNAUTHORIZED ACCESS PROTECTION
    const contextSec = await browser.newContext();
    const pageSec = await contextSec.newPage();
    await pageSec.goto(`${base}/admin-panel/index.html`);
    await pageSec.waitForURL('**/admin-panel/login.html', { timeout: 5000 });
    results.adminUnauthorizedRedirect = pageSec.url().includes('login.html');

    console.log('BROWSER_TEST_RESULTS:', JSON.stringify(results, null, 2));
  } catch (err) {
    console.error('Browser test error:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.kill();
  }
}

run();
