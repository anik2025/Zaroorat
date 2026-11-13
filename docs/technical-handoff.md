# KotaMitra — Current Technical Handoff

**Report scope:** Current files in `C:\Users\anikk\Documents\KotaMitra` only. This report describes implemented code, not planned functionality. No API keys, passwords, access tokens, or secret values are included.

**Current implementation type:** Local development MVP. The backend uses Node.js built-in modules and local JSON persistence. It is not production-ready or deployed.

---

## 1. Complete folder and file structure

```text
KotaMitra/
├── package.json
├── customer-site/
│   ├── index.html
│   ├── styles.css
│   ├── script.js
│   ├── login.html
│   ├── login.css
│   ├── login.js
│   ├── enquiry.html
│   └── enquiry.js
├── business-panel/
│   ├── index.html
│   ├── styles.css
│   └── script.js
├── admin-panel/
│   ├── index.html
│   ├── styles.css
│   ├── script.js
│   ├── login.html
│   ├── login.css
│   └── login.js
├── backend/
│   ├── server.js
│   └── README.md
├── database/
│   ├── README.md
│   ├── schema.sql
│   ├── areas.json
│   └── data/
│       └── businesses.json
└── docs/
    ├── README.md
    ├── roadmap.md
    ├── progress.md
    └── technical-handoff.md
```

There is no generated build directory, lockfile, hosted database configuration, or deployment configuration currently present. Development regression scripts are present at `backend/smoke-test.js`, `backend/credential-test.js`, and `backend/enquiry-test.js`.

---

## 2. Implemented features and status

### Completed in local development

- Customer-facing responsive homepage with KotaMitra branding.
- Search input and area-based filtering for currently loaded listings.
- Category cards and category-style filters.
- Approved business listing retrieval from the backend.
- Demo listing fallback when the backend is unavailable or returns no approved businesses.
- Dynamic Kota area loading from `/api/areas`.
- Alphabetically ordered Kota area catalogue in `database/areas.json`.
- Customer login page UI with mobile validation.
- Development OTP request and verification flow.
- Visible `+91` prefix on customer login, customer enquiry, and business owner phone fields.
- Customer enquiry form and backend enquiry persistence.
- WhatsApp links on listing cards and a WhatsApp support link on the login page. The code uses a development fallback number when a listing number is unavailable.
- Business-owner listing form with required-field and phone validation.
- Business submission persistence with initial `pending` status.
- Server-side business registration validation for field types, lengths, category, Indian phone numbers, Kota areas, address, WhatsApp, and description.
- Server-side enquiry validation for customer fields, business ID format/existence/status, and message limits.
- Admin login page and development session-token flow.
- Admin dashboard with listing counts, status tabs, approve, reject, feature/unfeature, refresh, enquiry display, and logout.
- Server-side protection on listing status changes and enquiry read/update routes through the current session map.
- HTML escaping for admin-rendered business/enquiry text.
- JavaScript syntax checks and manual API smoke tests were previously run successfully.

### Partially completed / development-only

- Customer OTP works only as a development simulation. The local flow returns a fixed development OTP; it does not send an SMS.
- Admin authentication uses an environment-overridable comparison and in-memory sessions. It is not a persistent or production identity system.
- The admin dashboard redirects when the browser has no token, and server authorization checks that the bearer token belongs to an admin session.
- Public listings use the local JSON store and expose approved records only, but the application is not deployed.
- WhatsApp integration is a `wa.me` link, not an official WhatsApp Business API/chat integration.
- The business panel is a submission form only; there is no business-owner login, profile editing, photo upload, or owner dashboard.
- The frontend is opened directly as `file:///...` pages during development. It is not served by the backend.

### Not implemented

- Real SMS OTP provider.
- Hosted database or migrations executed against a real database.
- Map provider, geocoding, map picker, distance calculation, or live map data.
- Customer accounts/profile management beyond an in-memory development session token.
- Business-owner authentication and self-service management.
- Business detail routes/pages.
- Reviews, ratings submission, moderation, or review API.
- Real category/area management from the admin panel.
- Payment gateway, subscriptions, invoices, or commission settlement.
- Production deployment, HTTPS, domains, backups, monitoring, and CI.
- Android or iOS application.

---

## 3. Backend API endpoints

The server is `backend/server.js`, normally listening on port `4100` unless `PORT` is supplied.

