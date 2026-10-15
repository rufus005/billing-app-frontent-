import { describe, it, expect } from "vitest";
import { newInvoice } from "../src/utils/invoiceTypes";
import { paymentSummary, taxRows } from "../src/utils/invoicePresentation";
import { upiPaymentUri } from "../src/utils/paymentQr";
import { normalizeInvoice } from "../src/utils/storage";
const invoice = () => ({
  ...newInvoice(),
  items: [
    { id: "1", name: "Item", hsn: "123", qty: 2, price: 118, gstPercent: 18 },
  ],
  receivedAmount: 36,
});
const payment = { upiId: "shop@bank", payeeName: "Shop & Sons", qrCode: "" };
describe("invoice payments and GST presentation", () => {
  it("uses tax-inclusive outstanding amount and encodes invoice references safely", () => {
    const i = { ...invoice(), number: "INV / 42 & 1" };
    const uri = new URL(upiPaymentUri(i, payment));
    expect(uri.searchParams.get("am")).toBe("200.00");
    expect(uri.searchParams.get("pn")).toBe("Shop & Sons");
    expect(uri.searchParams.get("tn")).toBe("Invoice INV / 42 & 1");
    expect(uri.searchParams.get("tr")).toBe(i.id);
    expect(i.receivedAmount).toBe(36);
    expect(paymentSummary(i).status).toBe("Partial");
  });
  it("never guesses payments on legacy invoices", () => {
    const i = { ...invoice(), receivedAmount: undefined };
    expect(paymentSummary(normalizeInvoice(i)).balance).toBeNull();
    expect(() => upiPaymentUri(i, payment)).toThrow("Record the received");
  });
  it("omits amount QR for paid and cancelled invoices and validates UPI settings", () => {
    expect(upiPaymentUri({ ...invoice(), receivedAmount: 236 }, payment)).toBe(
      "",
    );
    expect(upiPaymentUri({ ...invoice(), status: "Cancelled" }, payment)).toBe(
      "",
    );
    expect(() =>
      upiPaymentUri(invoice(), { ...payment, upiId: "bad" }),
    ).toThrow("valid UPI");
  });
  it("splits the existing tax without changing totals", () => {
    expect(taxRows(invoice())).toEqual([
      ["CGST", 18],
      ["SGST", 18],
    ]);
    expect(taxRows({ ...invoice(), taxJurisdiction: "inter" })).toEqual([
      ["IGST", 36],
    ]);
    expect(
      taxRows({
        ...invoice(),
        taxMode: "non-gst",
        gst: 0,
        items: invoice().items.map((r) => ({ ...r, gstPercent: 0 })),
      }),
    ).toEqual([]);
  });
});
