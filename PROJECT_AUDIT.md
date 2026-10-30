# Desi Dawat codebase audit

Audit date: 2026-10-23

## Architecture and current functionality

- Frontend: React 18, Vite, React Router. Customer menu, category/search filters, cart, checkout review and payment screens, order confirmation, admin login, menu/order/inventory/opening-hours/report/flyer sections.
- API: Express 4, JWT admin sessions, MySQL via `mysql2`, delivery distance quotes, image upload, order creation and admin order management.
- Database: MySQL database named `desi_dawat_menu`. The repository contains a partial `prepare.sql`, an inventory table definition, and a schema check script; it is not a complete fresh-install schema for all API routes.
- Local media: menu photos under `frontend/public/images` and uploaded media under `backend/uploads`.

## Findings

### Release blockers

1. **Production CORS needs provider configuration.** The API now reads `FRONTEND_ORIGIN`; set it to the exact production frontend origin(s).
2. **Production checkout previously called `http://localhost:3001` directly.** The active menu now uses the configured API helper for order submission. Set `VITE_API_BASE_URL` in the production frontend build.
3. **Existing database schema needs a staged migration.** The API needs `morning_*` and `evening_*` fields absent from the original setup. `database/migrations/001_add_runtime_columns.sql` adds these and discount columns without deleting data; it has not been run against any database.
4. **No deployment or database integration evidence.** There is no connected staging database, complete schema baseline, or verified backup/restore process.

### Security and reliability risks

1. **Sign-in throttling is per process.** The API blocks after ten failed attempts per source address in a 15-minute window; counters reset on restart and are not shared across instances.
2. **Production admin passwords must be bcrypt hashes.** Plain-text comparison is now limited to non-production mode.
3. **Uploads accept JPG, PNG, and WebP only.** The API checks both extension/MIME pairing and file signatures, and rejects SVG.
4. **Database error responses are generic.** Health and menu errors no longer return internal database messages.
5. **Order input now has server-side type and length checks.** Admin inventory field ranges and business-specific constraints still need review.

### Maintenance findings

- `backend/src/server copy.js`, `frontend/src/pages/MenuPage copy.jsx`, and duplicate admin pages are old copies and are not imported by the active app. Keep them out of deployment builds and remove only after confirming they are no longer needed.
- Several customer and admin workflows depend on a real MySQL schema. The existing schema check script reports menu structure and row count only; it does not validate orders, inventory, opening hours, constraints, or indexes.
- The confirmation page previously told customers their order was accepted and promised a receipt even though the API only saves the order and no customer notification/receipt delivery integration is present. The customer copy now says the order was placed and that the restaurant will confirm it.
- Browser tests cover a mocked customer checkout journey, invalid contact details, and mobile width. Real database-backed customer and admin journeys still need staging verification.

## Changes completed in this pass

- Corrected active WhatsApp and email links.
- Routed checkout order submission through the frontend API helper so production can use `VITE_API_BASE_URL`.
- Added customer checkout validation helpers and five automated unit tests for valid/invalid Finnish customer details, delivery address, and address length.
- Corrected order confirmation wording to reflect what the backend actually does.
- Upgraded React Router from v6 to the patched v7 release after the frontend audit found two moderate advisories. The package install audit reported zero vulnerabilities after the upgrade.
- Hardened the API in place with configurable CORS, response security headers, sign-in throttling, production bcrypt verification, order input checks, upload format restrictions, and generic client-facing database errors.
- Added image signature checks and a 10-second timeout for both delivery geocoding and route requests.
- Added optional verified MySQL TLS support with `DB_SSL` and `DB_SSL_CA`.
- Removed runtime discount-column DDL and added an additive migration for opening-hours and order-discount columns.
- Added a production deployment guide with hosting options and staged migration/release steps.
- Reworked the deployment guide for Hostinger's React/Vite + Express + MySQL monorepo flow, including per-app roots, build settings, environment variables, preview deployment, and plan limits.
- Made uploaded image storage configurable with `UPLOAD_DIR` so a host can point it outside a replaceable release directory.
- Routed uploaded-image URLs through the configured API origin in the customer menu and admin tools, including old `localhost` image URLs saved during local use.
- Added a read-only staging schema preflight query because the repository does not include a complete production schema baseline.
- Fixed an inventory API/schema mismatch: the supplied SQL requires `category` values `packing`/`food`, while the legacy admin UI submits `item_category` values `packing_material`/`food_item`; the API now maps between them and rejects unsupported values.

## Verification performed

- Frontend checkout validation tests: 5 passed.
- Frontend Vite production build: passed. Vite emitted two `"use client"` bundling notices from React Router; build output was still produced successfully.
- Backend dependency audit: 0 vulnerabilities reported.
- Frontend dependency audit before upgrade: 2 moderate React Router advisories; package install of the patched version reported 0 vulnerabilities.
- Backend API integration tests: 6 passed without requiring a database, including invalid inventory category validation.
- Playwright browser tests: 4 passed with mocked API responses, including a 390px mobile menu/cart check and uploaded-image origin resolution.
- Local API/DB smoke test: unavailable. No complete schema baseline or staging database is available. The read-only preflight is prepared, but schema compatibility and migration behavior still require a staging copy. No live database or remote deployment was touched.
