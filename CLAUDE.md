# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Run all tests & checks**: `npm test`
- **Run server check**: `npm run check`
- **Run smoke tests**: `npm run smoke-test`
- **Run credential tests**: `npm run credential-test`
- **Run enquiry tests**: `npm run enquiry-test`
- **Run validation tests**: `npm run validation-test`
- **Start backend server**: `npm run backend` (runs on port 4100 by default)
- **Demo database utilities**:
  - Generate demo data: `npm run demo:generate`
  - Seed demo loader: `npm run demo:seed`
  - Test demo setup: `npm run demo:test`
  - Clean demo data: `npm run demo:clean`

## Architecture & Structure

KotaMitra is a nationwide India local business discovery and enquiry platform consisting of a zero-dependency Node.js HTTP backend and multiple static frontend portals.

### Directory Structure
- `backend/`: Core HTTP server (`server.js`) and test suites (`*-test.js`). Uses native `node:http` with REST API endpoints, session cookie / token authentication, and data persistence in JSON files.
- `database/`: Schema files, cascading location data (`locations.json`), categories (`categories.json`), and dynamic JSON datastores (`database/data/` and `database/demo/`).
- `customer-site/`: Public customer-facing frontend for discovery, cascading location filtering, business search, and direct enquiry submission.
- `business-panel/`: Panel for business owners to register, manage listings, and view enquiries.
- `admin-panel/`: Administrative portal for reviewing, approving, rejecting, and managing business listings and platform configuration.

### Key Technical Patterns
- **Backend**: Pure Node.js `node:http` server with no external runtime dependencies. Reads/writes transactional state to JSON files (`database/data/businesses.json` or demo files when demo mode is active).
- **Authentication & Security**: Admin login with password configuration via environment variables (`KOTAMITRA_ADMIN_EMAIL`, `KOTAMITRA_ADMIN_PASSWORD`), session tokens, and customer OTP flows.
- **Frontend**: Vanilla HTML/CSS/JS applications communicating via JSON REST endpoints. Cascading location selectors filter dynamically across states, cities, and areas defined in `database/locations.json`.
