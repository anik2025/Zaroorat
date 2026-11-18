# ZAROORAT Staging Rollback & Recovery Guide

This document describes the exact, non-destructive procedures for backing up, rolling back, and recovering the staging environment.

---

## 1. Automated Pre-Deployment Snapshot

Always take an immutable snapshot of the staging datastore before any new code deployment or configuration change:

```bash
node -e "
  const fs = require('fs');
  const path = require('path');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join('database', 'backups', 'pre-deploy-' + timestamp);
  fs.mkdirSync(backupDir, { recursive: true });
  
  const files = ['businesses.json', 'sessions.json'];
  let count = 0;
  files.forEach(file => {
    const src = path.join('database', 'data', file);
    if (fs.existsSync(src)) {
      const dest = path.join(backupDir, file);
      fs.copyFileSync(src, dest);
      console.log('Backed up: ' + src + ' -> ' + dest);
      count++;
    }
  });
  console.log('Snapshot complete in: ' + backupDir + ' (' + count + ' files)');
"
```

---

## 2. Fast Rollback Procedure (VPS / PM2)

If a deployment fails, behaves unexpectedly, or introduces bugs:

### Step 1: Stop the Process
```bash
pm2 stop zaroorat-staging
```

### Step 2: Roll Back Code
Revert to the previous stable git commit or release tag:
```bash
git checkout <PREVIOUS_STABLE_COMMIT_HASH>
```

### Step 3: Verify or Restore Data
If datastore corruption occurred, copy the snapshot back into `database/data/`:
```bash
# Example restoring from specific backup directory:
cp database/backups/pre-deploy-<TIMESTAMP>/businesses.json database/data/businesses.json
cp database/backups/pre-deploy-<TIMESTAMP>/sessions.json database/data/sessions.json
```

### Step 4: Restart Process
```bash
pm2 start zaroorat-staging
pm2 logs zaroorat-staging --lines 50
```

---

## 3. Fast Rollback Procedure (Render / PaaS)

1. **Rollback Deployment:**
   - In the Render Dashboard, navigate to **Deploys**.
   - Select the previous successful deployment and click **Rollback to this deploy**.
2. **Persistent Disk Safety:**
   - Because data lives on the persistent disk at `/app/database/data`, rolling back code does NOT delete or overwrite existing businesses or customer records.
3. **Health Check Verification:**
   - Ping the health check endpoint: `curl -I https://<your-service>.onrender.com/api/health`
   - Expect `HTTP/1.1 200 OK`.
