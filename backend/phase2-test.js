const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const port = 4288;
const base = `http://localhost:${port}`;
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zaroorat-phase2-'));
const tempDataFile = path.join(tempDir, 'businesses.json');
const tempSessionsFile = path.join(tempDir, 'sessions.json');

const env = {
  ...process.env,
  PORT: String(port),
  KOTAMITRA_DATA_FILE: tempDataFile,
  KOTAMITRA_SESSIONS_FILE: tempSessionsFile
};

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function run() {
  const initialData = {
    businesses: [
      {
        id: '22222222-3333-4444-5555-666666666666',
        name: 'Kota Royal Tiffin & Thali',
        category: 'Tiffin & Food',
        ownerName: 'Manoj Sharma',
        phone: '9876543210',
        state: 'Rajasthan',
        city: 'Kota',
        area: 'Talwandi',
        address: 'Talwandi Circle, Kota',
        description: 'Best fresh tiffin service in Kota.',
        products: [
          { name: 'Deluxe Thali', price: 150 }
        ],
        status: 'approved',
        createdAt: new Date().toISOString()
      }
    ],
    orders: []
  };
  fs.writeFileSync(tempDataFile, JSON.stringify(initialData, null, 2));

  const server = spawn(process.execPath, [path.join(__dirname, 'server.js')], { env, stdio: 'inherit' });
  await wait(1500);

  const checks = [];

  try {
    // 1. Test location autocomplete API
    const acRes = await fetch(`${base}/api/locations/autocomplete?q=Kota`);
    const acBody = await acRes.json();
    checks.push(['location autocomplete returns results', acRes.status === 200 && Array.isArray(acBody.results) && acBody.results.length > 0]);

    // 2. Test unified search API with query matching business name
    const searchRes = await fetch(`${base}/api/search/unified?q=Royal`);
    const searchBody = await searchRes.json();
    checks.push(['unified search returns businesses', searchRes.status === 200 && searchBody.businesses.length === 1 && searchBody.businesses[0].name === 'Kota Royal Tiffin & Thali']);

    // 3. Test unified search API matching product
    const prodRes = await fetch(`${base}/api/search/unified?q=Thali`);
    const prodBody = await prodRes.json();
    checks.push(['unified search returns products', prodRes.status === 200 && prodBody.products.length === 1 && prodBody.products[0].productName === 'Deluxe Thali']);

    // 4. Test filtering by state and city in unified search
    const locRes = await fetch(`${base}/api/search/unified?state=Rajasthan&city=Kota`);
    const locBody = await locRes.json();
    checks.push(['unified search filters by state & city', locRes.status === 200 && locBody.businesses.length === 1]);

    const failed = checks.filter(([, passed]) => !passed);
    if (failed.length) {
      throw new Error(`Failed checks: ${failed.map(([name]) => name).join(', ')}`);
    }
    console.log(`Phase 2 tests passed: ${checks.length}`);
  } finally {
    server.kill();
  }
}

run().catch(err => {
  console.error('Phase 2 test failed:', err);
  process.exitCode = 1;
});
