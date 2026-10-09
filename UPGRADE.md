# Billing app upgrade

The existing React 19 / TypeScript / Vite app was extended in place. Its purple sidebar, invoice forms, local drafts, barcode input, jsPDF/AutoTable A5 layout, and existing stock utilities remain. No router or duplicate frontend architecture was introduced. A source backup was created at `/tmp/billing-app-before-upgrade.tgz` before editing; browser data was not accessed or cleared.

## Run

1. Set the actual MongoDB password in the ignored root `.env`. Replace only `<YOUR_PASSWORD>` in `MONGO_URI`; percent-encode reserved characters in the password. Do not add brackets, Markdown links, or `mailto:`. The supplied admin settings are in that local file only.
2. Run `npm install`.
3. Run `npm run server` and, in another terminal, `npm run dev`.
4. Log in with the configured admin credentials.
5. Check `http://localhost:5000/api/health`. A connected database returns HTTP 200 with `{"server":"ok","database":"connected"}`. Disconnected returns HTTP 503 and `database: "disconnected"`.

MongoDB Atlas or another replica set is required for transactions. Restart the backend after completing or changing `.env`. Set `CLIENT_ORIGIN` and `VITE_API_URL` for other deployment addresses. Backend credentials never use the `VITE_` prefix. `.env.example` contains empty credential fields.

## Architecture and files

New backend files:

- `server/server.js`: dotenv, database startup, HTTP listener and shutdown.
- `server/config/db.js`: environment-only MongoDB connection and sanitized failure reporting.
- `server/models/index.js`: Product, Buyer, BuyerPrice, Invoice and internal WriteLock models. Existing string IDs are preserved to support local data and variants.
- `server/middleware/authMiddleware.js`: JWT verification.
- `server/app.js`: REST route handlers, validation, transaction coordination, filters and import. Shared handlers avoid duplicate controllers for the four small resources.

New frontend files:

- `src/services/api.ts`: centralized fetch, auth session and typed resource APIs.
- `src/components/AuthGate.tsx`: login and protected application entry.
- `src/components/BuyerModules.tsx`: buyer CRUD/search, selector and buyer price list.
- `src/components/SalesManager.tsx`: saved invoice history, filters, open/cancel/delete.
- `src/utils/pricing.ts`: pure normal/buyer/invoice price resolution.

Modified: `BillingPage.tsx`, `main.tsx`, product editor/picker, item table, invoice preview, totals panel, invoice types, calculations, PDF data access, styles, package manifests and `.gitignore`. Existing uncommitted `storage.ts`, `stock.ts`, and `products.ts` work was retained; backend stock changes reuse `updateCompletedSale`.

New tests: `tests/server.mjs`, `tests/pricing.test.ts`. The existing `tests/browser.mjs` now starts its own temporary backend/database and Vite server.

## APIs

Public: `POST /api/auth/login`, `GET /api/health`.

JWT-protected:

- `GET /api/auth/me`
- `GET, POST /api/products`; `GET, PUT, DELETE /api/products/:id`
- `GET, POST /api/buyers`; `GET, PUT, DELETE /api/buyers/:id`
- `GET, POST /api/buyer-prices`; `GET, PUT, DELETE /api/buyer-prices/:id`
- `GET /api/buyer-prices/buyer/:buyerId`
- `GET /api/buyer-prices/resolve?buyerId=...&productId=...&variantId=...`
- `GET, POST /api/invoices`; `GET, PUT, DELETE /api/invoices/:id`
- `POST /api/import`

Invoice search accepts `search`, `buyer`, `mobile`, `invoiceNumber`, `from`, and `to`; filters combine, and text is escaped as literal search input. Buyer search accepts `search`. Buyer price listing accepts `buyer`.

Authentication validates environment credentials on the server and issues an eight-hour HS256 JWT. The browser keeps it in sessionStorage, verifies existing sessions on entry, and returns to login after a 401. Logout removes the token. No frontend admin password, signup or role system was added.

## Pricing, history, GST and stock

`Product.price` is the existing normal selling price; adding a duplicate `normalPrice` field was unnecessary. Active buyer prices are uniquely indexed by buyer + product + variant, using an empty string for products without variants. A variant requires its own matching rate; otherwise its normal price applies.

Invoice rows save `normalPriceAtSale`, optional `buyerPriceAtSale`, `finalPrice`, item name/code/HSN, quantity, GST percentage and final amount. The legacy `price` field stays synchronized for compatibility. Manually editing an invoice price changes neither master. Changing buyers with existing rows offers Apply Prices, Keep Current Prices, or Cancel. Custom rows and missing historical products retain their current prices when applying a list.

PDF, preview and totals prefer `finalPrice`, falling back to legacy `price`. The A5 geometry, borders, sections and pagination are unchanged. Seller and declaration snapshots are used for saved invoices. Inclusive GST is retained; mixed product rates are extracted per line with proportional discount/return allocation. Tax labels show “mixed” when appropriate.

Invoice writes and stock changes share one MongoDB transaction. A database write lock serializes business mutations, including concurrent sales and product edits. Completion deducts quantities once; edits apply differences; cancellation and deletion restore quantities. Stale invoice revisions and catalogue timestamps are rejected. Failed transactions roll back both invoice and inventory. Buyer pricing never changes stock.

## Local data migration

No automatic database seeding, local-data deletion, or empty-data overwrite occurs. Business Settings has Download local backup and an explicit Import local products and sales action. Import requires an empty MongoDB product catalogue and invoice history, validates records, and imports them atomically. Existing stock is copied as-is, because completed local sales have already affected it. Legacy invoice prices become final-price snapshots.

Seller settings and working/saved local drafts remain browser-local. Existing seller snapshots in imported sales are retained. Buyer masters must be created separately; historical buyer text remains inside imported invoices. Download a browser backup before import. For a nonempty database, reconcile and merge a backup manually rather than overwrite existing records.

## Verification and remaining setup

Commands: `npm test`, `npm run test:server`, `npm run test:browser`, `npm run build`.

Backend tests use a disposable real MongoDB replica set, including health/auth, buyer CRUD/search, product updates, duplicate buyer prices, price fallback, historical snapshots, combined filters, stale edits, transaction rollback, concurrent oversell prevention, and import without double deductions. Browser tests cover login/logout, the ₹7,500 → ₹7,200 → ₹7,100 example, all buyer-change choices, historical prices after master changes, existing catalogue/barcode/draft flows, PDF/print, A5 pagination and mobile overflow. Browser tests use automatically allocated local ports and Chrome at `/usr/bin/google-chrome`. The first database test may download a MongoDB binary into `/tmp/billing-mongodb`.

The live Atlas connection remains unverified because the supplied URI contains `<YOUR_PASSWORD>`. Startup with that configuration reports a disconnected database without logging the URI. Vite reports a nonfatal bundle-size warning.
