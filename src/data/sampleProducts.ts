import type { Product } from "../utils/invoiceTypes";
export const sampleProducts: Product[] = [
  ["Double Decker 5 Doors Grey", "DD5GR", 7500, 24],
  ["Double Decker 5 Doors Beige", "DD5BG", 7500, 18],
  ["Double Decker 4 Doors Brown", "DD4BR", 6499.99, 32],
  ["Double Decker 4 Doors Grey", "DD4GR", 6499.99, 15],
  ["Double Decker 4 Doors Beige", "DD4BG", 6499.99, 5],
  ["Double Decker 3 Doors Full Brown", "DD3FB", 5300, 18],
  ["Double Decker 2 Doors Brown", "DD2BR", 4200, 40],
  ["Double Decker 2 Doors Grey", "DD2GR", 4200, 22],
  ["Double Decker 2 Doors Full Brown", "DD2FB", 4200, 12],
  ["Cloth Hanger 8 Feet", "CH8FT", 4400, 19],
  ["Double Decker Shoe Rack 3 Doors", "SR3D", 8500, 14],
  ["Double Decker 4 Doors Brown / Beige", "DD4BB", 10500, 3],
].map(([name, code, price, stock], index) => ({
  id: `product-${index}`,
  name: String(name),
  code: String(code),
  price: Number(price),
  stock: Number(stock),
  barcode: `890100000${String(index + 1).padStart(3, "0")}`,
  hsn: "940320",
  category: index === 9 ? "Accessories" : "Shoe racks",
}));
