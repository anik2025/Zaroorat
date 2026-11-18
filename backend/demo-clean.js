const fs = require('node:fs');
const path = require('node:path');

const DEMO_DIR = path.join(__dirname, '..', 'database', 'demo');
const REAL_DATA_FILE = path.join(__dirname, '..', 'database', 'data', 'businesses.json');

function cleanDemoData() {
  // SAFETY CHECK: Ensure we never touch real data file
  if (!fs.existsSync(REAL_DATA_FILE)) {
    throw new Error('SAFETY ABORT: Real data file missing! Refusing to run demo cleanup.');
  }

  if (fs.existsSync(DEMO_DIR)) {
    fs.rmSync(DEMO_DIR, { recursive: true, force: true });
    console.log('Successfully cleaned up all synthetic demo data from database/demo/. Real data is untouched.');
  } else {
    console.log('No demo data directory found. Already clean.');
  }
}

if (require.main === module) {
  cleanDemoData();
}

module.exports = { cleanDemoData };
