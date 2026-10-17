# Invoice images, layout and browser storage

## Causes and changes

- Preview and export preferred the invoice's historical seller snapshot, even when it predated the Business Settings logo. Both paths now share a resolver that fills a missing logo from the loaded business profile without changing historical seller fields or financial values. Export waits for the profile if necessary.
- The header reserves the logo's dimensions and aligns the business text alongside it. Bank labels and values have independent wrapping columns. The existing uploaded QR is drawn below at 32 mm with its original aspect ratio and payload. Totals and signature remain on the right. Preview and print use the same PDF generator as download.
- Seller images and repeated seller snapshots in working/archived drafts exhausted the much smaller localStorage allowance. The previous warning also called unrelated storage errors “full.” These browser snapshots now use IndexedDB. SHA-256 image references retain the exact original data URLs once per image across snapshots. The localStorage copy is removed only after the IndexedDB transaction commits. Ledger/products and MongoDB are untouched. Archived drafts are included in local backups.
- Startup restores snapshots before rendering the editor. Failed initialization stops the editor from overwriting unavailable data. Writes report success only after commit, and pending writes retain the unload warning. Failures distinguish quota exhaustion from unavailable storage.
- Business Settings → Check browser storage usage reports localStorage bytes and the browser's origin usage/quota estimate. Disk space and browser storage quota are different measurements.

## Scope and checks

The host had 762 GB free on the workspace drive and 187 GB free on the temporary drive. Removed only two unused Vite dependency caches (`.vite-buyer`, `.vite-payment`), approximately 28.6 MiB. No invoices, buyers, products, original images, or MongoDB records were removed. The user's authenticated production browser usage is not accessible from the test browser; use the in-app usage check there.

`npm run test:invoice` checks real Chromium IndexedDB migration, a 6 MB snapshot, duplicate image storage, reload recovery, and preservation after a failed write. It generates A4/A5 PDFs covering branding, static and dynamic QR, payment states, GST/non-GST, long values and multipage invoices; compares preview and download pixels; decodes the QR from PDF pixels; and checks margins and totals. Test assets are synthetic and never replace business assets.

`node --import tsx tests/workflow.mjs` uses an isolated MongoDB replica set and exercises login, buyer/product creation, uploaded business logo saving, invoice creation/stock, preview, download, print request, payment, dashboard, responsive views, reload and draft recovery. It never connects to production MongoDB.

Build with `npm run build`; unit tests with `npm test`; lint with `npm run lint`.