### Public endpoints

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/health` | Returns backend health status. |
| `GET` | `/api/areas` | Returns the city/area catalogue from `database/areas.json`. |
| `GET` | `/api/businesses` | Returns approved businesses by default; supports `q` and `area` query filters. Approved responses omit `ownerName` and `phone`. |
| `POST` | `/api/auth/request-otp` | Validates a 10-digit phone number and creates a five-minute development OTP record. |
| `POST` | `/api/auth/verify-otp` | Verifies the phone and OTP, deletes the OTP record, and creates a development customer session. |
| `POST` | `/api/enquiries` | Validates customer fields, business ID format/existence/status, and message before storing an enquiry with `new` status. |
| `POST` | `/api/businesses` | Validates business fields, category, Indian phone numbers, and Kota area before storing a submission with `pending` status. |

### Admin-related endpoints

| Method | Route | Purpose | Current access |
|---|---|---|---|
| `GET` | `/api/businesses?status=all` | Returns all business records for the admin UI. | Intended admin use; current route does not enforce admin auth. |
| `PATCH` | `/api/businesses/:id` | Changes `status`, `isVerified`, and/or `isFeatured`. | Requires a token present in the in-memory session map. |
| `POST` | `/api/admin/login` | Compares submitted credentials and creates a session token. | Public login endpoint. |
| `POST` | `/api/admin/logout` | Deletes the bearer token from the session map. | Token-based. |
| `GET` | `/api/admin/me` | Returns the current session record. | Requires a token present in the session map. |
| `GET` | `/api/enquiries` | Returns all stored enquiries. | Requires a token present in the session map. |
| `PATCH` | `/api/enquiries/:id` | Changes enquiry status to `new`, `contacted`, or `closed`. | Requires a token present in the session map. |

All JSON responses include permissive `Access-Control-Allow-Origin: *` CORS headers. `OPTIONS` is handled for preflight requests.

---

## 4. Customer authentication and OTP details

### Frontend

- Entry page: `customer-site/login.html`.
- Logic: `customer-site/login.js`.
- The phone input accepts ten digits and displays a visual `+91` prefix.
- The first form submission calls `POST /api/auth/request-otp`.
- On success, the page inserts an OTP field and changes the action to verification.
- The development OTP returned by the server is shown in the message area.
- Verification calls `POST /api/auth/verify-otp`.
- Successful verification stores the returned customer token in `sessionStorage` under a customer-token key and redirects to `index.html`.

### Backend

- Phone numbers are stripped to digits and must match ten digits.
- OTP records are stored in the process-memory `customerOtps` map.
- OTP expiry is five minutes.
- In non-production development mode, the returned development OTP is fixed in the code path.
- In production mode, a random value is generated, but there is no SMS provider or delivery implementation. Therefore production OTP login is incomplete.
- Verified customer sessions are stored in the same process-memory `sessions` map as admin sessions.

### Status

**Development simulation completed; real customer authentication pending.** There is no persistent user table or customer authorization middleware currently used by customer features.

---

## 5. Business registration and enquiry workflows

### Business registration

1. Customer site links to `business-panel/index.html`.
2. Owner enters business name, category, owner name, mobile, optional WhatsApp, area, address, and description.
3. The browser validates required fields and ten-digit phone values.
4. `business-panel/script.js` sends `POST /api/businesses`.
5. Backend validates field types, lengths, category, Indian phone numbers, WhatsApp, Kota area, address, and description before persistence.
6. Backend stores a generated ID, normalized submitted fields, `pending` status, verification/featured flags, and creation time.
7. Admin dashboard loads the record using the all-status business query.
8. Admin can approve, reject, verify, feature, or unfeature it through the PATCH endpoint.
9. Approved records become available to the public `/api/businesses` response and can render on the customer site.

There is currently no owner account, edit flow, document upload, photo upload, duplicate detection, email/SMS notification, or owner notification after approval.

### Customer enquiry

1. A public listing renders an `Enquire` link with its business ID.
2. The link opens `customer-site/enquiry.html?businessId=...`.
3. Customer enters name, mobile number, and message. The phone field displays `+91`.
4. `customer-site/enquiry.js` validates the business ID, message, and ten-digit phone number.
5. Backend validates the business ID format, existence, approved status, customer fields, phone, and message before persistence.
6. `POST /api/enquiries` stores the normalized enquiry in the JSON data file with `new` status.
7. Admin dashboard loads enquiries, resolves business details safely, and can set each enquiry to `new`, `contacted`, or `closed` through the protected status endpoint.

The enquiry is stored against its original business ID. The admin API now safely resolves that ID against current business records and returns non-private `businessDetails` containing name, category, and area when available. The admin UI displays those details while retaining the original reference ID. Missing references display `Business no longer available`. There is no direct automatic notification to the business owner.

---

## 6. Admin authentication and permissions

### Current implementation

- Admin login UI: `admin-panel/login.html`.
- Login logic: `admin-panel/login.js`.
- Backend compares submitted email/password against environment-overridable values. Development defaults remain available outside production; production startup now requires configured non-default credentials.
- Successful login creates a cryptographically random bearer token and stores a session record in memory.
- Dashboard reads the token from browser `sessionStorage` and sends it in `Authorization: Bearer ...` headers.
- Without a browser token, the dashboard redirects to its login page.
- The dashboard Logout button calls `POST /api/admin/logout`, removes the browser token, and redirects to the login page.

### Current permissions

A token present in the in-memory session map is accepted by the shared `requireAdmin` function for:

- Reading all enquiries.
- Updating enquiry status.
- Updating business status, verification, and featured flags.
- Reading `/api/admin/me`.

### Important limitation

The session record includes whether the session is a customer or admin, and `requireAdmin` requires `session.type === 'admin'` for admin-protected routes. Sessions are still in memory and this remains a development authentication system.

Sessions disappear when the Node process restarts. There are no roles, password hashing, rate limiting, lockout, CSRF protection, audit logs, or persistent session storage.

---

## 7. Database structure and current storage

### Current storage

The application currently uses a local JSON file:

```text
database/data/businesses.json
```

The file currently contains business submissions and enquiries. It includes development test records. Writes are synchronous and the whole JSON document is read/written per request.

### Planned SQL schema file

`database/schema.sql` describes tables for:

- `businesses`
- `categories`
- `areas`
- `enquiries`
- `reviews`

The SQL schema is documentation/design only; it has not been executed against PostgreSQL, Supabase, or another hosted database.

### Area data

`database/areas.json` contains a `cities.kota` object with a sorted Kota area list and a structure that can later hold other cities. The backend serves it via `/api/areas`.

### Current data limitations

- No users table is implemented in storage.
- OTPs and sessions are memory-only.
- No transactions, concurrent-write protection, backups, migrations, indexes, or recovery process.
- The local JSON file should not be used for public production traffic.

---

## 8. Frontend/backend integration status

### Connected

- Customer homepage → `GET /api/businesses` and `GET /api/areas`.
- Business panel → `POST /api/businesses`.
- Customer login → OTP request and verification endpoints.
- Customer enquiry page → `POST /api/enquiries`.
- Admin login → `POST /api/admin/login`.
- Admin dashboard → protected business/enquiry reads and updates, with bearer headers.

### Fallbacks and development behavior

- Customer homepage falls back to hardcoded demo listings if the API fails or returns no approved records.
- Customer pages are normally opened as local files, while the backend runs on localhost. This is suitable for development but not a deployment architecture.
- WhatsApp is link-based and uses a development fallback number when a listing number is absent.

### Not integrated

- Hosted database.
- Real SMS OTP delivery.
- Map service.
- Payment service.
- Business owner dashboard/authentication.
- Production web server/static hosting.

---

## 9. Security measures already implemented

- Business public API defaults to approved status only.
- Public approved business response omits owner name and phone.
- Random IDs use Node's `crypto.randomUUID()`.
- Session tokens use cryptographically random bytes.
- OTP expires after five minutes and is deleted after successful verification.
- Admin-rendered user/business text is HTML-escaped before insertion.
- Request body size is capped at approximately 1 MB; oversized requests are destroyed.
- Basic required-field and phone-format validation exists on business, enquiry, and OTP routes.
- Admin mutation and enquiry read/update routes require a bearer token present in the server session map.
- External WhatsApp links use `rel="noopener"` on customer listing links.

These are development safeguards, not a complete production security review. CORS is currently permissive, credentials are not persistently hashed, and sessions are in memory. Admin/customer session types are now checked by admin middleware, but a production identity system is still pending.

---

## 10. Known bugs, limitations, and pending tasks

### Known bugs/security issues

1. Admin sessions and customer sessions are process-memory only and are lost on restart.
2. Production OTP mode generates a code but does not deliver it through SMS.
3. The frontend uses a hardcoded API base URL and local `file:///` opening; deployment URL/configuration is not implemented.
4. The customer listing WhatsApp fallback is a development number, not a real KotaMitra support/business number.
5. Enquiry admin rows resolve and display the business name, category, and area when available; the original business ID remains shown as a reference.
6. The current JSON file contains development test business and enquiry records.

