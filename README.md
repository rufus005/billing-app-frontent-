# Billing App

A React + TypeScript billing workspace with an Express/Mongoose backend, admin login, buyer price lists and invoice history. Products, buyers, prices and sales are stored in MongoDB; local drafts and seller settings remain in the browser. See [UPGRADE.md](UPGRADE.md) for configuration, APIs, migration and verification details.

## Run

Requires Node.js 22.12+.

```sh
npm install
# Copy .env.example to .env if needed. VITE_API_URL points to the hosted backend.
npm run dev
```

Open http://localhost:5173. The backend is hosted separately; this checkout does not contain `server/server.js`. For production, run `npm run build` and serve `dist/`. `npm run preview` serves the build locally. Fonts are bundled locally; the app does not request third-party fonts or barcode services.

The committed `.env.production` sets the hosted backend for builds. Set `VITE_API_URL` to the backend origin, without `/api`; the API client appends `/api` automatically. Local development reads `.env`. Restart Vite after changing `.env`, and rebuild/redeploy after changing production configuration. A `VITE_API_URL` set in the frontend's Vercel project overrides the file value at build time.

Production configuration in Vercel (Production environment):

| Project | Variable | Value |
| --- | --- | --- |
| `billing-app-frontent` | `VITE_API_URL` | `https://billing-app-mongodb-9ozg.vercel.app` |
| `billing-app-mongodb-9ozg` | `CLIENT_URL` | `https://billing-app-frontent.vercel.app` |
| `billing-app-mongodb-9ozg` | `MONGO_URI` | Your actual MongoDB connection URI, stored as a secret |
| `billing-app-mongodb-9ozg` | `JWT_SECRET` | A strong private signing secret |
| `billing-app-mongodb-9ozg` | `ADMIN_USERNAME` | Your intended admin username |
| `billing-app-mongodb-9ozg` | `ADMIN_PASSWORD` | Your intended admin password, stored as a secret |

The inspected backend reads `CLIENT_URL`, not `CLIENT_ORIGIN`. It accepts comma-separated exact origins; append `http://localhost:5173` only if local development must access this backend. Do not add a trailing slash to origins. CORS must permit `Content-Type`, `Authorization`, and the API methods. Never put backend credentials or Vercel bypass tokens in `VITE_*` variables.

Redeploy the backend after configuring its variables. Update the frontend's existing Vercel `VITE_API_URL` override and redeploy the frontend: Vite embeds this value at build time. The branch deployment URL is protected by Vercel authentication and is unsuitable as the public browser API URL. This frontend checkout does not deploy the backend.

The login form sends `POST /api/auth/login` with JSON `{ "username": "...", "password": "..." }`; success returns a token stored in sessionStorage. Existing sessions use `GET /api/auth/me` with `Authorization: Bearer <token>`. Other API 401 responses clear the session; login 401 responses display the server message. The frontend does not call a health endpoint automatically. Use `GET /api/health` to check the database; `/health` is not a route, and the root metadata response alone does not prove database readiness.

Verify after deployment:

1. `GET https://billing-app-mongodb-9ozg.vercel.app/api/health` must return 200 with `database: "connected"`. The backend connects using `MONGO_URI` during startup; check function logs for sanitized configuration/connection failures. Verify MongoDB credentials and Atlas network access if it remains disconnected.
2. Send an OPTIONS preflight to `/api/auth/login` with `Origin: https://billing-app-frontent.vercel.app`, `Access-Control-Request-Method: POST`, and `Access-Control-Request-Headers: content-type`. It must succeed with `Access-Control-Allow-Origin` matching that exact origin. Repeat for GET with `authorization,content-type` for authenticated calls.
3. Open the deployed frontend and check DevTools Network while logging in. The URL must be `https://billing-app-mongodb-9ozg.vercel.app/api/auth/login` (one `/api`). Invalid credentials should return a readable 401; valid credentials should return 200. Refresh to verify `/api/auth/me`, then verify products, buyers, buyer prices and invoices load without changing records.

Failure interpretation: a 404 or HTML response suggests a wrong URL/path or deployment protection; a rejected preflight or missing allow-origin header is CORS; `503 Login is not configured` means missing admin/JWT configuration; health 503 with `database: "disconnected"` is a separate MongoDB problem. The browser's generic fetch failure cannot distinguish CORS from DNS/network failures; inspect Network and backend logs. HTTP JSON errors are displayed using the server's `message`.

## Features

- Admin login, buyer master, buyer-specific product/variant prices and filtered sales history.
- Editable buyer, seller, bank and invoice details.
- Searchable, category-filtered product picker with batch selection, decimal quantities, Escape, arrow-key navigation and F7 to add selected products.
- Create, edit and delete catalogue products. Item code and barcode uniqueness checks.
- USB/Bluetooth keyboard-style scanner support: focus the code input, scan and press Enter. SKU and barcode matching are case-insensitive.
- Editable custom rows, prices and quantities; delete rows and instant recalculation.
- Automatic recovery of the current invoice, plus a separate explicitly saved draft. Clear Draft deletes the saved snapshot and preserves the current invoice. New Invoice clears the workspace after confirmation.
- Traditional invoice preview and selectable-text A5 PDF with local embedded fonts supporting ₹.
- Print uses the generated PDF on A4 paper; downloads retain A5 pagination. Browser print CSS also provides an invoice-only fallback.

