# Deployment Guide

This guide details the steps to deploy the ZAROORAT platform in a production environment.

## 1. Prerequisites
- **Node.js**: Version 18+ LTS installed on the host.
- **PM2**: `npm install -g pm2` (recommended for process management).
- **Web Server**: Nginx or Caddy configured to terminate HTTPS/TLS and reverse-proxy to the backend.

## 2. Environment Setup
1.  **Clone the repository** to the production server.
2.  **Create the `.env` file** in the project root based on `.env.example`:
    ```bash
    cp .env.example .env
    # Edit .env with production values (strong passwords, secure paths)
    nano .env
    ```

## 3. Installation
1.  Install dependencies:
    ```bash
    npm install --production
    ```
    *(Note: The project is currently dependency-free, but this ensures future-proofing).*

## 4. Starting the Application
Use PM2 to start the application to ensure it runs in the background and restarts on failure:

```bash
pm2 start backend/server.js --name zaroorat --env production
```

## 5. Web Server Configuration (Nginx Example)
Configure Nginx to reverse-proxy traffic to `http://localhost:4100` and enforce HTTPS.

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:4100;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## 6. Security Checklist
- [ ] **HTTPS Enforced**: Ensure all traffic is over encrypted connections (Nginx/Caddy handles this).
- [ ] **Environment Variables**: `NODE_ENV` is set to `production`, and `KOTAMITRA_ADMIN_PASSWORD` is a strong, unique, and random string.
- [ ] **Data Security**: The `database/data` directory has secure permissions (`chmod 700`) so only the application user can read/write data files.
- [ ] **Rate Limiting**: The backend has built-in, IP-based rate limiting on sensitive endpoints (OTP requests, admin login).
- [ ] **Security Headers**: The server explicitly sets CSP, HSTS, X-Content-Type-Options, X-Frame-Options, and X-XSS-Protection.