### Pending product/engineering work

- Fix admin session-type authorization and protect all admin queries.
- Remove unsafe credential fallback for production.
- Add real OTP provider and rate limiting.
- Add real customer/user persistence.
- Migrate from JSON to hosted PostgreSQL/Supabase.
- Add business detail pages and resolve business names in enquiries.
- Add owner authentication and owner dashboard.
- Add map/geocoding integration and location coordinates.
- Add category/area management and complete moderation workflows.
- Add reviews and ratings.
- Add real WhatsApp Business configuration or approved messaging integration.
- Add Razorpay/subscriptions/featured listing billing.
- Add deployment, HTTPS, environment configuration, backups, logging, and monitoring.
- Build and test Android customer/business apps.
- Remove test records before launch.

The existing `docs/roadmap.md` is a historical roadmap and does not reflect every later implementation; this report is the current-state reference.

---

## 11. Exact commands to run and test

### Start the backend

From the project root:

```bash
cd C:\Users\anikk\Documents\KotaMitra
npm run backend
```

The server listens on:

```text
http://localhost:4100
```

### Run the existing syntax check

```bash
cd C:\Users\anikk\Documents\KotaMitra
npm run check
```

For all current JavaScript files:

```bash
node --check backend/server.js
node --check customer-site/script.js
node --check customer-site/login.js
node --check customer-site/enquiry.js
node --check business-panel/script.js
node --check admin-panel/login.js
node --check admin-panel/script.js
```

