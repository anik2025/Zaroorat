# KotaMitra / ZAROORAT Backend

A dependency-free Node.js HTTP API using built-in modules and JSON persistence. The current implementation is a local development/staging foundation, not a production deployment.

## Run

From the repository root:

```text
npm run backend
```

The default port is `4100`; override it with `PORT`.

## Current API areas

- Health and discovery: `/api/health`, `/api/locations`, `/api/categories`, `/api/businesses`, `/api/search/unified`
- Authentication: `/api/auth/request-otp`, `/api/auth/verify-otp`, `/api/auth/logout`
- Admin: `/api/admin/login`, `/api/admin/logout`, `/api/admin/me`
- Enquiries: `/api/enquiries`, `/api/owner/enquiries`
- Orders: `/api/orders`, `/api/customer/orders`, `/api/owner/orders`
- Businesses: `/api/businesses`, `/api/owner/businesses`, `/api/owner/claim`

Existing customer-to-business order payloads and response workflows are regression-protected. Do not change them without a compatibility review.

## Authentication and session behavior

- Development/test OTP uses an explicit dependency-free mock provider and may return the controlled development OTP for deterministic local tests.
- Staging requires `DRY_RUN=true` or `KOTAMITRA_OTP_DRY_RUN=true` to use the mock provider safely.
- Production fails closed unless a real configured OTP delivery adapter is implemented and selected. No real provider is included in this milestone.
- OTP challenges are normalized, hashed in persistence, expiring, single-use, cooldown-protected, and attempt-limited.
- Sessions include role/type, capabilities, creation time, and expiry. Expiry is checked on every authenticated request.
- `POST /api/auth/logout` revokes customer/owner bearer sessions. `/api/admin/logout` remains supported.
- Current browser clients still use bearer tokens; the planned HTTP-only-cookie and CSRF migration is not complete.

## Configuration

- `PORT`
- `NODE_ENV`
- `KOTAMITRA_DATA_FILE`
- `KOTAMITRA_DEMO_DATA_FILE` — dedicated demo data path required when demo mode is selected with a custom data file.
- `KOTAMITRA_SESSIONS_FILE`
- `KOTAMITRA_ADMIN_EMAIL`
- `KOTAMITRA_ADMIN_PASSWORD`
- `KOTAMITRA_ALLOWED_ORIGINS` — comma-separated exact origins; no wildcard is used.
- `KOTAMITRA_TRUSTED_PROXY=true` — opt-in forwarded-IP trust; default uses the socket address.
- `KOTAMITRA_DEMO_MODE=true` — isolated demo mode.
- `KOTAMITRA_OTP_TTL_MS`
- `KOTAMITRA_OTP_MAX_ATTEMPTS`
- `KOTAMITRA_OTP_RESEND_COOLDOWN_MS`
- `KOTAMITRA_OTP_DEV_CODE` — development/test only.
- `KOTAMITRA_OTP_DRY_RUN` or `DRY_RUN` — staging mock-delivery mode; never use for production delivery.
- `KOTAMITRA_SESSION_CUSTOMER_TTL_MS`
- `KOTAMITRA_SESSION_OWNER_TTL_MS`
- `KOTAMITRA_SESSION_ADMIN_TTL_MS`

Never commit credentials, OTPs, access tokens, session contents, or provider secrets.

## Data and backup policy

Normal application data is stored in `database/data/businesses.json` unless overridden. Demo/test runs must use isolated data paths. `database/data/sessions.json` is revocable runtime state and is excluded from ordinary database backups; do not modify or restore it in production without separate approval.

The JSON store uses temporary-file writes and rename, but it is not a substitute for a concurrent production database.

## Tests

```text
npm test
npm run check
npm run smoke-test
npm run credential-test
npm run enquiry-test
npm run validation-test
npm run security-test
npm run session-expiry-test
npm run cors-proxy-test
npm run owner-security-test
npm run order-test
npm run price-manipulation-test
npm run malformed-order-test
npm run cors-proxy-test
npm run claim-hardening-test
npm run cookie-csrf-test
```

Browser/visual tests require the existing Playwright setup and are not part of `npm test` unless explicitly invoked.
