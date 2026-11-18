# Security Audit Report

This report summarizes the security posture, vulnerability assessments, and defensive mitigations implemented in the ZAROORAT platform.

## 1. Authentication & Session Security
- **Admin Authentication**: Authenticated via secure environment-based credentials (`KOTAMITRA_ADMIN_EMAIL` and `KOTAMITRA_ADMIN_PASSWORD`). Production startup strictly fails if these are default or missing.
- **Session Tokens**: Cryptographically secure random tokens generated using `crypto.randomBytes(32).toString('hex')`.
- **Session Expiry**: Admin sessions expire in 24 hours; customer and business owner sessions expire in 7 days. Automatic pruning occurs on startup and token validation.

## 2. Authorization & IDOR Mitigation
- **Role-Based Access Control (RBAC)**: Enforced via server-side middleware (`requireAdmin`, `requireOwner`).
- **Object Reference Protection (IDOR)**: Business owner endpoints (`/api/owner/businesses/*`, `/api/owner/enquiries/*`) explicitly verify that the authenticated owner's phone number matches the target business record's phone number (`business.phone === session.phone`). Attackers cannot manipulate business IDs to access or modify records belonging to other users.
- **Admin Mutation Guard**: All administrative mutations (`PATCH /api/businesses/:id`, `PATCH /api/enquiries/:id`, `GET /api/businesses?status=all`) require an active admin session token.

## 3. Injection & Input Validation
- **Strict Validation**: All incoming request bodies are validated against strict regex patterns (`PHONE_PATTERN`, `UUID_PATTERN`, `VALID_CATEGORIES`) and string length constraints.
- **XSS Protection**: Frontend panels utilize robust HTML escaping and safe DOM insertion. The backend sets strict Content Security Policy (CSP) headers to restrict script execution sources.
- **Payload Limits**: Incoming HTTP request bodies are capped at 1 MB to prevent denial-of-service (DoS) via memory exhaustion.

## 4. Rate Limiting & Abuse Prevention
- **In-Memory Rate Limiter**: Implemented sliding-window rate limiting on sensitive routes:
  - `/api/auth/request-otp`: Max 10 requests per minute per IP.
  - `/api/admin/login`: Max 10 requests per minute per IP.
  - `/api/enquiries`: Max 20 requests per minute per IP.

## 5. Security Headers
All responses (JSON APIs and static files) include industry-standard security headers:
- `Content-Security-Policy`: Restricts scripts and connections to `self` and trusted font providers.
- `Strict-Transport-Security`: Enforces HSTS (`max-age=63072000`).
- `X-Content-Type-Options`: `nosniff`
- `X-Frame-Options`: `DENY` (prevents clickjacking)
- `X-XSS-Protection`: `1; mode=block`
