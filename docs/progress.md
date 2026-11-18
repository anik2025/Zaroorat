# Progress Log

## 2026-11-04
- Created root project at `C:\Users\anikk\Documents\KotaMitra`.
- Created separate folders: `customer-site`, `business-panel`, `admin-panel`, `backend`, `database`, `docs`.
- Started with the customer site as agreed.
- Built a responsive customer homepage with search, categories, area filters, demo listings, and business CTA.
- Real database and authentication are intentionally not connected yet; no real user data is being stored at this stage.

## 2026-11-05
- Added the shared Node.js backend foundation without external packages, so setup stays lightweight and auditable.
- Added `GET /api/health`, business listing search, and business submission endpoint.
- Added local development persistence at `database/data/businesses.json`.
- Added initial SQL data model for businesses, categories, areas, enquiries, and reviews.
- Added root `package.json` scripts: `npm run backend` and `npm run check`.
- External package installation was not performed because the environment requires explicit approval for registry packages; current backend does not need them.

## 2026-11-05
- Built the first business-owner panel in `business-panel/`.
- Added a responsive listing form for business name, category, owner, phone, WhatsApp, Kota area, address, and description.
- Connected the form to `POST http://localhost:4100/api/businesses` with client-side validation and success/error states.
- Updated the customer site's business CTA to open the business panel.
- Validated backend, customer-site, and business-panel JavaScript syntax successfully.

## 2026-11-05
- Tested backend health endpoint successfully.
- Tested business submission endpoint successfully; test record was persisted to `database/data/businesses.json` with `pending` status.
- Tested business search endpoint successfully using query and area filters.
- Added admin status update API: `PATCH /api/businesses/:id` for approved/rejected/verified/featured state.
- Built the first admin panel in `admin-panel/` with submission table, status tabs, stats, approve, reject, feature, and refresh controls.
- Added HTML escaping in admin rendering to avoid injecting business-submitted text into the admin page.
- Validated current backend, customer-site, business-panel, and admin-panel JavaScript syntax successfully.

## 2026-11-05
- Changed the public business API default to approved listings only; sensitive owner contact fields are not returned publicly.
- Added `status=all` support for admin-only development listing retrieval.
- Connected customer site to the backend API for approved business listings, with demo fallback when the backend is unavailable or has no approved records.
- Added business normalization so approved user listings render with category-based icon/type/filter values.
- Updated admin panel to request all statuses explicitly.
- Validated JavaScript syntax after the integration.

## 2026-11-05
- Added `database/areas.json` with a city-ready Kota area catalogue and Jaipur-ready city container structure.
- Added `GET /api/areas` and connected the customer area selector to load areas dynamically.
- Expanded business-panel area choices for major Kota localities.
- Added customer login page with mobile validation and WhatsApp support entry point.
- Updated public WhatsApp links to use a listing WhatsApp number when available, with a development fallback number.
- Kept OTP deliberately unconnected until a real authentication provider and verified business support number are configured.
- Added city expansion and maps integration checkpoints to the roadmap.

## 2026-11-05
- Added customer enquiry backend storage with `POST /api/enquiries`, `GET /api/enquiries`, and enquiry status updates.
- Added customer enquiry form at `customer-site/enquiry.html`.
- Added Enquire action to public business cards.
- Added customer enquiries section to the admin panel with contact-status action.
- Preserved the WhatsApp action alongside the enquiry flow.
- Validated the new enquiry flow code and documented the next production requirements.

## 2026-11-05
- Added development admin authentication API with login, logout, session token, and admin identity check.
- Protected admin-only business status updates and enquiry read/update endpoints.
- Added admin login page at `admin-panel/login.html`.
- Protected the admin dashboard and added token headers to its API requests.
- Admin password is environment-configurable; default development credentials must be changed before any deployment.
- Validated the auth-related JavaScript files.

## 2026-11-05
- Added working development OTP endpoints: `/api/auth/request-otp` and `/api/auth/verify-otp`.
- Updated customer login to request and verify OTP; development OTP is shown clearly for local testing only.
- Added visible `+91` phone prefix UI to customer login, enquiry form, and business owner form.
- Sorted dynamically loaded Kota areas alphabetically in the customer site.
- Expanded area catalogue with the requested Borkhera extension entry and retained city-ready data structure.
- Added shared phone input styling and validated all updated JavaScript syntax.

## 2026-11-05
- Fixed the admin authorization boundary so only sessions with `type: 'admin'` can access admin-protected routes.
- Protected `GET /api/businesses?status=all` from unauthenticated and customer-token access.
- Removed the duplicate status query declaration introduced during the protection change.
- Updated the technical handoff to mark these two security fixes completed.

## 2026-11-05
- Added `backend/smoke-test.js` for health, unauthenticated, customer-token, and admin-token authorization checks.
- Added `npm run smoke-test` script.
- Fixed admin login sessions to explicitly include `type: 'admin'`; the first smoke test caught this missing field.
- Re-ran the smoke suite successfully: 4 checks passed.

## 2026-11-05
- Added production admin credential validation in `backend/server.js`.
- Production startup now fails when `KOTAMITRA_ADMIN_EMAIL` or `KOTAMITRA_ADMIN_PASSWORD` is missing.
- Production startup now rejects the known development defaults.
- Development mode continues to use the existing local defaults for compatibility.
- Added `backend/credential-test.js` and `npm run credential-test` covering missing production credentials, unsafe defaults, valid production credentials, and development compatibility.
- Credential tests passed: 4 checks.
- Existing smoke tests passed: 4 checks.
- No existing data was deleted or modified.

