# ZAROORAT Staging Deployment Guide

This guide outlines the complete, non-destructive path to deploy ZAROORAT to a staging environment (e.g., Railway, Render, or a secure Linux VPS) using our zero-dependency Node.js backend and static frontend portals.

---

## 1. Staging Architecture Evaluation

For ZAROORAT's zero-dependency architecture (`node:http` + flat-file JSON datastores), we evaluate three recommended staging platforms:

| Criteria | Railway | Render | Linux VPS (DigitalOcean/Hetzner) |
| :--- | :--- | :--- | :--- |
| **Cost** | Free tier / ~$5/mo usage-based | Free tier (spins down on idle) / $7/mo | $4 – $6 / month fixed |
| **Persistent Storage** | Volume mount supported | Persistent disk available ($0.25/GB/mo) | Local NVMe SSD storage |
| **Deployment Simplicity** | Extremely high (Git push) | High (Git push / auto-build) | Medium (SSH + PM2 + Nginx) |
| **HTTPS (SSL)** | Automatic & free | Automatic & free | Managed via Certbot / Let's Encrypt |
| **Logs** | Built-in real-time stream | Built-in stream | `pm2 logs` / systemd journal |
| **Restart Behavior** | Automatic restart on crash | Automatic restart | PM2 process supervisor |
| **Backup Support** | Railway CLI backups / volumes | Disk snapshot options | Cron jobs + rsync / tarball |

**Recommendation:** 
- **Railway or Render** is ideal for rapid, zero-overhead staging validation.
- **Linux VPS (Ubuntu 24.04 LTS with PM2 + Nginx)** is ideal for production-grade staging where absolute control over flat-file writes and backups is required.

---

## 2. Staging Configuration & Environment Variables

ZAROORAT requires specific environment variables to run securely in staging. Never expose secrets in source code.

### Required Environment Variables (`.env`)
```env
PORT=4100
KOTAMITRA_ADMIN_EMAIL=admin@zaroorat.staging
KOTAMITRA_ADMIN_PASSWORD=SecureStagingAdminPassword123!
KOTAMITRA_DATA_FILE=database/data/businesses.json
KOTAMITRA_SESSIONS_FILE=database/data/sessions.json
```

*Note:* In staging/production, do **not** set development OTP bypass flags unless explicitly running automated E2E tests.

---

## 3. Persistent Data & JSON Storage Strategy

ZAROORAT uses atomic JSON file persistence (`fs.renameSync` over temp files in `backend/server.js`) to prevent corruption.

- **For Render / Railway:** Attach a persistent volume mapped to `/app/database/data` so that business listings, registrations, and active session tokens survive container redeploys and restarts.
- **Limitations of JSON Storage:** Flat-file JSON works perfectly for single-instance Node.js deployments up to tens of thousands of listings. However, concurrent multi-instance scaling (horizontal scaling behind a load balancer) requires a clustered datastore (e.g., PostgreSQL). For staging, vertical scaling on a single instance is fully sufficient.

---

## 4. Startup, Health & PM2 Process Management

### Start Command
```bash
npm start
```
*(Runs `node backend/server.js`)*

### Process Management on VPS (`PM2`)
```bash
# Install PM2 globally
npm install -g pm2

# Start ZAROORAT backend under PM2
pm2 start backend/server.js --name "zaroorat-staging"

# Configure PM2 startup on system boot
pm2 startup
pm2 save
```

### Health Check
The backend provides a dedicated health check endpoint at `/api/health` which returns `200 OK` (`{ ok: true, service: 'KotaMitra backend' }`). External uptime monitors and Render health checks should point to `/api/health`.

---

## 5. Pre-Deployment Backup & Rollback Plan

### Pre-Deployment Backup Steps
Before deploying or updating staging data:
1. Create a timestamped archive of the database directory:
   ```bash
   node -e "
     const fs = require('fs');
     const path = require('path');
     const backupDir = path.join('database', 'backups', 'staging-' + Date.now());
     fs.mkdirSync(backupDir, { recursive: true });
     ['businesses.json', 'sessions.json'].forEach(f => {
       const p = path.join('database', 'data', f);
       if (fs.existsSync(p)) fs.copyFileSync(p, path.join(backupDir, f));
     });
     console.log('Staging backup created at:', backupDir);
   "
   ```
2. Verify the backup files exist and are non-empty.

### Rollback Procedure
If a deployment or data migration issue occurs:
1. Stop the server: `pm2 stop zaroorat-staging`
2. Restore the JSON files from the most recent backup directory into `database/data/`.
3. Restart the server: `pm2 restart zaroorat-staging`

---
*Generated with [Claude Code](https://claude.com/claude-code)*
