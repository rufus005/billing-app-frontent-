import { describe, expect, it } from "vitest";
import {
  formatInvoiceDate,
  invoiceFilename,
} from "../src/utils/invoicePresentation";
import { newInvoice } from "../src/utils/invoiceTypes";

describe("invoice presentation", () => {
  it.each([
    ["2026-10-13", "13/10/2026"],
    ["2026-10-13T00:00:00Z", "13/10/2026"],
    ["1/2/2026", "01/02/2026"],
    ["13/10/2026", "13/10/2026"],
    ["", ""],
  ])(
    "formats %s without shifting the saved calendar date",
    (input, expected) => {
      expect(formatInvoiceDate(input)).toBe(expected);
    },
  );
  it("creates a safe filename without changing invoice data", () => {
    const invoice = newInvoice();
    invoice.buyer.name = "  Buyer / Company: Test  ";
    invoice.number = "INV/2026/42";
    invoice.date = "2026-10-13";
    const original = structuredClone(invoice);
    expect(invoiceFilename(invoice)).toBe(
      "Invoice_Buyer_Company_Test_INV_2026_42_13-10-2026.pdf",
    );
    expect(invoice).toEqual(original);
    invoice.buyer.name = "";
    expect(invoiceFilename(invoice)).toBe(
      "Invoice_Buyer_INV_2026_42_13-10-2026.pdf",
    );
  });
});
