import type { Invoice } from "./invoiceTypes";

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
  return `Invoice_${safe(invoice.buyer.name, "Buyer")}_${safe(invoice.number, "Invoice")}_${safe(date, "Date")}.pdf`;
}
