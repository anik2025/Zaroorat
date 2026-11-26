# Database and persistence

The current ZAROORAT implementation uses dependency-free JSON persistence for local development and isolated tests. No hosted database or migration is part of Milestone 1.

## Current JSON data

- `database/data/businesses.json` — normal application records, including businesses, enquiries, and order snapshots when used by the current workflow.
- `database/demo/businesses.json` — isolated demo records when demo mode is configured.
- `database/data/sessions.json` — revocable authentication runtime state.
- `database/locations.json` and `database/categories.json` — reference data.

The backend writes application files through temporary files followed by rename. This protects individual writes but does not provide full multi-process transaction or concurrency guarantees.

## Authentication/runtime state

Sessions and OTP challenges are persisted for the current development-compatible authentication flow. Sessions are revocable runtime state, not ordinary business data. Ordinary backups must exclude `database/data/sessions.json`. Do not modify, delete, migrate, or restore the production sessions file without separate explicit approval.

New sessions include role/type, capabilities, creation time, and expiry. OTP challenges are bounded and stored using hashed challenge values where supported by the current format.

## Existing workflow entities

The current JSON workflow covers businesses, products/services embedded in business records, enquiries, orders, order items, sessions, and OTP challenges. The historical SQL schema predates the current commerce workflow and is retained as historical/reference material.

## Future work requiring separate approval

- Hosted database selection and migration
- Schema migration for users, roles, ownership relationships, products, orders, media, payments, and audit events
- Production concurrency/transaction strategy
- Data cleanup or deletion
- Import/export of private customer or session data

Never commit API keys, provider credentials, private customer data, access tokens, OTPs, or session contents.
