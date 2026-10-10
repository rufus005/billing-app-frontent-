export interface Seller {
  name: string;
  address: string;
  gstin: string;
  phone: string;
  bank: string;
  branch: string;
  account: string;
  ifsc: string;
}
export interface BusinessPaymentSettings {
  upiId: string;
  payeeName?: string;
  showQrOnInvoices?: boolean;
  qrCode: string;
}
export interface Buyer {
  name: string;
  address: string;
  gstin: string;
  mobile: string;
}
export interface ProductVariant {
  id: string;
  color: string;
  hex: string;
  code: string;
  barcode: string;
  price: number;
  stock: number;
  image?: string;
}
export interface BuyerRecord extends Buyer {
  id: string;
  email: string;
  notes: string;
  active: boolean;
  updatedAt?: string;
}
export interface BuyerPrice {
  id: string;
  buyer: string;
  product: string;
  variant: string;
  price: number;
  active: boolean;
  updatedAt?: string;
}
export interface Product {
  gstPercent?: number;
  updatedAt?: string;
  id: string;
  name: string;
  code: string;
  barcode: string;
  hsn: string;
  category: string;
  price: number;
  stock: number;
  variants?: ProductVariant[];
}
export interface LineItem {
  finalPrice?: number;
  normalPriceAtSale?: number;
  buyerPriceAtSale?: number;
  gstPercent?: number;
  amount?: number;
  variantId?: string;
  color?: string;
  code?: string;
  barcode?: string;
  stock?: number;
  id: string;
  productId?: string;
  name: string;
  hsn: string;
  qty: number;
  price: number;
}
export type SaleStatus = "Draft" | "Completed" | "Cancelled";
export interface Invoice {
  buyerId?: string;
  id: string;
  status: SaleStatus;
  createdAt: string;
  updatedAt: string;
  revision: number;
  seller?: Seller;
  declaration?: string;
  cgstRate?: number;
  sgstRate?: number;
  totals?: ReturnType<typeof import("./calculations").calculate>;
  number: string;
  date: string;
  time: string;
  mode: string;
  vehicle: string;
  buyer: Buyer;
  items: LineItem[];
  discount: number;
  returns: number;
  gst: number;
}
export const defaultSeller: Seller = {
  name: "DYNAMIC UNIVERSAL MARKTING",
  address:
    "# Subbaraju Layout, No 13, Kanakapura RD, Doddakallasandra, Konanakunte, Bengaluru, Karnataka - 560062",
  gstin: "29AKFPU1710L1ZV",
  phone: "7899779304",
  bank: "IDFC FIRST BANK",
  branch: "JP NAGAR, BANGALORE",
  account: "923020037868455",
  ifsc: "UTIB0005011",
};
export const defaultDeclaration =
  "We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.";
export interface BusinessSettings {
  invoicePrefix: string;
  nextInvoiceNumber: number;
  defaultMode: string;
  declaration: string;
  lowStockThreshold: number;
  preventOutOfStock: boolean;
  allowNegativeStock: boolean;
  gstEnabled: boolean;
  gstRate: number;
  cgstRate: number;
  sgstRate: number;
}
export const defaultSettings: BusinessSettings = {
  invoicePrefix: "INV-",
  nextInvoiceNumber: 1,
  defaultMode: "Cash",
  declaration: defaultDeclaration,
  lowStockThreshold: 5,
  preventOutOfStock: true,
  allowNegativeStock: false,
  gstEnabled: true,
  gstRate: 18,
  cgstRate: 9,
  sgstRate: 9,
};
export function newInvoice(
  settings: BusinessSettings = defaultSettings,
): Invoice {
  const d = new Date();
  return {
    id: crypto.randomUUID(),
    status: "Draft",
    createdAt: d.toISOString(),
    updatedAt: d.toISOString(),
    revision: 0,
    declaration: settings.declaration,
    cgstRate: settings.gstEnabled ? settings.cgstRate : 0,
    sgstRate: settings.gstEnabled ? settings.sgstRate : 0,
    number: `INV-${d.getFullYear()}-${String(d.getTime()).slice(-6)}`,
    date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
    time: d.toTimeString().slice(0, 8),
    mode: settings.defaultMode,
    vehicle: "",
    buyer: { name: "", address: "", gstin: "", mobile: "" },
    items: [],
    discount: 0,
    returns: 0,
    gst: settings.gstEnabled ? settings.gstRate : 0,
  };
}
