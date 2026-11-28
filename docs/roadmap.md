# ZAROORAT Roadmap

## Completed foundation

- [x] Repository and architecture audit
- [x] Copy-only pre-flight backup verification
- [x] Dependency-free Node.js backend and static portals
- [x] Customer discovery, cascading locations, categories, enquiries, cart, and order history
- [x] Business registration submission with pending moderation state
- [x] Admin moderation and enquiry management
- [x] Customer/owner/admin session revocation endpoint
- [x] OTP challenge bounds for development/test and fail-closed production configuration
- [x] Session expiry metadata and explicit role checks
- [x] Exact CORS allowlist and opt-in trusted-proxy handling
- [x] Request validation, monetary-value protection, size limits, and safe unexpected errors
- [x] Regression coverage for the existing customer-to-business order workflow

## Milestone 1 follow-up verification

- [x] Add dedicated live-expiry tests with artificially shortened TTLs
- [x] Add dedicated CORS, preflight, and trusted-proxy integration tests
- [x] Add dedicated malformed-order and safe-error regression tests
- [x] Complete explicit ownership relationship persistence and claim challenge hardening
- [x] Complete HTTP-only cookie and CSRF migration
- [x] Configure an approved real OTP delivery provider for staging/production

## Milestone 1.5 — Parallel visual foundation

- [x] Design tokens and shared theme CSS
- [x] Version-pinned GSAP/Lenis presentation setup
- [x] Animated navbar, cards, modals, buttons, loaders, and reduced-motion behavior
- [x] Before/after visual regression baseline at desktop and mobile viewports

Milestone 1.5 must not change API routes, methods, payloads, response fields, authentication contracts, backend files, or feature wiring.

## Deferred platform work

- [x] Product/catalog redesign and image uploads
- [x] Inventory and service availability
- [x] Reviews, ratings, and moderation workflows
- [x] Hosted database and formal migrations
- [x] Payments, subscriptions, invoices, and commissions
- [x] Maps/geocoding and distance-aware discovery
- [x] Production deployment, monitoring, load testing, and CI/CD
- [ ] Native mobile applications
