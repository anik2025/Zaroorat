const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'database', 'data');
const BACKUP_DIR = path.join(ROOT, 'database', 'backups');

function backupDatabase() {
  if (!fs.existsSync(DATA_DIR)) {
    console.log('No data directory found to back up.');
    return;
  }
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const targetSubDir = path.join(BACKUP_DIR, `backup-${timestamp}`);
  fs.mkdirSync(targetSubDir, { recursive: true });

  const files = fs.readdirNames ? fs.readdirSync(DATA_DIR) : fs.readdirSync(DATA_DIR);
  let count = 0;
  for (const file of files) {
    const srcPath = path.join(DATA_DIR, file);
    if (file === 'sessions.json') continue;
    if (fs.statSync(srcPath).isFile()) {
      const destPath = path.join(targetSubDir, file);
      fs.copyFileSync(srcPath, destPath);
      count++;
    }
  }
  console.log(`Database backup successful: ${count} files archived to ${targetSubDir}`);
}

if (require.main === module) {
  backupDatabase();
}

module.exports = { backupDatabase };
