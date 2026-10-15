import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const backend = resolve(
  process.env.BILLING_BACKEND_DIR || "../billin-app-server/server",
);
const mongoose = createRequire(pathToFileURL(backend + "/package.json"))(
  "mongoose",
);
import { createServer } from "vite";
import { once } from "node:events";
import { createServer as createSocketServer } from "node:net";

import { sampleProducts } from "../src/data/sampleProducts.ts";
process.env.ADMIN_USERNAME = "browser-admin";
process.env.ADMIN_PASSWORD = "browser-password";
process.env.JWT_SECRET = "browser-test-secret";
process.env.MONGO_URI = "";
const { createApp, initialize } = await import(
  pathToFileURL(backend + "/app.js").href
);
const { Product, Buyer, BuyerPrice } = await import(
  pathToFileURL(backend + "/models/index.js").href
);
const db = await MongoMemoryReplSet.create({
  replSet: { count: 1 },
  binary: { downloadDir: "/tmp/billing-mongodb" },
});
await mongoose.connect(db.getUri());
await initialize();
await Product.create(sampleProducts);
await Buyer.create([
  { id: "jp", name: "JP ISMAIL KHAN", mobile: "8884052640" },
  { id: "new", name: "NEW CUSTOMER" },
]);
await BuyerPrice.create({
  id: "jp-rate",
  buyer: "jp",
  product: "product-0",
  price: 7200,
});
const probe = createSocketServer().listen(0, "127.0.0.1");
await once(probe, "listening");
const testPort = probe.address().port;
await new Promise((r) => probe.close(r));
process.env.CLIENT_URL = `http://127.0.0.1:${testPort}`;
const server = createApp().listen(0, "127.0.0.1");
await once(server, "listening");
const apiUrl = `http://127.0.0.1:${server.address().port}`;

