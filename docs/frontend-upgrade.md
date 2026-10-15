# Billing frontend upgrade

The original printed-bill attachment was not available in this session. The layout implements the requested structure, but an exact visual match remains pending that reference.

## Implemented

- Existing React screens, login/session handling, invoice numbering and stock arithmetic retained. No backend files changed.
- Seller logo/email, separate billing/shipping addresses, due date, item tax rate, tax-inclusive taxable amount, CGST/SGST or explicitly selected IGST, amount in words, received amount and balance.
- Logo/signature/seal upload, preview, replace and remove using validated raster images; aspect ratios preserved. Seller fields and QR mode use the existing **device-local** seller storage. Browser storage failures are surfaced by the existing persistence error notice. These are not cloud settings.
- A4/A5 selector applies to both PDF download and PDF-backed printing. AutoTable wraps long text, repeats item headings and paginates. Zero discount/return rows are omitted.
- QR mode uses saved UPI/payment settings. Dynamic QR is generated locally, includes `pa`, `pn`, `am`, `cu=INR`, `tr` and `tn`, and uses the calculated outstanding amount. No external QR service receives invoice data. Paid/cancelled invoices have no dynamic QR; unknown received amounts block amount-QR generation. Scanning has no payment-state callback.
- Existing barcode lookup retained; low-stock indicators added to the item picker (threshold 5). Sales filters include sale/payment status. Buyer outstanding view covers completed invoices in the current server search/date range, and discloses unknown payments.
- Non-GST selection sets invoice and item tax rates to zero without changing item prices. Switching back selects 18% as the editable invoice default; review tax rates before saving. Supply type is explicitly selected; address text is not used to guess jurisdiction.

## Backend contracts requiring verification / implementation

The repository contains no `server/` implementation. The following are exact **required extensions**, not claims that the deployed backend supports them. Existing Authorization Bearer headers, revision checks, numbering and stock transactions remain unchanged.

### Invoice resource

Existing routes: `GET /api/invoices?search=<string>&from=YYYY-MM-DD&to=YYYY-MM-DD`, `POST /api/invoices`, `PUT /api/invoices/:id`.

POST/PUT must accept, persist and return these additional fields alongside the existing invoice:

```ts
{
  dueDate?: string; // YYYY-MM-DD or empty to clear
  shipTo?: { name: string; address: string; gstin: string; mobile: string };
  // Omitted shipTo means same as Bill To; PUT must clear previously stored shipTo.
  taxMode?: "gst" | "non-gst";
  taxJurisdiction?: "intra" | "inter";
  receivedAmount?: number; // INR, finite, >= 0, two decimals; missing means unknown
  seller?: {
    // Existing seller fields retained
    email?: string;
    logo?: string; signature?: string; seal?: string; // raster data URLs or CORS-readable HTTPS assets
  };
}
```

GET must return these same fields for every invoice. POST/PUT return the full saved invoice with server revision. Reject invalid values with HTTP 400 `{ "message": "..." }`; preserve existing authorization and conflict behavior. Non-GST invoices require `gst=0` and item `gstPercent=0`. Tax jurisdiction changes presentation of the existing total tax, not tax-inclusive gross prices. Treat omission in a full PUT consistently (clear optional fields); do not silently retain old shipping or dates.

The frontend checks new invoice fields against the save response and warns if they are discarded, retaining the edits in the current local draft. This cannot guarantee durable server storage until the API supports the contract. Legacy invoices without `receivedAmount` display **Unknown / Not recorded**, never an invented zero receipt.

`receivedAmount` is manually entered; no bank reconciliation or authenticated payment ledger is implemented. A production payment ledger should expose `POST /api/invoices/:id/payments` with `{amount:number, paidAt:string, method:string, reference?:string, idempotencyKey:string, revision:number}`, returning the updated invoice including authoritative `receivedAmount`, with 409 on revision conflict and idempotent retry handling. This new endpoint is **not called** by this frontend.

### Cloud branding settings (not called)

To replace existing device-local seller storage, implement `GET/PUT /api/business-settings` with the complete existing Seller fields plus `{email:string, logo:string, signature:string, seal:string, qrMode:"static"|"dynamic"}`. Empty image strings remove an image. Return persisted values after PUT. Validate PNG/JPEG/WebP, maximum 3 MB and 16 million pixels per image, or provide equivalent authenticated asset-upload endpoints and CORS-readable asset URLs. Budget request size for base64 expansion across all three images. Do not repurpose `/api/business-payment` without backward compatibility.

### Existing business-payment contract (unchanged)

`GET /api/business-payment` returns `{upiId:string, payeeName:string, showQrOnInvoices:boolean, qrCode:string}`. `PUT /api/business-payment` accepts those fields plus `removeQrCode?:boolean`; omitted `qrCode` preserves the image. Frontend performs GET readback after save. QR mode remains device-local, so no new backend payment API is assumed.

### Outstanding view

Currently derived from the invoices returned by the existing list route, with unknown-payment counts. For a complete account balance across pagination, add `GET /api/buyers/:id/outstanding` returning `{buyerId:string, currency:"INR", balance:number|null, received:number|null, completedInvoiceCount:number, unknownPaymentInvoiceCount:number, asOf:string}`. Exclude drafts/cancellations. `null` means incomplete payment records. This endpoint is **not called** by the frontend.

## Verification

Run `npm run build`, `npm run lint`, `npm test`, and `npm run test:frontend`. The frontend browser suite uses intercepted test-only API responses; it does not mutate live records. It verifies login/session behavior, payment settings save/readback failures, image validation, barcode lookup, invoice previews, A4/A5 PDFs, 100-item pagination, long billing/shipping addresses, image proportions, dynamic QR payloads and mobile layout. Native printer dialogs and real UPI app scanning require device testing.

`npm run test:browser` and `npm run test:server` depend on absent `server/app.js` and cannot verify the live backend from this checkout.

UPI parameter reference: [NPCI merchant QR circular](https://www.npci.org.in/PDF/npci/upi/circular/2017/Circular18_BankCompliances_to_enbaleUPIMerchantecosystem_0.pdf). QR generation: [qrcode package documentation](https://www.npmjs.com/package/qrcode).
