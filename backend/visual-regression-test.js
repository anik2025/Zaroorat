const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const PORT = 4298;
const BASE = `http://localhost:${PORT}`;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function run() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kotamitra-visual-'));
  const server = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    env: {
      ...process.env,
      PORT: String(PORT),
      KOTAMITRA_DATA_FILE: path.join(tempDir, 'businesses.json'),
      KOTAMITRA_SESSIONS_FILE: path.join(tempDir, 'sessions.json'),
      KOTAMITRA_ADMIN_EMAIL: 'visual-admin@example.test',
      KOTAMITRA_ADMIN_PASSWORD: 'visual-password'
    },
    stdio: 'ignore'
  });
  await wait(1000);

  const browser = await chromium.launch({ headless: true });
  const screenshotsDir = path.join(__dirname, '../docs/screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  try {
    // 1. Desktop Viewport (1280x800)
    const contextDesktop = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const pageDesktop = await contextDesktop.newPage();

    // Customer Home
    await pageDesktop.goto(BASE);
    await pageDesktop.waitForSelector('.brand', { timeout: 5000 });
    await pageDesktop.screenshot({ path: path.join(screenshotsDir, 'customer-desktop.png') });

    // Business Panel
    await pageDesktop.goto(`${BASE}/business-panel/index.html`);
    await pageDesktop.waitForSelector('.brand', { timeout: 5000 });
    await pageDesktop.screenshot({ path: path.join(screenshotsDir, 'business-desktop.png') });

    // Admin Login
    await pageDesktop.goto(`${BASE}/admin-panel/login.html`);
    await pageDesktop.waitForSelector('form', { timeout: 5000 });
    await pageDesktop.screenshot({ path: path.join(screenshotsDir, 'admin-login-desktop.png') });

    // 2. Mobile Viewport (375x812)
    const contextMobile = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true });
    const pageMobile = await contextMobile.newPage();

    // Customer Home Mobile
    await pageMobile.goto(BASE);
    await pageMobile.waitForSelector('.brand', { timeout: 5000 });
    await pageMobile.screenshot({ path: path.join(screenshotsDir, 'customer-mobile.png') });

    console.log('Visual regression baseline screenshots successfully captured at:', screenshotsDir);
  } finally {
    browser.close();
    server.kill();
  }
}

run().catch(err => {
  console.error('Visual regression test failed:', err);
  process.exitCode = 1;
});
