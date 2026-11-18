const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const { cleanDemoData } = require('./demo-clean');

const port = 4200;
const base = `http://localhost:${port}`;
// Set demo mode environment variable
const server = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
  env: { ...process.env, PORT: String(port), KOTAMITRA_DEMO_MODE: 'true' },
  stdio: 'ignore'
});

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function request(route, options = {}) {
  const headers = { ...options.headers, 'x-demo-mode': 'true' };
  const response = await fetch(`${base}${route}`, { ...options, headers });
  return { status: response.status, body: await response.json() };
}

async function run() {
  await wait(500); // Wait for server to start
  console.log('Running Demo Test Suite...');

  const checks = [];

  // 1. Check demo businesses are served
  const businesses = await request('/api/businesses');
  checks.push(['demo data loaded', businesses.status === 200 && businesses.body.businesses.length > 50]);

  // 2. Check demo listing has DEMO tag/label
  const demoListing = businesses.body.businesses.find(b => b.name.includes('[DEMO]'));
  checks.push(['demo labeling', !!demoListing]);

  // 3. Test enquiry on demo listing
  const enquiry = await request('/api/enquiries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      businessId: demoListing.id,
      customerName: 'Demo Customer',
      customerPhone: '9811112222',
      message: 'Test enquiry'
    })
  });
  checks.push(['demo enquiry success', enquiry.status === 201]);

  const failed = checks.filter(([, passed]) => !passed);
  if (failed.length) throw new Error(`Failed checks: ${failed.map(([name]) => name).join(', ')}`);

  console.log(`Demo tests passed: ${checks.length}`);
}

run()
  .catch(error => { console.error(error.message); process.exitCode = 1; })
  .finally(() => {
    server.kill();
  });
