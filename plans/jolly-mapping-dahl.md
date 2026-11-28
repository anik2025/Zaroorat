# Plan: Milestone 5 — Product Catalog Redesign & Image Uploads

## Context
Milestones 1 through 4 (backend hardening, session security, REST SMS OTP, parallel visual foundation, customer reviews & ratings, and payments/subscriptions) are fully complete and tested.
The next major platform feature requested is **Product Catalog Redesign & Image Uploads**.

### Objectives
1. Allow business owners to manage a product and service catalog (items with title, description, price, category, stock status, and image URLs/uploads) for their business profiles.
2. Implement secure base64/multipart image upload handling with strict validation (size limits, allowed mime types: JPEG, PNG, WebP) and safe static serving.
3. Expose public catalog endpoints (`GET /api/businesses/:id/catalog`) and owner management endpoints (`POST /api/owner/catalog`, `PATCH /api/owner/catalog/:itemId`, `DELETE /api/owner/catalog/:itemId`).
4. Update the customer-facing business portal (`customer-site/`) to display rich product/service catalogs with images and pricing.
5. Update the business owner panel (`business-panel/`) to provide an intuitive catalog management interface.
6. Add rigorous integration tests (`backend/catalog-test.js`) and wire into `npm test`.

---

## Scope & Architectural Strategy

1. **Backend API Endpoints (`backend/server.js`)**:
   - `GET /api/businesses/:id/catalog`: Publicly accessible list of catalog items for a business.
   - `POST /api/owner/catalog`: Owner adds a new catalog item `{ name, description, price, category, inStock, imageUrl }`. Validates ownership and input bounds.
   - `PATCH /api/owner/catalog/:itemId`: Owner updates an existing catalog item.
   - `DELETE /api/owner/catalog/:itemId`: Owner removes a catalog item.
   - `POST /api/owner/upload`: Secure file upload endpoint accepting base64 or multipart image data, storing under `database/data/uploads/` with UUID filenames, and returning a secure relative URL (`/uploads/...`).

2. **Data Persistence (`database/data/businesses.json` / datastore)**:
   - Store catalog items within each business object or a dedicated `data.catalogs` collection keyed by `businessId`.
   - Ensure atomic JSON datastore persistence.

3. **Frontend Integration (`customer-site/` & `business-panel/`)**:
   - `customer-site/`: Render products/services grid with images, prices, and availability badges on business detail view.
   - `business-panel/`: Add a "Catalog & Products" management tab with add/edit/delete modals and image upload preview.

4. **Testing Suite (`backend/catalog-test.js`)**:
   - Automated integration tests verifying catalog item creation, image upload validation, owner authorization, update/delete workflows, and public retrieval.

---

## Files to be Created or Modified

### 1. `backend/server.js` (Modify)
- Add catalog CRUD endpoints, image upload handling, and validation logic.

### 2. `backend/catalog-test.js` (Create)
- Integration test suite for catalog management and image uploads.

### 3. `package.json` (Modify)
- Add `"catalog-test": "node backend/catalog-test.js"` and wire into `"test"`.

### 4. `customer-site/` & `business-panel/` (Modify)
- Add catalog browsing and management UI components.

### 5. `docs/roadmap.md` (Modify)
- Track progress.

---

## Testing Strategy

1. **Automated Integration Tests (`backend/catalog-test.js`)**:
   - Verify catalog item creation, unauthorized access blocking, image upload rejection of invalid file types, and public catalog visibility.
2. **Full Regression Suite (`npm test`)**:
   - Run all test suites to ensure zero regressions across all backend modules.
