# Plan: Milestone 4 — Payments & Subscriptions Integration (Razorpay / Gateway Adapter)

## Context
Milestones 1, 1.5, 2, and 3 (zero-dependency backend hardening, session security, REST SMS OTP, parallel visual foundation, Docker/CI/CD, and customer reviews/ratings) are fully complete and tested.
The next major platform feature requested is **Payments and Subscriptions integration**.

### Objectives
1. Enable business owners to purchase promoted/verified subscriptions (e.g. Featured Listing, Verified Badge, Priority Placement) using a secure zero-dependency payment gateway adapter pattern (Razorpay / Generic Webhook-driven Payment Gateway).
2. Design a robust zero-dependency payment and subscription verification architecture adhering to the project's dependency-free backend constraints (using native Node.js `fetch` / `crypto` for HMAC-SHA256 signature verification).
3. Database schema enhancements (`data.subscriptions = data.subscriptions || []` and business subscription metadata `isFeatured`, `subscriptionTier`, `subscriptionExpiresAt`).
4. Backend API endpoints for order creation, payment verification, webhook handling, and subscription status checks.
5. Business owner panel UI updates to purchase and manage subscriptions.
6. Rigorous integration tests (`backend/payment-test.js`) and wiring into `npm test`.

---

## Scope & Architectural Strategy

1. **Payment Gateway Adapter (`backend/server.js`)**:
   - Implement `RazorpayAdapter` (or zero-dependency `RestPaymentAdapter`) using native Node.js `fetch` and `crypto` for order creation (`/orders` API call to gateway) and cryptographic webhook signature verification (`crypto.createHmac('sha256', secret).update(body).digest('hex')`).
   - Support test/mock fallback mode (`KOTAMITRA_PAYMENT_DRY_RUN=true`) for deterministic local and CI testing without external gateway credentials.

2. **Database Schema & Persistence**:
   - **Subscriptions Collection**: `data.subscriptions` containing `{ id, businessId, ownerPhone, planId, amount, currency, status: 'pending'|'active'|'expired', gatewayOrderId, gatewayPaymentId, expiresAt, createdAt }`.
   - **Business Updates**: Add `isFeatured: boolean`, `subscriptionTier: string`, `subscriptionExpiresAt: string` to business entities upon successful payment verification.

3. **Backend API Endpoints**:
   - `POST /api/owner/subscriptions/create-order`: Owner initiates a subscription purchase (e.g., Featured Tier ₹999/month), generating a gateway order.
   - `POST /api/owner/subscriptions/verify`: Verifies payment signature (or mock confirmation) and activates the subscription.
   - `POST /api/payments/webhook`: Handles asynchronous gateway payment success webhooks with HMAC signature verification.
   - `GET /api/owner/subscriptions`: Returns active subscriptions and purchase history for the owner.

4. **Business Owner Panel Integration (`business-panel/`)**:
   - Add a "Subscriptions & Promotion" tab where owners can view plans (Basic, Featured, Verified) and initiate payment.

5. **Testing Suite (`backend/payment-test.js`)**:
   - Automated integration tests simulating order creation, signature verification, subscription activation, and mock payment flows.

---

## Files to be Created or Modified

### 1. `backend/server.js` (Modify)
- Add payment adapter, subscription validation, order creation, signature verification, and webhook handling.

### 2. `backend/payment-test.js` (Create)
- Integration test suite for subscription purchase and signature verification.

### 3. `package.json` (Modify)
- Add `"payment-test": "node backend/payment-test.js"` and wire into `"test"`.

### 4. `business-panel/` (Modify)
- Add subscription purchase and management interface.

### 5. `docs/roadmap.md` (Modify)
- Track progress.

---

## Testing Strategy

1. **Automated Integration Tests (`backend/payment-test.js`)**:
   - Verify order creation, signature validation, dry-run mock flow, subscription activation, and business promotion status update.
2. **Full Regression Suite (`npm test`)**:
   - Ensure all 17+ test suites remain 100% green and regression-free.
