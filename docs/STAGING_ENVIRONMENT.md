# ZAROORAT Staging Environment Configuration Guide

This document details the exact configuration requirements for running ZAROORAT in a staging environment.

---

## 1. Runtime & Process Requirements

- **Node.js Version:** `node >= 18.0.0` (Native `fetch`, `node:crypto`, `node:http` required).
- **Package Dependencies:** Zero production runtime dependencies. All core modules are native Node.js.
- **Build Command:** `npm run check` (or empty / `echo "No build step required"`). `npm install` is only needed if running local Playwright devDependencies.
- **Start Command:** `npm start` (mapped to `node backend/server.js` in `package.json`).
- **Default Port:** 4100 (automatically overridden by cloud providers via `PORT` environment variable).
- **Host Binding:** `0.0.0.0` (all network interfaces).

---

## 2. Environment Variables Specification

| Variable | Required | Staging Example | Description |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | Yes | `production` | Set to `production` in staging to disable development OTP bypass. |
| `PORT` | Auto | `4100` | Injected by hosting provider (e.g. Render, Railway). |
| `KOTAMITRA_ADMIN_EMAIL` | Yes | `admin@staging.zaroorat.in` | Admin login email. Must not be default. |
| `KOTAMITRA_ADMIN_PASSWORD` | Yes | *(Strong 16+ char random secret)* | Admin login password. Must not be default. |
| `KOTAMITRA_DATA_FILE` | Optional | `/var/data/businesses.json` | Path to persistent business JSON datastore. |
| `KOTAMITRA_SESSIONS_FILE` | Optional | `/var/data/sessions.json` | Path to persistent session JSON datastore. |
| `KOTAMITRA_DEMO_MODE` | Yes | `false` | Must be `false` in staging to prevent demo data mixing. |

---

## 3. Render Disk Mount Configuration

When deploying as a Render Web Service:
1. **Service Type:** Web Service (Node)
2. **Environment:** Node
3. **Build Command:** `echo "Zero dependencies - ready"` (or `npm run check`)
4. **Start Command:** `npm start`
5. **Health Check Path:** `/api/health`
6. **Persistent Disk:**
   - **Name:** `zaroorat-staging-data`
   - **Mount Path:** `/app/database/data` (or `/var/data`)
   - **Size:** 1 GB (ample for 50,000+ businesses and logs)
7. If mounting to `/var/data`, set:
   ```env
   KOTAMITRA_DATA_FILE=/var/data/businesses.json
   KOTAMITRA_SESSIONS_FILE=/var/data/sessions.json
   ```

---

## 4. Security & Reverse Proxy

- **Reverse Proxy Header:** Backend extracts the client IP via `req.headers['x-forwarded-for'].split(',')[0].trim()` to prevent IP spoofing through multi-tier proxies.
- **CSP:** Strict `script-src 'self'` policy enforced across all static portals.
- **Rate Limiting:** In-memory sliding window rate limits endpoints (10 requests/min for login and OTP).
- **Graceful Shutdown:** Handles `SIGTERM` and `SIGINT` to safely finish in-flight requests and exit cleanly during container restarts.
