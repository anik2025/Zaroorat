const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const port = 4243;
const base = `http://localhost:${port}`;
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zaroorat-phase9-test-'));
const tempDataFile = path.join(tempDir, 'businesses.json');
const tempSessionsFile = path.join(tempDir, 'sessions.json');

// Seed only the isolated verification store so OTP login receives an owner role.
fs.writeFileSync(tempDataFile, JSON.stringify({
  businesses: [{
    id: 'phase9-owner-fixture',
    name: 'Phase 9 Owner Fixture',
    category: 'Tiffin & Food',
    ownerName: 'Phase 9 Test Owner',
    phone: '9811122233',
    whatsapp: '9811122233',
    state: 'Rajasthan',
    city: 'Kota',
    area: 'Talwandi',
    address: 'Isolated visual verification address',
    status: 'approved',
    isVerified: true,
    ownerClaimed: true,
    ownerVerifiedAt: new Date().toISOString(),
    createdAt: new Date().toISOString()
  }],
  enquiries: []
}, null, 2));

const screenshotDir = path.join(__dirname, '..', 'screenshots');
fs.mkdirSync(screenshotDir, { recursive: true });

const env = {
  ...process.env,
  PORT: String(port),
  KOTAMITRA_DATA_FILE: tempDataFile,
  KOTAMITRA_SESSIONS_FILE: tempSessionsFile,
  KOTAMITRA_ADMIN_EMAIL: 'v-admin@kotamitra.local',
  KOTAMITRA_ADMIN_PASSWORD: 'v-admin-password'
};

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function run() {
  const server = spawn(process.execPath, [path.join(__dirname, 'server.js')], { env, stdio: 'ignore' });
  await wait(1800);

  const browser = await chromium.launch({ headless: true });
  const results = {};
  const consoleErrors = [];

  try {
    // 1. Customer Homepage & Dropdown Test
    const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await context.newPage();
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

    await page.goto(base);
    await page.waitForSelector('h1', { timeout: 5000 });
    results.customerHomepage = await page.title();
    await page.screenshot({ path: path.join(screenshotDir, 'customer-homepage.png') });

    // Open State dropdown
    await page.click('#stateTrigger');
    await page.waitForSelector('#statePanel:not([hidden])', { timeout: 3000 });
    const stateOptionsCount = await page.locator('#stateOptions .dropdown-option').count();
    results.stateDropdownVisible = stateOptionsCount > 0;
    await page.screenshot({ path: path.join(screenshotDir, 'state-dropdown-open.png') });
    // Click out to close dropdown
    await page.click('body', { position: { x: 10, y: 10 } });

    // 2. Business Owner Panel - Login & Dashboard Screenshots
    const contextOwner = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const pageOwner = await contextOwner.newPage();
    pageOwner.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

    await pageOwner.goto(`${base}/business-panel/index.html`);
    await pageOwner.fill('#loginForm input[name="phone"]', '9811122233');
    await pageOwner.click('#loginBtn');
    await pageOwner.waitForSelector('#otp-field:not([hidden])', { timeout: 5000 });
    await pageOwner.fill('input[name="otp"]', '123456');
    await pageOwner.click('#loginBtn');
    await pageOwner.waitForSelector('#dashboard-section:not([hidden])', { timeout: 5000 });
    results.ownerDashboard = true;
    await pageOwner.screenshot({ path: path.join(screenshotDir, 'business-dashboard.png') });

    // Click Add Business tab
    await pageOwner.click('#navRegister');
    await pageOwner.waitForSelector('#register-section:not([hidden])', { timeout: 5000 });
    results.addBusinessForm = true;
    await pageOwner.screenshot({ path: path.join(screenshotDir, 'add-business-form.png') });

    // Test "Same as registered number" checkbox interaction
    const mobileInput = pageOwner.locator('#register-section input[name="phone"]');
    const whatsappInput = pageOwner.locator('#register-section input[name="whatsapp"]');
    const checkbox = pageOwner.locator('#sameAsRegistered');

    await mobileInput.fill('9822233344');
    // Check box
    await checkbox.check();
    const whatsappVal1 = await whatsappInput.inputValue();
    results.checkboxCopyWorks = whatsappVal1 === '9822233344';
    await pageOwner.screenshot({ path: path.join(screenshotDir, 'same-as-registered-checked.png') });

    // Change mobile number, verify sync
    await mobileInput.fill('9833344455');
    const whatsappVal2 = await whatsappInput.inputValue();
    results.checkboxSyncWorks = whatsappVal2 === '9833344455';

    // Manually edit WhatsApp, verify checkbox unchecks
    await whatsappInput.fill('9844455566');
    const isCheckedAfterEdit = await checkbox.isChecked();
    results.manualEditUnchecks = !isCheckedAfterEdit;

    // Check again, verify copy works again
    await checkbox.check();
    const whatsappVal3 = await whatsappInput.inputValue();
    results.checkboxRecheckWorks = whatsappVal3 === '9833344455';

    // 3. Mobile Layout Verification (390x844)
    const contextMobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const pageMobile = await contextMobile.newPage();
    await pageMobile.goto(`${base}/business-panel/index.html`);
    await pageMobile.fill('#loginForm input[name="phone"]', '9811122233');
    await pageMobile.click('#loginBtn');
    await pageMobile.waitForSelector('#otp-field:not([hidden])');
    await pageMobile.fill('input[name="otp"]', '123456');
    await pageMobile.click('#loginBtn');
    await pageMobile.waitForSelector('#dashboard-section:not([hidden])');
    await pageMobile.click('#navRegister');
    await pageMobile.waitForSelector('#register-section:not([hidden])');
    results.mobileLayoutLoaded = true;
    await pageMobile.screenshot({ path: path.join(screenshotDir, 'mobile-layout.png') });

    // 4. Admin Dashboard Verification
    const contextAdmin = await browser.newContext();
    const pageAdmin = await contextAdmin.newPage();
    await pageAdmin.goto(`${base}/admin-panel/login.html`);
    await pageAdmin.fill('input[name="email"]', 'v-admin@kotamitra.local');
    await pageAdmin.fill('input[name="password"]', 'v-admin-password');
    await pageAdmin.click('button[type="submit"]');
    await pageAdmin.waitForURL('**/admin-panel/index.html', { timeout: 5000 });
    results.adminDashboardLoaded = pageAdmin.url().includes('index.html');
    await pageAdmin.waitForSelector('#totalCount');
    await pageAdmin.screenshot({ path: path.join(screenshotDir, 'admin-dashboard.png') });

    results.consoleErrors = consoleErrors;
    console.log('PHASE9_VERIFICATION_RESULTS:', JSON.stringify(results, null, 2));

    const failedChecks = Object.entries(results).filter(([key, val]) => key !== 'consoleErrors' && val !== true && typeof val !== 'string');
    if (failedChecks.length > 0) {
      console.error('Failed verification checks:', failedChecks);
      process.exitCode = 1;
    } else {
      console.log('All Phase 9.1 visual & functional verification tests passed successfully!');
    }

  } catch (err) {
    console.error('Error during Phase 9.1 verification:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.kill();
  }
}

run();