const vite = await createServer({
  server: { port: testPort, host: "127.0.0.1", strictPort: true },
  define: { "import.meta.env.VITE_API_URL": JSON.stringify(apiUrl) },
});
await vite.listen();
const browserUrl = `http://127.0.0.1:${vite.httpServer.address().port}`;
let browser;
try {
  browser = await chromium.launch({
    executablePath: "/usr/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
    acceptDownloads: true,
  });
  const errors = [];
  page.on("requestfailed", (r) =>
    console.error("Request failed:", r.url(), r.failure()),
  );
  page.on("console", (m) => {
    if (m.type() === "error") console.error(m.text());
  });
  page.on("pageerror", (e) => {
    errors.push(e.message);
    console.error(e.message);
  });
  page.on("dialog", (d) => d.accept());
  page.setDefaultTimeout(60000);
  await page.goto(browserUrl, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await page.getByLabel("Username", { exact: true }).fill("browser-admin");
  await page.getByLabel("Password", { exact: true }).fill("browser-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.getByLabel("Buyer", { exact: true }).selectOption("jp");
  await page
    .getByRole("textbox", { name: "Scan barcode or enter item code" })
    .fill("DD5GR");
  await page
    .getByRole("textbox", { name: "Scan barcode or enter item code" })
    .press("Enter");
  await page.waitForFunction(
    () =>
      document.querySelector('[aria-label="Item 1 price"]')?.value === "7200",
  );
  await page.getByLabel("Item 1 price", { exact: true }).fill("7100");
  await page.getByLabel("Buyer", { exact: true }).selectOption("new");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.equal(
    await page.getByLabel("Buyer", { exact: true }).inputValue(),
    "jp",
  );
  await page.getByLabel("Buyer", { exact: true }).selectOption("new");
  await page
    .getByRole("button", { name: "Keep Current Prices", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("Item 1 price", { exact: true }).inputValue(),
    "7100",
  );
  await page.getByLabel("Buyer", { exact: true }).selectOption("jp");
  await page.getByRole("button", { name: "Apply Prices", exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector('[aria-label="Item 1 price"]')?.value === "7200",
  );
  await page.getByLabel("Buyer", { exact: true }).selectOption("new");
  await page.getByRole("button", { name: "Apply Prices", exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector('[aria-label="Item 1 price"]')?.value === "7500",
  );
  await page.getByLabel("Buyer", { exact: true }).selectOption("jp");
  await page.getByRole("button", { name: "Apply Prices", exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector('[aria-label="Item 1 price"]')?.value === "7200",
  );
  await page.getByLabel("Item 1 price", { exact: true }).fill("7100");
  await page.getByLabel("Received amount", { exact: true }).fill("2000");
  await page
    .getByRole("button", { name: "Complete Sale", exact: true })
    .click();
  await page.getByText("Invoice saved to MongoDB.", { exact: true }).waitFor();
  const saved = await mongoose.connection
    .collection("invoices")
    .findOne({ buyerId: "jp" });
  assert.equal(saved.items[0].finalPrice, 7100);
  assert.equal(saved.receivedAmount, 2000);
  await page.reload({ waitUntil: "domcontentloaded" });
  assert.equal((await BuyerPrice.findOne({ id: "jp-rate" })).price, 7200);
  await BuyerPrice.updateOne({ id: "jp-rate" }, { $set: { price: 7300 } });
  await page.getByRole("button", { name: "Sales", exact: true }).click();
  await page.getByRole("button", { name: "Open", exact: true }).click();
  assert.equal(
    await page.getByLabel("Item 1 price", { exact: true }).inputValue(),
    "7100",
  );
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.locator(".modal .invoice-paper")).toContainText("7100.00");
  await expect(page.locator(".modal .invoice-paper")).toContainText(
    "₹5,100.00",
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  const snapshotDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  await (await snapshotDownload).saveAs("/tmp/billing-snapshot.pdf");
  await page.getByRole("button", { name: "New invoice", exact: true }).click();
  await page.screenshot({ path: "/tmp/billing-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Add Item", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Search products", exact: true })
    .fill("DD5GR");
  assert.equal(await page.locator(".picker-table tbody tr").count(), 1);
  await page.getByRole("button", { name: "+ Add", exact: true }).click();
  await page
    .getByRole("spinbutton", {
      name: "Quantity Double Decker 5 Doors Grey",
      exact: true,
    })
    .fill("2.5");
  await page.getByRole("button", { name: "Add to Bill" }).click();
  assert.equal(
    await page
      .getByRole("spinbutton", { name: "Item 1 quantity", exact: true })
      .inputValue(),
    "2.5",
  );
  await page
    .getByRole("spinbutton", { name: "Item 1 price", exact: true })
    .fill("118");
  assert.match(
    await page.locator(".grand-total strong").innerText(),
    /295\.00/,
  );
  await page
    .getByRole("spinbutton", { name: "Special discount", exact: true })
    .fill("59");
  await page
    .getByRole("spinbutton", { name: "Return amount", exact: true })
    .fill("118");
  assert.match(
    await page.locator(".grand-total strong").innerText(),
    /118\.00/,
  );
  await page
    .getByRole("textbox", { name: "Scan barcode or enter item code" })
    .fill("DD2BR");
  await page
    .getByRole("textbox", { name: "Scan barcode or enter item code" })
    .press("Enter");
  assert.equal(await page.locator(".items-table tbody tr").count(), 2);
  await page
    .getByRole("button", { name: "Delete item 2", exact: true })
    .click();
  assert.equal(await page.locator(".items-table tbody tr").count(), 1);
  await page.getByRole("button", { name: "Save Draft", exact: true }).click();
  await page
    .getByRole("spinbutton", { name: "Item 1 quantity", exact: true })
    .fill("10");
  await page.getByRole("button", { name: "Load Draft", exact: true }).click();
  assert.equal(
    await page
      .getByRole("spinbutton", { name: "Item 1 quantity", exact: true })
      .inputValue(),
    "2.5",
  );
  await page.waitForTimeout(600);
  await page.reload();
  assert.equal(
    await page
      .getByRole("spinbutton", { name: "Item 1 quantity", exact: true })
      .inputValue(),
    "2.5",
  );
  await page.getByRole("button", { name: "Clear Draft", exact: true }).click();
  assert.equal(
    await page.evaluate(() => localStorage.getItem("billing-app:draft:v1")),
    null,
  );
  await page.getByRole("button", { name: "Products", exact: true }).click();
  await page
    .getByRole("button", { name: "Create product", exact: true })
    .click();
  await page
    .getByLabel("Product name", { exact: true })
    .fill("Test decimal rack");
  await page.getByLabel("Item code / SKU", { exact: true }).fill("TEST-RACK");
  await page.getByLabel("Barcode", { exact: true }).fill("123456");
  await page
    .getByLabel("Normal price (GST inclusive)", { exact: true })
    .fill("118.50");
  await page.getByLabel("Stock", { exact: true }).fill("4.5");
  await page.getByRole("button", { name: "Save product", exact: true }).click();
  await page
    .getByRole("button", { name: "Edit Test decimal rack", exact: true })
    .click();
  await page.getByLabel("Product name", { exact: true }).fill("Updated rack");
  await page.getByRole("button", { name: "Save product", exact: true }).click();
  await page.reload();
  assert.equal(
    await page.getByRole("button", { name: "Products", exact: true }).count(),
    1,
  );
  await page.getByRole("button", { name: "Products", exact: true }).click();
  assert.equal(
    await page
      .getByRole("button", { name: "Edit Updated rack", exact: true })
      .count(),
    1,
  );
  await page
    .getByRole("button", { name: "Delete Updated rack", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Business settings", exact: true })
    .click();
  await page
    .getByLabel("Company / seller name", { exact: true })
    .fill("TEST STORE");
  await page.reload();
  await page
    .getByRole("button", { name: "Business settings", exact: true })
    .click();
  assert.equal(
    await page
      .getByLabel("Company / seller name", { exact: true })
      .inputValue(),
    "TEST STORE",
  );
  await page
    .getByRole("button", { name: "Create invoice", exact: true })
    .click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  await (await download).saveAs("/tmp/billing-single.pdf");
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  assert.equal(await page.locator(".modal .invoice-paper").count(), 1);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Print", exact: true }).click();
  await page.waitForSelector(".print-frame");
  const multipage = await page.evaluate(async () => {
    const { generatePDF } = await import("/src/utils/pdfGenerator.ts");
    const { newInvoice, defaultSeller } =
      await import("/src/utils/invoiceTypes.ts");
    const i = newInvoice();
    i.items = Array.from({ length: 100 }, (_, n) => ({
      id: String(n),
      name: `ROW ${n + 1} Double Decker Shoe Rack Full Brown`,
      hsn: "940320",
      qty: 2,
      price: 118,
    }));
    const doc = await generatePDF(i, defaultSeller);
    return {
      pages: doc.getNumberOfPages(),
      width: doc.internal.pageSize.getWidth(),
      height: doc.internal.pageSize.getHeight(),
      pdf: doc.output("datauristring"),
    };
  });
  assert.ok(multipage.pages > 1);
  assert.ok(Math.abs(multipage.width - 148) < 0.1);
  assert.ok(Math.abs(multipage.height - 210) < 0.1);
  fs.writeFileSync(
    "/tmp/billing-multi.pdf",
    Buffer.from(multipage.pdf.split(",")[1], "base64"),
  );
  await page.getByRole("button", { name: "Add Item", exact: true }).click();
  await page.screenshot({ path: "/tmp/billing-picker.png", fullPage: true });
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "/tmp/billing-mobile.png", fullPage: true });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.getByRole("button", { name: "Add Item", exact: true }).click();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.screenshot({
    path: "/tmp/billing-picker-mobile.png",
    fullPage: true,
  });
  await page.emulateMedia({ media: "print" });
  assert.equal(await page.locator(".app-shell").isVisible(), false);
  assert.equal(await page.locator(".print-only").isVisible(), true);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: catalogue CRUD, decimal quantities/prices, search, barcode, edit/delete rows, GST/deductions, draft save/load/clear, persistence, preview, PDF download, print frame/CSS, multipage A5, mobile overflow. PDF pages:",
    multipage.pages,
  );
  await page.emulateMedia({ media: "screen" });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Logout", exact: true }).click();
  await page.getByRole("button", { name: "Log in", exact: true }).waitFor();
  console.log(
    "PASS: authenticated UI, buyer switching apply/keep/cancel, 7500/7200/7100 pricing, saved history and PDF snapshot, logout.",
  );
} catch (error) {
  if (browser) {
    for (const context of browser.contexts())
      for (const page of context.pages()) {
        console.error(await page.locator("body").innerText());
        await page.screenshot({ path: "/tmp/billing-test-failure.png" });
      }
  }
  throw error;
} finally {
  await browser?.close();
  await vite.close();
  await new Promise((r) => server.close(r));
  await mongoose.disconnect();
  await db.stop();
}
