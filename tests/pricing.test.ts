import { describe, it, expect } from "vitest";
import { priceSnapshot, reprice } from "../src/utils/pricing";
import { calculate } from "../src/utils/calculations";
import {
  newInvoice,
  defaultSettings,
  type Product,
  type BuyerPrice,
} from "../src/utils/invoiceTypes";
import { updateCompletedSale } from "../src/utils/stock";
const product: Product = {
  id: "rack",
  name: "Double Decker 5 Doors",
  code: "DD5",
  barcode: "",
  hsn: "940320",
  category: "Racks",
  price: 7500,
  stock: 20,
  gstPercent: 18,
};
const rate: BuyerPrice = {
  id: "price",
  buyer: "jp",
  product: "rack",
  variant: "",
  price: 7200,
  active: true,
};
describe("separate product, buyer and invoice prices", () => {
  it("resolves a buyer price, fallback and a zero price without mutating masters", () => {
    expect(priceSnapshot(product, undefined, "jp", [rate]).price).toBe(7200);
    expect(priceSnapshot(product, undefined, "new", [rate]).price).toBe(7500);
    expect(
      priceSnapshot(product, undefined, "jp", [{ ...rate, price: 0 }]).price,
    ).toBe(0);
    expect(
      priceSnapshot(product, undefined, "jp", [{ ...rate, active: false }])
        .price,
    ).toBe(7500);
    expect(product.price).toBe(7500);
    expect(rate.price).toBe(7200);
  });
  it("keeps historical final prices and applies buyer changes only explicitly", () => {
    const row = {
      id: "row",
      productId: "rack",
      name: product.name,
      hsn: product.hsn,
      qty: 5,
      ...priceSnapshot(product, undefined, "jp", [rate]),
      price: 7100,
      finalPrice: 7100,
    };
    const invoice = { ...newInvoice(), items: [row] };
    expect(calculate(invoice).sale).toBe(35500);
    expect(
      reprice(invoice.items, [product], "jp", [{ ...rate, price: 7300 }])[0]
        .finalPrice,
    ).toBe(7300);
    expect(row.finalPrice).toBe(7100);
    expect(row.buyerPriceAtSale).toBe(7200);
  });
  it("matches variant prices independently", () => {
    const variant = {
      id: "grey",
      color: "Grey",
      hex: "#808080",
      code: "GREY",
      barcode: "",
      price: 7600,
      stock: 10,
    };
    expect(priceSnapshot(product, variant, "jp", [rate]).price).toBe(7600);
    expect(
      priceSnapshot(product, variant, "jp", [
        { ...rate, variant: "grey", price: 7250 },
      ]).price,
    ).toBe(7250);
  });
  it("preserves inclusive GST with mixed product rates and discounts", () => {
    const i = {
      ...newInvoice(),
      discount: 23,
      items: [
        {
          id: "a",
          name: "A",
          hsn: "",
          qty: 1,
          price: 118,
          finalPrice: 118,
          gstPercent: 18,
        },
        {
          id: "b",
          name: "B",
          hsn: "",
          qty: 1,
          price: 112,
          finalPrice: 112,
          gstPercent: 12,
        },
      ],
    };
    expect(calculate(i)).toMatchObject({
      sale: 230,
      net: 207,
      taxable: 180,
      tax: 27,
      cgst: 13.5,
      sgst: 13.5,
    });
  });
  it("changes variant stock only by quantity and never by price", () => {
    const variant = {
      id: "grey",
      color: "Grey",
      hex: "#808080",
      code: "GREY",
      barcode: "",
      price: 7500,
      stock: 10,
    };
    const products = [{ ...product, variants: [variant] }];
    const i = {
      ...newInvoice(),
      status: "Completed" as const,
      items: [
        {
          id: "row",
          productId: product.id,
          variantId: "grey",
          name: "Rack",
          hsn: "940320",
          qty: 2,
          price: 7100,
        },
      ],
    };
    const sold = updateCompletedSale(products, undefined, i, defaultSettings);
    expect(sold[0].variants![0].stock).toBe(8);
    expect(
      updateCompletedSale(
        sold,
        i,
        { ...i, items: [{ ...i.items[0], price: 7000 }] },
        defaultSettings,
      )[0].variants![0].stock,
    ).toBe(8);
    expect(
      updateCompletedSale(sold, i, undefined, defaultSettings)[0].variants![0]
        .stock,
    ).toBe(10);
  });
});
