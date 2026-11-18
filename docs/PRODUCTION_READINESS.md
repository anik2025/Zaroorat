# Production Readiness & Architecture Overview

This document outlines the production readiness criteria, architectural design, data persistence safeguards, and security posture of the **ZAROORAT** nationwide discovery platform.

## 1. Production Architecture
- **Runtime**: Node.js 18+ LTS (pure native modules, zero runtime external dependencies).
- **Process Management**: Recommended execution via PM2 (`pm2 start backend/server.js --name zaroorat --env production`).
- **Web Server / Reverse Proxy**: Nginx or Caddy terminating TLS/HTTPS, setting security headers, and reverse-proxying incoming traffic to backend port `4100`.
- **Database / Storage**: Currently utilizing transactional JSON datastores (`database/data/businesses.json` and `database/data/sessions.json`). Designed for migration to hosted PostgreSQL/Supabase per `database/schema.sql` for high-concurrency public production traffic.

## 2. Environment Configuration
Production environments must supply explicit non-default configuration via environment variables (see `.env.example`):
- `NODE_ENV=production`
- `PORT=4100`
- `KOTAMITRA_ADMIN_EMAIL` (non-default admin email)
- `KOTAMITRA_ADMIN_PASSWORD` (strong, securely generated admin password)
- `KOTAMITRA_DATA_FILE` & `KOTAMITRA_SESSIONS_FILE` (persistent storage paths)

## 3. Data Safety & Integrity Safeguards
- **Zero Data Loss Rule**: All existing business submissions, user records, enquiries, and configuration data remain 100% intact and are never deleted, overwritten, or cleared.
- **Checksum Integrity**: SHA-256 file checksums are recorded for database files before maintenance or deployment tasks (`database/backups/`).
- **Atomic Writes**: Persistent JSON operations use synchronous file system writes (`fs.writeFileSync`) with directory auto-creation to prevent partial write corruption.
