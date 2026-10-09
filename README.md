# Billing App

A React + TypeScript billing workspace with an Express/Mongoose backend, admin login, buyer price lists and invoice history. Products, buyers, prices and sales are stored in MongoDB; local drafts and seller settings remain in the browser. See [UPGRADE.md](UPGRADE.md) for configuration, APIs, migration and verification details.

## Run

Requires Node.js 22.12+.

```sh
npm install
# Fill the ignored .env using .env.example, including the real Atlas password.
npm run server
# In another terminal:
npm run dev
```

Open http://localhost:5173. For production, run `npm run build`, serve `dist/`, and run the backend with the appropriate API URL and allowed client origin. `npm run preview` serves the build locally. Fonts are bundled locally; the app does not request third-party fonts or barcode services.

## Features

- Admin login, buyer master, buyer-specific product/variant prices and filtered sales history.
- Editable buyer, seller, bank and invoice details.
- Searchable, category-filtered product picker with batch selection, decimal quantities, Escape, arrow-key navigation and F7 to add selected products.
- Create, edit and delete catalogue products. Item code and barcode uniqueness checks.
- USB/Bluetooth keyboard-style scanner support: focus the code input, scan and press Enter. SKU and barcode matching are case-insensitive.
- Editable custom rows, prices and quantities; delete rows and instant recalculation.
- Automatic recovery of the current invoice, plus a separate explicitly saved draft. Clear Draft deletes the saved snapshot and preserves the current invoice. New Invoice clears the workspace after confirmation.
- Traditional invoice preview and selectable-text A5 PDF with local embedded fonts supporting ₹.
- Print uses the generated PDF for consistent A5 pagination. Browser print CSS also provides an invoice-only fallback.

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

jsPDF uses an explicit 148 × 210 mm page. AutoTable draws thin black grid lines and wraps text. Product rows stay together, column headers repeat, and every page repeats the seller/buyer/invoice header. A measured final table groups bank details, totals, four-column GST summary, words and declaration; it moves to the next page if needed. Footer page numbers are outside the content area. Print and download use this same generator, independent of screen width.

The supplied screenshots guided the product picker and traditional invoice. No DOCX file was available in the attachments, so exact Word-document typography and measurements could not be verified. Sample seller details should be reviewed and replaced before issuing invoices. The HTML preview follows the same design but PDF export is authoritative for pagination. Very long invoices use additional pages; no fixed page count is imposed.

## Verification

```sh
npm test
npm run test:server
npm run build
# Starts its own disposable database and servers; requires Google Chrome at /usr/bin/google-chrome:
npm run test:browser
```

The browser script verifies catalogue create/edit/delete, decimal price/stock, product search, code + Enter, item editing/deletion, discounts/returns, persistence after refresh, seller settings, Save/Load/Clear Draft, preview, PDF download, print iframe and print CSS, 100-item multi-page A5 dimensions, and mobile overflow. It writes screenshots and PDF artifacts to `/tmp/billing-*`. Unit tests cover GST-inclusive extraction, tax reconciliation, deductions, zero tax, over-discounts and Indian amount words. PDF text extraction checks can be run with Poppler's `pdftotext`/`pdfinfo` tools. Native print-dialog appearance and physical printer output require a manual check on the target device.
