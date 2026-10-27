import { describe, it, expect, test } from "vitest";
import { calculate, round } from "../src/utils/calculations";
import { amountToWords } from "../src/utils/amountToWords";
import { newInvoice } from "../src/utils/invoiceTypes";
describe("invoice financial calculations", () => {
  it("extracts inclusive GST and conserves the total", () => {
    const i = {
      ...newInvoice(),
      items: [{ id: "1", name: "Rack", hsn: "940320", qty: 10, price: 118 }],
    };
    expect(calculate(i)).toEqual({
      qty: 10,
      sale: 1180,
      net: 1180,
      taxable: 1000,
      tax: 180,
      cgst: 90,
      sgst: 90,
      grand: 1180,
    });
  });
  it("applies discount and return before extracting tax", () => {
    const i = {
      ...newInvoice(),
      discount: 118,
      returns: 59,
      items: [{ id: "1", name: "Rack", hsn: "", qty: 10, price: 118 }],
    };
    expect(calculate(i).net).toBe(1003);
    expect(calculate(i).taxable).toBe(850);
    expect(calculate(i).tax).toBe(153);
  });
  it("rounds lines and splits odd tax cents without losing money", () => {
    const i = {
      ...newInvoice(),
      items: [{ id: "1", name: "Rack", hsn: "", qty: 1.25, price: 99.99 }],
    };
    const t = calculate(i);
    expect(t.sale).toBe(124.99);
    expect(round(t.cgst + t.sgst)).toBe(t.tax);
    expect(round(t.taxable + t.tax)).toBe(t.net);
  });
  it("supports zero tax and clamps over-discounts", () => {
    const i = {
      ...newInvoice(),
      gst: 0,
      items: [{ id: "1", name: "Rack", hsn: "", qty: 2, price: 100 }],
    };
    expect(calculate(i).tax).toBe(0);
    expect(calculate({ ...i, discount: 250 }).grand).toBe(0);
  });
  it("uses Indian numbering and paise including carry", () => {
    expect(amountToWords(389200)).toBe(
      "Rupees Three Lakh Eighty Nine Thousand Two Hundred Only",
    );
    expect(amountToWords(10000000.25)).toBe(
      "Rupees One Crore and Twenty Five Paise Only",
    );
    expect(amountToWords(0)).toBe("Rupees Zero Only");
    expect(amountToWords(99.999)).toBe("Rupees One Hundred Only");
  });
});

test('optional exclusive pricing and discounts use the same totals as the API', () => {
  const invoice = { ...newInvoice(), pricingMode: 'exclusive' as const, additionalCharges: 10.25, autoRoundOff: true, items: [{id:'exclusive',name:'Item',hsn:'123',qty:2,price:100,discountPercent:10,gstPercent:18}] };
  const total = calculate(invoice);
  expect(total.taxable).toBe(180); expect(total.tax).toBe(32.4); expect(total.grand).toBe(223); expect(total.roundOff).toBe(0.35);
});

test("custom charges add to totals and taxable charges contribute GST", () => {
  const inclusive = {
    ...newInvoice(),
    items: [{ id: "item", name: "Item", hsn: "", qty: 1, price: 118 }],
    additionalCharges: [
      { name: "Delivery", amount: 118, taxable: true },
      { name: "Packaging", amount: 20 },
    ],
  };
  expect(calculate(inclusive)).toMatchObject({
    sale: 256,
    net: 256,
    taxable: 200,
    tax: 36,
    grand: 256,
  });

  const exclusive = calculate({
    ...inclusive,
    pricingMode: "exclusive",
    items: [{ id: "item", name: "Item", hsn: "", qty: 1, price: 100 }],
    additionalCharges: [{ name: "Installation", amount: 50, taxable: true }],
  });
  expect(exclusive).toMatchObject({
    sale: 150,
    net: 150,
    taxable: 150,
    tax: 27,
    grand: 177,
  });
});