### Open development pages

```text
file:///C:/Users/anikk/Documents/KotaMitra/customer-site/index.html
file:///C:/Users/anikk/Documents/KotaMitra/customer-site/login.html
file:///C:/Users/anikk/Documents/KotaMitra/business-panel/index.html
file:///C:/Users/anikk/Documents/KotaMitra/admin-panel/login.html
```

### Basic API checks

```bash
curl http://localhost:4100/api/health
curl http://localhost:4100/api/areas
curl "http://localhost:4100/api/businesses"
```

### Development OTP test

Request an OTP:

```bash
curl -X POST http://localhost:4100/api/auth/request-otp -H "Content-Type: application/json" -d "{\"phone\":\"9876543210\"}"
```

In local development, use the development OTP returned by that response in the login page. Do not use this development behavior as a production authentication mechanism.

### Business submission test

```bash
curl -X POST http://localhost:4100/api/businesses -H "Content-Type: application/json" -d "{\"name\":\"Sample Business\",\"category\":\"Tiffin & Food\",\"ownerName\":\"Sample Owner\",\"phone\":\"9876543210\",\"area\":\"Talwandi\"}"
```

### Enquiry resolution regression test

```bash
npm run enquiry-test
```

This test uses an isolated temporary JSON file and covers business name/category/area resolution, missing references, multiple business references, and the complete `new → contacted → closed → new` status workflow. It does not modify project data. The latest verification also confirmed the project data file checksum remained unchanged.

### Validation regression test

```bash
npm run validation-test
```

This uses isolated temporary storage and covers business registration validation, enquiry validation, approved/rejected business eligibility, malformed JSON, and invalid references. It does not modify project data.

### Enquiry submission test

Replace `BUSINESS_ID` with an actual business ID from the businesses response:

```bash
curl -X POST http://localhost:4100/api/enquiries -H "Content-Type: application/json" -d "{\"businessId\":\"BUSINESS_ID\",\"customerName\":\"Sample Customer\",\"customerPhone\":\"9876543211\",\"message\":\"Please share details\"}"
```

Admin login is required before testing protected admin endpoints. Do not record credentials or bearer tokens in source control, logs, or this handoff.

---

## 12. Recommended next development step

**First fix the authorization boundary before adding new product features.** Specifically:

1. Require an existing session whose type is exactly `admin`. **Completed.**
2. Protect `GET /api/businesses?status=all` with the same admin middleware. **Completed.**
3. Require configured, non-default admin credentials at production startup. **Completed.** Credential rotation and secure secret management remain deployment tasks.
4. Add and run automated API regression coverage for unauthenticated, customer-token, and admin-token access. **Completed; 4 smoke checks pass.**
5. Resolve business names in the admin enquiry table.
6. Remove development test records only after confirming they are not needed for UI testing.

After that security fix, migrate storage to a hosted database and connect a real SMS OTP provider. This order prevents building more features on top of an unsafe authorization and persistence foundation.
