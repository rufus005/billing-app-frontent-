import { calculate, round } from "./calculations";
import type { Invoice, Seller } from "./invoiceTypes";

// Format calendar dates without timezone conversion or changing saved values.
export function formatInvoiceDate(value: string): string {
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(value);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const local = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(value);
  if (local)
    return `${local[1].padStart(2, "0")}/${local[2].padStart(2, "0")}/${local[3]}`;
  return value;
}

export function invoiceFilename(invoice: Invoice): string {
  const safe = (value: string, fallback: string) =>
    value
      .trim()
      .replace(/[^\p{L}\p{N}_-]+/gu, "_")
      .replace(/^_+|_+$/g, "") || fallback;
  const date = formatInvoiceDate(invoice.date).replaceAll("/", "-");
  const type = invoice.documentType === "quotation" ? "Quotation" : "Invoice";
  return `${type}_${safe(invoice.buyer.name, "Buyer")}_${safe(invoice.number, type)}_${safe(date, "Date")}.pdf`;
}

export function paymentSummary(invoice: Invoice) {
  if (invoice.documentType === "quotation")
    return { received: null, balance: null, status: "Not applicable" };
  const total = invoice.totals?.grand ?? calculate(invoice).grand;
  const received = invoice.receivedAmount;
  if (received === undefined || !Number.isFinite(received) || received < 0)
    return { received: null, balance: null, status: "Unknown" };
  const balance = round(Math.max(0, total - received));
  return {
    received,
    balance,
    status:
      invoice.status === "Cancelled"
        ? "Cancelled"
        : balance === 0
          ? "Paid"
          : received > 0
            ? "Partial"
            : "Unpaid",
  };
}

export function taxRows(invoice: Invoice) {
  const t = calculate(invoice);
  if (invoice.taxMode === "non-gst" || t.tax === 0) return [];
  return invoice.taxJurisdiction === "inter"
    ? [["IGST", t.tax] as const]
    : [["CGST", t.cgst] as const, ["SGST", t.sgst] as const];
}

// Keep historical invoice details; fill only a missing legacy logo from settings.
export function invoiceSeller(invoice: Invoice, business: Seller): Seller {
  const seller = invoice.seller || business;
  return { ...seller, logo: seller.logo || business.logo };
}
