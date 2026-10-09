import type {
  BuyerPrice,
  LineItem,
  Product,
  ProductVariant,
} from "./invoiceTypes";
export function priceSnapshot(
  product: Product,
  variant: ProductVariant | undefined,
  buyerId: string | undefined,
  rates: BuyerPrice[],
) {
  const normalPriceAtSale = variant?.price ?? product.price;
  const rate = rates.find(
    (r) =>
      r.active &&
      r.buyer === buyerId &&
      r.product === product.id &&
      (r.variant || "") === (variant?.id || ""),
  );
  const finalPrice = rate?.price ?? normalPriceAtSale;
  return {
    normalPriceAtSale,
    buyerPriceAtSale: rate?.price,
    finalPrice,
    price: finalPrice,
  };
}
export function reprice(
  items: LineItem[],
  products: Product[],
  buyerId: string | undefined,
  rates: BuyerPrice[],
) {
  return items.map((r) => {
    const p = products.find((p) => p.id === r.productId);
    const v = p?.variants?.find((v) => v.id === r.variantId);
    return p && (!r.variantId || v)
      ? { ...r, ...priceSnapshot(p, v, buyerId, rates) }
      : r;
  });
}