## 2026-11-06
- Improved admin enquiry API responses with safe `businessDetails` resolution from stored `businessId` references.
- Admin enquiry records now include business name, category, and area when the referenced business exists.
- Missing or invalid business references return `businessDetails: null` without changing the original `businessId`.
- Updated admin enquiry table to display business details and retain the reference ID internally.
- Missing business records display `Business no longer available` instead of breaking the table.
- Preserved `new`, `contacted`, and `closed` status values and existing status update controls.
- Added isolated `backend/enquiry-test.js` and `npm run enquiry-test`; tests cover valid reference, missing reference, multiple businesses, and status updates.
- The enquiry test uses a temporary data file and did not modify existing project data.
- Credential tests passed: 4 checks. Existing smoke tests passed: 4 checks. All updated JavaScript syntax checks passed.

## 2026-11-06
- Improved the admin enquiry action control from a one-way `Mark contacted` button to a status selector.
- Admin can now set each enquiry to `new`, `contacted`, or `closed`, including moving a status back when needed.
- Reused the existing protected `PATCH /api/enquiries/:id` endpoint and its status validation; no records were deleted or migrated.
- Added safe frontend error handling so a failed update reloads the current enquiry state.
- Added styling for the new enquiry status selector.

## 2026-11-06 — Enquiry task verification completed
- Re-inspected the current backend, enquiry regression test, admin enquiry UI script, and admin styles after the status-dropdown change.
- Confirmed business name/category/area resolution, missing-reference fallback, multiple business references, and `new → contacted → closed → new` transitions.
- Ran `npm run check`, `node backend/enquiry-test.js`, `node backend/credential-test.js`, and `node backend/smoke-test.js`; all passed.
- Confirmed `database/data/businesses.json` remained unchanged by comparing SHA-256 before and after: `f796dfc88c9fc528949d09361abb061b97230a27e1de6a8ce2e17a11cbb63c16`.
- No database migration or SMS integration was started.

## 2026-11-06 — Admin session cleanup
- Added a visible Logout button to the admin dashboard header.
- Connected logout to the existing `POST /api/admin/logout` endpoint, removed the browser token, and redirected to `admin-panel/login.html`.
- Corrected the dashboard development notice to describe the implemented admin login, role protection, and logout behavior accurately.
- Added logout button styling without changing business or enquiry data.
- Re-ran backend/admin syntax, enquiry, credential, and smoke tests successfully.
- Confirmed the project data checksum remains `f796dfc88c9fc528949d09361abb061b97230a27e1de6a8ce2e17a11cbb63c16`.

## 2026-11-06 — Business and enquiry validation
- Added server-side business registration validation for field types, trimmed lengths, approved categories, Indian mobile numbers, optional WhatsApp numbers, valid Kota areas, address, and description limits.
- Added server-side customer enquiry validation for field types, UUID business IDs, business existence, approved-business eligibility, customer phone, customer name, and message length.
- Malformed JSON and validation failures now return consistent HTTP 400 JSON errors instead of being treated as server errors.
- Added isolated `backend/validation-test.js` and `npm run validation-test` covering valid submissions, missing fields, invalid phone/category/area, valid enquiry, invalid/non-existent/rejected business references, invalid messages, and malformed JSON.
- Updated the existing enquiry fixture with valid addresses required by the new business validation.
- All requested regression tests passed.
- Confirmed `database/data/businesses.json` checksum is unchanged: `f796dfc88c9fc528949d09361abb061b97230a27e1de6a8ce2e17a11cbb63c16`.
- No database migration, SMS, Maps, Razorpay, Supabase, or deployment work was started.

## 2026-11-18 — P0 Security & Session Persistence
- Implemented persistent session storage using `database/data/sessions.json` for sessions and customer OTPs across server restarts.
- Added automatic session and OTP loading on server startup, with automatic pruning of expired entries based on configured max-age (admin 24h, customer 7d).
- Implemented IP-based rate limiting on sensitive API endpoints (`/api/auth/request-otp`, `/api/admin/login`, `/api/enquiries`) using a local memory-backed sliding window; returns 429 status code for spam prevention.
- Added `backend/security-test.js` covering session persistence, logout invalidation, and rate limiting; added `npm run security-test` and updated `npm test` to include it.
- Confirmed `database/data/businesses.json` remained protected and unchanged during testing.
- All regression and security test suites (smoke, credential, enquiry, validation, security) passed: 100% success.
- Documentation updated to reflect the new persistent auth store and rate-limiting infrastructure.
- No new external runtime dependencies, databases, or cloud services introduced; entirely native Node.js implementation preserved.

## 2026-11-18 — Phase 2: Business Owner Portal Implementation
- Added server-side owner authentication, session validation (`requireOwner`), and strict server-side ownership checks on all owner-facing API endpoints.
- Implemented `/api/owner/*` endpoints for listing businesses, updating business profiles (with strict field whitelisting to prevent escalation), and viewing/managing business-specific enquiries.
- Business ownership validation is enforced on every request: client-supplied business IDs are ignored and owner access is strictly verified against `business.phone` linked to the authenticated session.
- Customer privacy is enforced by limiting enquiries to businesses explicitly owned by the authenticated owner.
- Added `backend/owner-security-test.js` covering ownership isolation, IDOR protection, privilege escalation prevention, and enquiry isolation.
- All regression and new security test suites passed: 100% success.
- Created local backup of business data before changes.
- Existing business and enquiry data records remained intact.
- No new external runtime dependencies, databases, or cloud services introduced; entirely native Node.js implementation preserved.

## Next checkpoint

Keep the owner security rules, ownership isolation, and test coverage intact; wait for approval before starting Phase 3.
