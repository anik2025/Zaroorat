const { generateMasterSeed } = require('./generate-demo');

function seedDemoData() {
  console.log('Seeding KotaMitra demo data from master seed generator...');
  generateMasterSeed();
}

if (require.main === module) {
  seedDemoData();
}

module.exports = { seedDemoData };
