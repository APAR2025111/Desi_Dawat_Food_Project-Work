# Desi Dawat deployment preparation

This guide prepares the existing React/Vite + Express + MySQL project for Hostinger. It does not authorize purchasing a plan, changing a production database, connecting a public domain, or publishing the site.

## Hostinger fit and plan notes

Hostinger supports Vite/React and Express Node.js apps, monorepo app roots, and MySQL on its managed web hosting plans. Deploy the frontend and API as separate apps from the existing `frontend` and `backend` folders. Use the frontend's `VITE_API_BASE_URL` to point to the API subdomain; this avoids restructuring the repository.

The current Hostinger Finland Node.js page lists the Unlimited offer at €3.49/month when prepaid for 48 months (€167.52 upfront), renewing at €16.99/month. Cloud Startup is listed at €7.99/month prepaid for 48 months (€383.52 upfront), renewing at €23.99/month, and includes 4 CPU cores and 4 GB RAM. Prices and eligibility can change; verify the checkout total and renewal before purchase. Unlimited allows up to five Node.js apps per plan; this setup uses two. Hostinger's managed Node apps have a 120-second request timeout and do not support inbound WebSockets or always-running workers; the current site does not depend on those features.

References: [Hostinger Finland Node.js plans and prices](https://www.hostinger.com/fi/nodejs-hosting), [Hostinger Node.js plan limits](https://www.hostinger.com/support/hostinger-node-js-limits-for-web-and-cloud-plans/), [Hostinger monorepo deployment](https://www.hostinger.com/support/how-to-deploy-monorepos-with-npm-yarn-or-pnpm-on-hostinger/), [Hostinger MySQL connection for Node.js](https://www.hostinger.com/support/connecting-a-hostinger-mysql-database-to-a-node-js-application/), [Hostinger CDN visitor IP guidance](https://www.hostinger.com/support/hostinger-cdn-visitor-ip-addresses-in-logs-and-analytics/).

## Hostinger app settings

Create two Hostinger Node.js websites from the same repository. Use Hostinger's preview domains first. Do not connect the business domain until staging checks pass and the owner approves.

### Frontend

- Repository root directory: `frontend`
- Node.js version: 22.x (or another currently supported LTS version)
- Build command: `npm run build`
- Output directory: `dist`
- Build-time environment variable: `VITE_API_BASE_URL=https://<api-preview-or-subdomain>/api`
- Verify direct navigation and refresh on `/admin/login` and `/order-confirmation` after deployment.

### Backend/API

- Repository root directory: `backend`
- Start command: `npm start` (the package script starts `src/server.js`)
- Entry file, if requested: `src/server.js`
- Use the port Hostinger assigns. Hostinger's current troubleshooting guide says Node apps should listen on port 3000; this app respects the `PORT` environment variable. If the panel does not inject it, set `PORT=3000` in the app settings.
- Configure the environment variables below in Hostinger's dashboard, never in Git.

```env
NODE_ENV=production
PORT=3000
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=<restricted-database-user>
DB_PASSWORD=<secret>
DB_NAME=desi_dawat_menu
DB_SSL=false
JWT_SECRET=<long-random-secret>
ADMIN_USERNAME=<unique-admin-name>
ADMIN_PASSWORD=<bcrypt-hash>
FRONTEND_ORIGIN=https://<frontend-preview-or-domain>
TRUST_PROXY_HOPS=1
UPLOAD_DIR=<absolute-writable-persistent-path>
OPENROUTESERVICE_API_KEY=<server-side-routing-key>
```

Hostinger's Node.js/MySQL guide uses `127.0.0.1` for a MySQL database created in the same hosting account. If using a remote database instead, use its host and TLS settings. Generate a unique `JWT_SECRET` and a bcrypt hash for `ADMIN_PASSWORD`; never reuse the development credentials. `FRONTEND_ORIGIN` must exactly match the browser origin. Hostinger's CDN guidance recommends one trusted proxy hop for Node.js apps; keep requests routed through Hostinger CDN and do not add another proxy layer without recalibrating this setting. This lets the sign-in throttle use visitor IPs instead of treating all visitors as one address.

`UPLOAD_DIR` is now configurable. Set it to an absolute, writable directory outside Hostinger's versioned app release path, and verify it survives redeploys and is included in backups. Do not assume `backend/uploads` in a release directory is durable. The current dish photos bundled under `frontend/public/images` are part of the frontend build; admin-uploaded photos are separate files and need persistent storage.

## Database preparation and safe migration

The repository does not contain a complete production schema baseline for orders, menu, and inventory, and no staging database is connected. Therefore the live schema has not been verified and migration `001_add_runtime_columns.sql` must not be run against production yet.

1. Export a verified backup of the existing database and uploaded images.
2. Create a staging database from that backup (or an isolated copy) in Hostinger. Use a least-privilege application user.
3. Select the staging database and run the read-only `database/hostinger_preflight.sql`. Resolve every `MISSING` required column against the actual schema. Some opening-hours and discount fields are expected to be absent before migration 001.
4. Confirm `opening_hours` and `customer_orders` exist and their legacy columns match the migration assumptions. The migration adds split opening-hour and order-discount columns; it does not establish missing order tables or a full fresh-install schema.
5. Run `database/migrations/001_add_runtime_columns.sql` only on staging. Check the opening hours and order data afterward; verify the migration can be safely rerun before scheduling it for production.
6. Run `database/migrations/002_update_opening_hours_schedule.sql` on staging after migration 001. It sets Monday–Friday to 19:00–21:00 and Saturday–Sunday to 16:00–21:00 in the server-managed opening-hours rows.
7. Run `database/migrations/003_add_about_us_content.sql` on staging to add the editable About Us page and its media index.
8. Run `database/migrations/004_add_preferred_order_time.sql` on staging to add the optional preferred delivery/pickup time to saved orders. Existing orders remain unchanged.
9. Run `database/migrations/005_add_customer_management.sql` on staging to seed customer profiles from existing orders and enable reversible customer archiving. It preserves orders and order items.
10. Exercise menu reads/edits, About Us text and media management, a test order and its items, preferred-time capture, customer add/archive/restore and lifetime statistics, order status/delivery/discount updates, inventory CRUD, opening-hours edits, and admin image upload on staging. Verify database backup restore and persistence of uploaded images and videos after redeploy.

No production or staging database migration was performed. The additive preferred-time migration was applied only to the confirmed local development database on 2026-10-25; no order data was changed. Customer migration 005 has not been applied to any database.

## Pre-publish checklist

- [ ] Confirm the purchased Hostinger plan, total prepaid cost, renewal price, and available app resources.
- [ ] Deploy to preview domains and verify frontend-to-API CORS and database connectivity.
- [ ] Put the restricted MySQL credentials and all secrets in Hostinger's environment settings.
- [ ] Confirm the schema preflight and test the migration on staging; back up production before any later production change.
- [ ] Confirm persistent upload storage and restoreable database/image backups.
- [ ] Verify customer checkout, invalid input, delivery quoting, admin login/session, order management, menu editing, inventory, opening hours, and image upload.
- [ ] Verify phone and desktop layouts, API errors, direct route refresh, HTTPS, and no browser console errors.
- [ ] Set production `FRONTEND_ORIGIN` and rebuild the Vite app with the production API URL.
- [ ] Connect the custom domain and HTTPS only after owner approval; then repeat the key customer and admin checks.

## Local verification completed

On 2026-10-25, the frontend tests passed (9), the Vite production build passed, and the backend API/schedule tests passed (15). The build prints two non-blocking React Router `use client` bundler notices. Database-backed order journeys, schema compatibility on staging, Hostinger deployment, DNS, and production publication remain unverified. Earlier mocked Playwright customer/mobile journeys passed (4) on 2026-10-23.