## Calculations

Each line is quantity × price, rounded to two decimals. Sale amount is the sum of rounded lines. Net sale is sale minus discount minus returns, clamped at zero. Taxable amount is extracted from GST-inclusive line prices using saved product GST rates and proportionally allocated deductions, rounded to two decimals. Legacy rows use the invoice GST rate. Total tax is net sale minus taxable amount. CGST is half the total tax, rounded; SGST takes the remaining cents so components always reconcile. Grand total equals the GST-inclusive net sale. No extra whole-rupee round-off is applied. Amount words use Thousand, Lakh, Crore and Paise.

## Local storage

- `billing-app:seller:v1`: seller and bank settings.
- `billing-app:products:v1`: preserved legacy catalogue.
- `billing-app:ledger:v2`: preserved local product/sales ledger, if present.
- `billing-app:working:v1`: current invoice, autosaved after 400 ms.
- `billing-app:draft:v1`: explicitly saved draft snapshot.

Stored objects are checked before loading. Storage failures display a notification. Browser clearing, private browsing or changing the site origin can remove/make data unavailable. Download PDFs for durable invoice copies. Drafting and exporting do not change stock. Completing a sale deducts stock transactionally; edits apply quantity differences and cancellation/deletion restore stock. Use Business Settings to explicitly import local products and sales into an empty database.

## Files and libraries

`src/pages/BillingPage.tsx` coordinates the workspace. `src/components/` contains forms, item editing, barcode input, product manager, product picker, accessible modal, totals and invoice preview. `src/data/` contains sample shoe racks. `src/utils/` contains models, storage, amount words, calculations and the PDF generator. `src/styles.css` includes responsive styles, Tailwind and A5 print CSS.

Runtime: React, React DOM, lucide-react, jsPDF, jspdf-autotable. Build: Vite, TypeScript, Tailwind CSS. Tests: Vitest and Playwright. Formatting: Prettier. Embedded DejaVu font license is in `public/fonts/LICENSE.txt`.

## PDF layout

jsPDF uses A5 (148 × 210 mm) for downloads and A4 (210 × 297 mm) for printing, preserving the existing 134 mm invoice table width. AutoTable draws thin black grid lines and wraps text. Product rows stay together, column headers repeat, and every page repeats the seller/buyer/invoice header. A measured final table groups bank details, totals, four-column GST summary, words and declaration; it moves to the next page if needed. Footer page numbers are outside the content area. Print and download use this same generator with their respective paper sizes, independent of screen width.

The supplied screenshots guided the product picker and traditional invoice. No DOCX file was available in the attachments, so exact Word-document typography and measurements could not be verified. Sample seller details should be reviewed and replaced before issuing invoices. The HTML preview follows the same design but PDF export is authoritative for pagination. Very long invoices use additional pages; no fixed page count is imposed.

## Verification

```sh
npm test
npm run build
# Frontend-only browser checks, mocked API; requires Chrome and Poppler tools:
npm run test:frontend
# Legacy integration suites require the separately maintained backend source:
# npm run test:server
# npm run test:browser
```

The browser script verifies catalogue create/edit/delete, decimal price/stock, product search, code + Enter, item editing/deletion, discounts/returns, persistence after refresh, seller settings, Save/Load/Clear Draft, preview, PDF download, print iframe and print CSS, 100-item multi-page A5 dimensions, and mobile overflow. It writes screenshots and PDF artifacts to `/tmp/billing-*`. Unit tests cover GST-inclusive extraction, tax reconciliation, deductions, zero tax, over-discounts and Indian amount words. PDF text extraction checks can be run with Poppler's `pdftotext`/`pdfinfo` tools. Native print-dialog appearance and physical printer output require a manual check on the target device.

## UPI and QR settings

Business settings load from authenticated `GET /api/business-payment`. Save sends `PUT /api/business-payment`, then reads the settings back before reporting success. The API must return `{ upiId: string, payeeName: string, showQrOnInvoices: boolean, qrCode: string }`. The QR is a PNG/JPEG/WebP data URL (or an empty string). Replacements send `qrCode`; removals send `removeQrCode: true`; ordinary UPI-only updates preserve the saved image. Failed or unconfirmed saves keep the edits and allow retrying. Contract mismatches are shown explicitly. Payment requests time out after 20 seconds.

Uploads validate MIME type, file signature, non-empty size up to 3 MiB, browser decoding, and dimensions up to 16 million pixels. Validation does not certify that an image contains a scannable QR or that its recipient matches the typed UPI ID; check both before issuing invoices. Settings and enlarged previews, invoice previews, A4 printing and A5 downloads preserve the image aspect ratio. A failed image offers retry and replacement. PDF generation reports an error if it cannot load the enabled QR. Unsaved settings are not applied to invoices; exports require loaded, confirmed settings.

`npm run test:frontend` uses intercepted API fixtures, never the live database. It covers login/session restoration, load/save errors and retry, upload validation/replacement/removal, readback mismatches, reload persistence, QR visibility and image recovery, buyer/product/sales navigation, draft editing, invoice preview, A4 print output, A5 download and multi-page output, and mobile layout. Artifacts are written to `/tmp/billing-payment-*`. These checks validate frontend behavior against the documented API contract, not production database writes. The legacy `test:browser` and `test:server` scripts require absent `server/` files and are retained for use alongside the backend checkout.
