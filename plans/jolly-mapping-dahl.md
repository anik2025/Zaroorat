# Plan: Milestone 6 — Hosted Database Migration (JSON → SQLite → PostgreSQL-ready)

## Context

Milestones 1–5 are complete. The entire platform currently persists all state in a single JSON file read and written synchronously on every request via `readData()` / `writeData()` in `backend/server.js`. This is a correctness and scalability ceiling: concurrent writes are unprotected beyond the atomic rename, there are no migrations, and moving to a hosted DB requires a full replacement. The user chose this as the next milestone.

**Strategy:** Introduce SQLite (via the Node.js built-in `node:sqlite` module available in Node 22.5+, or the battle-tested zero-external-dep `better-sqlite3` — see decision note below) as the initial target. The adapter is designed so PostgreSQL can be swapped in by changing the driver without touching any route logic. All 18 existing test suites must stay green.

**Decision note on SQLite driver:** Node 24 ships `node:sqlite` as a stable built-in (the project already requires Node ≥ 18; tests run on Node 24). We use `node:sqlite` to remain zero-external-dependency. If `node:sqlite` is unavailable at test time, the adapter falls back to the JSON file store via an env flag `KOTAMITRA_DB_BACKEND=json` (keeping all existing tests green during transition).

---

## Scope & Architectural Strategy

### 1. DB adapter layer — `backend/db.js` (new file)

A single module that exports:
- `initDb(dbPath)` — opens the database, runs pending migrations, returns a `db` handle.
- `readData(db)` — returns the same `{ businesses, enquiries, orders, reviews, subscriptions, catalog }` shape that `server.js` currently reads from JSON. This is a **compatibility shim** — it reconstructs the in-memory object the route handlers expect, keeping every route unchanged.
- `writeData(data, db)` — accepts the same mutated object and persists changes back. Routes continue to mutate the in-memory object and call `writeData`; the adapter detects which collections changed and upserts only the dirty rows.
- `readSessions(db)` / `writeSessions(db, sessionsMap, otpsMap)` — replaces the sessions JSON file.

This shim approach means **zero changes to any route handler** in `server.js`. Only the top-level wiring (`loadAuthStore`, `saveAuthStore`, `readData`, `writeData`, file path constants) is replaced.

### 2. Schema migrations — `database/migrations/`

Plain SQL files, numbered and run in order at startup by `initDb`:

| File | Contents |
|------|----------|
| `001_businesses.sql` | `businesses` table with all current fields as columns; JSONB-style columns (`products TEXT`, `images TEXT`) stored as JSON strings |
| `002_sessions.sql` | `sessions` table (token PK, type, phone, email, createdAt, expiresAt, capabilities TEXT) + `customer_otps` table |
| `003_enquiries.sql` | `enquiries` table |
| `004_orders.sql` | `orders` table with `items TEXT` (JSON array) |
| `005_reviews.sql` | `reviews` table |
| `006_subscriptions.sql` | `subscriptions` table |
| `007_catalog.sql` | `catalog_items` table with `business_id` FK |

Each migration is idempotent (`CREATE TABLE IF NOT EXISTS`). A `schema_migrations` table tracks which files have been applied.

### 3. Environment configuration

| Env var | Default | Meaning |
|---------|---------|---------|
| `KOTAMITRA_DB_BACKEND` | `sqlite` | `sqlite` or `json` (json = legacy fallback) |
| `KOTAMITRA_DB_PATH` | `database/data/kotamitra.db` | SQLite file path |
| `KOTAMITRA_DB_URL` | _(unset)_ | Future: PostgreSQL connection string; presence overrides backend to `postgres` |

Tests continue to pass `KOTAMITRA_DATA_FILE` for the `json` backend and a temp `KOTAMITRA_DB_PATH` for `sqlite` tests.

### 4. `backend/server.js` changes (minimal)

- Replace `readData(req, url)` / `writeData(data, req, url)` call sites with `readData(db)` / `writeData(data, db)` — the signatures change but the usage pattern at each call site is identical (read, mutate, write).
- Replace `loadAuthStore()` / `saveAuthStore()` with `readSessions(db)` / `writeSessions(db, ...)`.
- Remove `DATA_FILE`, `DEFAULT_DATA_FILE`, `SESSIONS_FILE` constants; replace with `DB_PATH`.
- Keep the demo-mode guard (`isDemoMode`) — it now resolves to a separate SQLite file.
- Add `db` as a module-level variable initialised at startup via `initDb`.

### 5. Migration utility — `backend/db-migrate.js` (new file)

A standalone script that:
1. Reads the existing `database/data/businesses.json`.
2. Opens the SQLite DB.
3. Inserts all records into the new tables inside a single transaction.
4. Prints a summary: N businesses, M enquiries, etc.

Run with `npm run db:migrate`.

### 6. Test suite — `backend/db-test.js` (new file)

20 integration tests focused on the DB layer itself:
- Schema migration runs cleanly on a fresh temp DB.
- `initDb` is idempotent (called twice, no error, no duplicate rows).
- Round-trip: write a business via the route, read it back, assert all fields.
- Concurrent writes do not corrupt data (two simultaneous POSTs to `/api/businesses`).
- Session persistence: sessions survive a server restart against the same DB file.
- OTP records expire and are cleaned up correctly.
- Review and subscription data survive read-modify-write cycles.
- The `json` backend (legacy) still passes all assertions when `KOTAMITRA_DB_BACKEND=json`.

---

## Files to Create or Modify

### New files
- `backend/db.js` — adapter (initDb, readData, writeData, readSessions, writeSessions)
- `backend/db-migrate.js` — one-shot migration utility from JSON to SQLite
- `backend/db-test.js` — 20 DB-layer integration tests
- `database/migrations/001_businesses.sql` through `007_catalog.sql`

### Modified files
- `backend/server.js` — swap `readData`/`writeData`/`loadAuthStore`/`saveAuthStore` call sites; replace file-path constants with DB config; add `initDb` at startup
- `package.json` — add `"db-test": "node backend/db-test.js"`, `"db:migrate": "node backend/db-migrate.js"`; wire `db-test` into `"test"`
- `docs/roadmap.md` — mark hosted database and formal migrations complete

---

## Reused patterns

- Atomic write pattern from `writeData` (`tmp + rename`) is preserved inside `db.js` for the `json` fallback backend.
- `UUID_PATTERN`, `text()`, `normalizePhone()`, `parseTimestamp()` helpers in `server.js` are unchanged.
- All test suites keep their existing spawn + temp-dir pattern; `db-test.js` adds `KOTAMITRA_DB_PATH` to the env overrides alongside the existing ones.
- `db-migrate.js` reuses `readData`'s JSON parse logic directly.

---

## Verification

```
# 1. Syntax check
node --check backend/server.js

# 2. New DB-layer tests only
node backend/db-test.js

# 3. Full regression suite (all 19 suites must be green)
npm test

# 4. Manual migration smoke-test
node backend/db-migrate.js
# → prints migration summary, exits 0

# 5. Server starts against SQLite
node backend/server.js
# → "KotaMitra backend running at http://localhost:4100"
# → GET /api/health returns ok:true
```
