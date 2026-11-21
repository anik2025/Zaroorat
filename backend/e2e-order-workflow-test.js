const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const port = 4277;
const base = `http://localhost:${port}`;
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zaroorat-e2e-order-'));
const tempDataFile = path.join(tempDir, 'businesses.json');
const tempSessionsFile = path.join(tempDir, 'sessions.json');
const screenshotDir = path.join(__dirname, '..', 'screenshots');
fs.mkdirSync(screenshotDir, { recursive: true });

const env = {
  ...process.env,
  PORT: String(port),
  KOTAMITRA_DATA_FILE: tempDataFile,
  KOTAMITRA_SESSIONS_FILE: tempSessionsFile,
  KOTAMITRA_ADMIN_EMAIL: 'admin@kotamitra.local',
  KOTAMITRA_ADMIN_PASSWORD: 'change-this-password'
};

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function run() {
    // Seed an approved business with structured products in the test database
    const initialData = {
      businesses: [
        {
          id: '11111111-2222-3333-4444-555555555555',
          name: 'Royal Rajasthani Tiffin',
          category: 'Tiffin & Food',
          ownerName: 'Chef Vikram Singh',
          phone: '9876543210',
          whatsapp: '9876543210',
          state: 'Rajasthan',
          city: 'Kota',
          area: 'Talwandi',
          address: 'Plot 42, Near Commerce College, Talwandi',
          description: 'Authentic homely thalis & tiffin service in Kota.',
          products: [
            { name: 'Special Dal Baati Thali', price: 180 },
            { name: 'Standard Student Tiffin', price: 90 }
          ],
          status: 'approved',
          isVerified: true,
          createdAt: new Date().toISOString()
        }
      ],
      orders: []
    };
    fs.writeFileSync(tempDataFile, JSON.stringify(initialData, null, 2));

  const server = spawn(process.execPath, [path.join(__dirname, 'server.js')], { env, stdio: 'inherit' });
  await wait(1500);

  const browser = await chromium.launch({ headless: true });
  const results = {};
  const consoleErrors = [];

  try {
    // Phase A: Customer tests
    const customerContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const customerPage = await customerContext.newPage();
    customerPage.on('console', msg => { console.log('Browser console:', msg.text()); if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    customerPage.on('dialog', dialog => dialog.accept());

    await customerPage.goto(`${base}/customer-site/index.html`);
    await customerPage.waitForSelector('.business-card', { timeout: 5000 });

    // Step 1: Customer Authentication via OTP
    await customerPage.click('#loginBtn');
    await customerPage.waitForSelector('#authBackdrop:not([hidden])', { timeout: 3000 });
    await customerPage.fill('#authPhone', '9123456789');
    await customerPage.click('#authSubmit');
    await customerPage.waitForSelector('#otpField:not([hidden])', { timeout: 3000 });
    await customerPage.fill('#authOtp', '123456');
    await customerPage.click('#authSubmit');
    await wait(600);
    results.customerLoggedIn = true;

    // Step 2: Add Product to Cart
    const addBtn = customerPage.locator('.add-to-cart-btn').first();
    await addBtn.click();
    await wait(400);

    // Verify Cart Button Badge
    const cartText = await customerPage.locator('#cartTrigger').textContent();
    results.cartBadgeShowsItem = cartText.includes('1');

    // Step 3: Open Cart Modal & verify contents
    await customerPage.click('#cartTrigger');
    await customerPage.waitForSelector('#cartBackdrop:not([hidden])', { timeout: 3000 });
    const token = await customerPage.evaluate(() => currentAccessToken);
    console.log('Current access token in browser:', token);
    await customerPage.screenshot({ path: path.join(screenshotDir, 'customer-cart-modal.png') });

    // Step 4: Proceed to Checkout
    const bizIdAttr = await customerPage.locator('.checkout-group-btn').first().getAttribute('onclick');
    console.log('Checkout button onclick attr:', bizIdAttr);
    await customerPage.evaluate(() => {
      const btn = document.querySelector('.checkout-group-btn');
      if (btn) btn.click();
    });
    await customerPage.waitForSelector('#checkoutContent:not([hidden])', { timeout: 3000 });

    await customerPage.fill('#checkoutCustomerName', 'Rahul Verma');
    await customerPage.fill('#checkoutDeliveryAddress', 'Room 204, PG Heights, Coral Park, Kota');
    await customerPage.screenshot({ path: path.join(screenshotDir, 'customer-checkout-form.png') });

    // Step 5: Place Order
    await customerPage.click('#checkoutForm button[type="submit"]');
    try {
      await customerPage.waitForSelector('#orderStatusMsg.success', { timeout: 5000 });
    } catch (e) {
      const msgText = await customerPage.locator('#orderStatusMsg').innerText();
      console.error('Order submission failed with message:', msgText);
      throw e;
    }
    results.orderPlacedSuccessfully = true;

    // Step 6: Verify Order in Customer Order History View
    await wait(3500); // Wait for transition to order history
    await customerPage.waitForSelector('#orderHistoryContent:not([hidden])', { timeout: 5000 });
    const orderHistoryText = await customerPage.locator('#orderHistoryList').innerText();
    results.orderAppearsInHistory = orderHistoryText.includes('Special Dal Baati Thali') && orderHistoryText.includes('180');
    await customerPage.screenshot({ path: path.join(screenshotDir, 'customer-order-history.png') });

    // Phase B: Business Owner tests
    const ownerContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const ownerPage = await ownerContext.newPage();
    ownerPage.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

    await ownerPage.goto(`${base}/business-panel/index.html`);
    await ownerPage.fill('#loginForm input[name="phone"]', '9876543210');
    await ownerPage.click('#loginBtn');
    await ownerPage.waitForSelector('#otp-field:not([hidden])', { timeout: 5000 });
    await ownerPage.fill('input[name="otp"]', '123456');
    await ownerPage.click('#loginBtn');
    await ownerPage.waitForSelector('#dashboard-section:not([hidden])', { timeout: 5000 });

    // Check Incoming Orders table in Owner Dashboard
    await ownerPage.waitForSelector('.orders-table-wrap', { timeout: 5000 });
    const ownerTableText = await ownerPage.locator('.orders-table-wrap').innerText();
    results.ownerReceivesOrder = ownerTableText.includes('Rahul Verma') && ownerTableText.includes('Special Dal Baati Thali');
    await ownerPage.screenshot({ path: path.join(screenshotDir, 'owner-incoming-orders.png') });

    // Step 7: Owner Updates Order Status to "Confirmed"
    await ownerPage.selectOption('.order-status-select', 'confirmed');
    await wait(1000);
    const updatedStatusText = await ownerPage.locator('.orders-table-wrap').innerText();
    results.ownerStatusUpdated = updatedStatusText.includes('CONFIRMED');

    // Step 8: Verify Customer Portal reflects "Confirmed" status
    await customerPage.reload();
    await customerPage.click('#cartTrigger');
    await customerPage.click('#viewHistoryBtn');
    // Wait until orders are loaded and "Loading orders..." is gone
    await customerPage.waitForFunction(() => {
      const el = document.querySelector('#orderHistoryList');
      return el && !el.innerText.includes('Loading orders...');
    }, { timeout: 5000 });
    const refreshedHistory = await customerPage.locator('#orderHistoryList').innerText();
    console.log('Refreshed order history text:', refreshedHistory);
    results.customerSeesConfirmed = refreshedHistory.toLowerCase().includes('confirmed');

    console.log('E2E Order Workflow Test Results:', results);
    if (!results.customerLoggedIn || !results.orderPlacedSuccessfully || !results.ownerReceivesOrder || !results.ownerStatusUpdated || !results.customerSeesConfirmed) {
      throw new Error(`E2E Verification failed: ${JSON.stringify(results)}`);
    }

    if (consoleErrors.length > 0) {
      console.warn('Browser Console Errors logged during flow:', consoleErrors);
    }
  } finally {
    await browser.close();
    server.kill();
  }
}

run().catch(err => {
  console.error('Fatal Test Error:', err);
  process.exitCode = 1;
});