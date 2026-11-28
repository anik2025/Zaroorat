# Plan: Milestone 2 — Production Deployment, CI/CD, and Monitoring

## Context
Milestone 1 (core zero-dependency Node.js backend, security, cookie/CSRF, REST SMS OTP) and Milestone 1.5 (parallel visual foundation, design tokens, GSAP/Lenis presentation setup, visual regression baselines) are fully completed, tested, and committed.
The next logical milestone on the roadmap is **Production deployment, monitoring, load testing, and CI/CD**. 
Transitioning KotaMitra from a robust local/staging foundation to production readiness requires:
1. Containerization (lightweight Dockerfile for zero-dependency Node.js execution).
2. Automated CI/CD pipeline (GitHub Actions workflow running `npm test` and security suites on every push/PR).
3. Production health monitoring and operational telemetry.
4. Zero-dependency load and stress testing scripts to validate concurrent performance.

---

## Scope & Architectural Strategy

1. **Containerization (`Dockerfile` & `.dockerignore`)**:
   - Create a clean, multi-stage or simple optimized `Dockerfile` for Node.js >= 18.
   - Configure non-root execution user for enhanced security.
   - Set up volume mounting / persistent path strategies for JSON data files (`database/data/`).

2. **Automated CI/CD Pipeline (`.github/workflows/ci.yml`)**:
   - Create a GitHub Actions workflow that installs dependencies, executes `npm test` (running all 15+ test suites, including smoke, credential, enquiry, validation, security, session expiry, CORS, owner security, orders, price manipulation, malformed order, claim hardening, cookie CSRF, OTP provider, and phase 2 tests), and runs `npm run check`.

3. **Production Health & Operational Monitoring (`backend/server.js`)**:
   - Enhance `/api/health` to report uptime, memory usage, active session count, persistence file status, and environment mode (`NODE_ENV`).

4. **Zero-Dependency Load & Stress Testing (`backend/load-test.js`)**:
   - Implement a native Node.js concurrent load testing script simulating high-volume unified search queries and enquiry submissions to verify API stability under load.

5. **Roadmap Documentation Update**:
   - Update `docs/roadmap.md` to check off production deployment preparation items upon completion.

---

## Files to be Created or Modified

### 1. `Dockerfile` (Create)
- Lightweight production container definition for Node.js 18+.

### 2. `.github/workflows/ci.yml` (Create)
- Automated testing and validation workflow.

### 3. `backend/server.js` (Modify)
- Enhance `/api/health` endpoint with operational telemetry and metrics.

### 4. `backend/load-test.js` (Create)
- Zero-dependency load testing script.

### 5. `package.json` (Modify)
- Add `"load-test": "node backend/load-test.js"` script.

### 6. `docs/roadmap.md` (Modify)
- Update roadmap tracking.

---

## Testing Strategy

1. **Automated CI & Regression Testing (`npm test`)**:
   - Run full test suite locally and in CI to guarantee 100% test pass rate across all suites.
2. **Load & Concurrency Verification (`npm run load-test`)**:
   - Measure response times and success rates under concurrent requests.
3. **Container Build Verification**:
   - Validate Docker build syntax and container health check response.
