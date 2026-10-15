import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { sampleProducts } from "../src/data/sampleProducts.ts";
import { defaultSeller, newInvoice } from "../src/utils/invoiceTypes.ts";
import fs from "node:fs";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
const vite = await createServer({
  server: { host: "127.0.0.1", port: 0, watch: null },
  define: {
    "import.meta.env.VITE_API_URL": JSON.stringify("http://billing.test"),
  },
});
await vite.listen();
let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
    acceptDownloads: true,
  });
  page.setDefaultTimeout(60000);
  page.setDefaultNavigationTimeout(120000);

  const errors = [];
  const writes = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  let payment = {
    upiId: "",
    qrCode: "",
    payeeName: "",
    showQrOnInvoices: true,
  };
  let loadFails = true,
    saveFails = false,
    mismatch = false;
  await page.route("http://billing.test/api/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204 });
    const reply = (json, status = 200) => route.fulfill({ status, json });
    if (path === "/api/auth/login") return reply({ token: "test-session" });
    assert.equal(req.headers().authorization, "Bearer test-session");
    if (path === "/api/auth/me") return reply({ username: "test" });
    if (path === "/api/business-payment") {
      if (req.method() === "GET")
        return loadFails
          ? reply({ message: "Payment service unavailable" }, 503)
          : reply(payment);
      writes.push(req.postDataJSON());
      if (saveFails)
        return route.fulfill({
          status: 502,
          contentType: "text/html",
          body: "<h1>Unavailable</h1>",
        });
      const value = req.postDataJSON();
      if (!mismatch)
        payment = {
          ...payment,
          upiId: value.upiId,
          payeeName: value.payeeName,
          showQrOnInvoices: value.showQrOnInvoices,
          qrCode: value.removeQrCode ? "" : (value.qrCode ?? payment.qrCode),
        };
      return reply(payment);
    }
    assert.equal(req.method(), "GET", `Unexpected mutation: ${path}`);
    if (path === "/api/products") return reply(sampleProducts);
    if (path === "/api/buyers")
      return reply([
        {
          id: "buyer",
          name: "Existing Buyer",
          mobile: "1234567890",
          address: "",
          gstin: "",
          active: true,
        },
      ]);
    if (path === "/api/buyer-prices") return reply([]);
    if (path === "/api/invoices")
      return reply([
        {
          ...newInvoice(),
          id: "sale-partial",
          number: "SALE-PARTIAL",
          status: "Completed",
          buyerId: "buyer",
          buyer: {
            name: "Existing Buyer",
            address: "",
            gstin: "",
            mobile: "1234567890",
          },
          receivedAmount: 18,
          items: [{ id: "r", name: "Test", hsn: "", qty: 1, price: 118 }],
        },
        {
          ...newInvoice(),
          id: "sale-unknown",
          number: "SALE-UNKNOWN",
          status: "Completed",
          buyerId: "buyer",
          buyer: {
            name: "Existing Buyer",
            address: "",
            gstin: "",
            mobile: "1234567890",
          },
          receivedAmount: undefined,
          items: [{ id: "r", name: "Test", hsn: "", qty: 1, price: 118 }],
        },
      ]);
    throw new Error(`Unexpected API ${path}`);
  });
  await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}`, {
    waitUntil: "domcontentloaded",
  });
  await page.getByLabel("Username", { exact: true }).fill("test");
  await page.getByLabel("Password", { exact: true }).fill("test");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  const nav = (name) => page.getByRole("button", { name, exact: true }).click();
  await nav("Business settings");
  await expect(
    page.getByText("Payment service unavailable", { exact: false }),
  ).toBeVisible();
  await expect(page.getByLabel("UPI ID", { exact: true })).toBeDisabled();
  loadFails = false;
  await nav("Retry loading");
  await expect(page.getByLabel("UPI ID", { exact: true })).toBeEnabled();
  const image = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 240;
    canvas.height = 120;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, 240, 120);
    ctx.fillStyle = "black";
    ctx.fillRect(20, 20, 80, 80);
    return canvas.toDataURL("image/png");
  });
  const upload = (buffer, mimeType = "image/png", name = "qr.png") =>
    page
      .getByLabel("Business QR image")
      .setInputFiles({ name, mimeType, buffer });
  await upload(Buffer.from("invalid"));
  await expect(page.getByRole("alert")).toContainText("does not match");
  await upload(Buffer.alloc(3 * 1024 * 1024 + 1));
  await expect(page.getByRole("alert")).toContainText("3 MB");
  await upload(Buffer.from(image.split(",")[1], "base64"));
  const replacement = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 120;
    canvas.height = 240;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, 120, 240);
    ctx.fillStyle = "black";
    ctx.fillRect(20, 20, 80, 80);
    return canvas.toDataURL("image/png");
  });
  await upload(Buffer.from(replacement.split(",")[1], "base64"));
  await expect(page.getByAltText("Business UPI QR preview")).toHaveAttribute(
    "src",
    replacement,
  );
  await upload(Buffer.from(image.split(",")[1], "base64"));
  await nav("Preview QR");
  await expect(page.getByAltText("Full payment QR code")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByLabel("UPI ID", { exact: true }).fill("invalid");
  await nav("Save Changes");
  await expect(page.getByRole("alert")).toContainText("valid UPI");
  await page.getByLabel("UPI ID", { exact: true }).fill(" shop@bank.test ");
  await page.getByLabel("UPI Payee Name").fill("Test Business");
  saveFails = true;
  await nav("Save Changes");
  await expect(page.getByRole("alert")).toContainText("HTTP 502");
  await expect(page.getByAltText("Business UPI QR preview")).toHaveAttribute(
    "src",
    image,
  );
  saveFails = false;
  await nav("Save Changes");
  await expect(
    page.getByRole("status").filter({ hasText: "saved successfully" }),
  ).toBeVisible();
  assert.equal(payment.qrCode, image);
  await page.reload();
  await nav("Business settings");
  await expect(page.getByLabel("UPI ID", { exact: true })).toHaveValue(
    "shop@bank.test",
  );
  await expect(page.getByAltText("Business UPI QR preview")).toHaveAttribute(
    "src",
    image,
  );
  await page.getByLabel("UPI ID", { exact: true }).fill("changed@bank");
  mismatch = true;
  await nav("Save Changes");
  await expect(page.getByRole("alert")).toContainText("Backend API mismatch");
  await expect(page.getByLabel("UPI ID", { exact: true })).toHaveValue(
    "changed@bank",
  );
  mismatch = false;
  await nav("Save Changes");
  await expect(
    page.getByRole("status").filter({ hasText: "saved successfully" }),
  ).toBeVisible();
  assert.equal(writes.at(-2).qrCode, undefined);
  assert.equal(writes.at(-1).qrCode, image);
  assert.equal(payment.qrCode, image);
  await nav("Create invoice");
  await page.getByLabel("Buyer", { exact: true }).selectOption("buyer");
  await page
    .getByRole("textbox", { name: "Scan barcode or enter item code" })
    .fill("DD5GR");
  await page
    .getByRole("textbox", { name: "Scan barcode or enter item code" })
    .press("Enter");
  await expect(page.getByLabel("Item 1 price", { exact: true })).toBeVisible();
  await page.getByLabel("Item 1 quantity", { exact: true }).fill("2");
  await page.getByLabel("Invoice date", { exact: true }).fill("2026-10-13");
  await page.getByLabel("Invoice number", { exact: true }).fill("INV/2026/42");
  await nav("Save Draft");
  await nav("Preview");
  const preview = page.getByRole("dialog").locator(".invoice-paper");
  await expect(preview).toContainText("Buyer: Existing Buyer");
  await expect(preview).toContainText("13/10/2026");
  await expect(preview).toContainText("INV/2026/42");
  for (const detail of Object.values(defaultSeller))
    await expect(preview).toContainText(detail);
  await expect(preview).toContainText("Double Decker 5 Doors Grey");
  await expect(preview).toContainText("₹15,000.00");
  await expect(preview).not.toContainText("Special Discount");
  await expect(preview).not.toContainText("Return Amount");
  await expect(preview).toContainText("UPI ID: changed@bank");
  await expect(preview.locator("canvas").first()).toBeVisible();
  await page.screenshot({
    path: "/tmp/billing-payment-preview.png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  const download = page.waitForEvent("download");
  await nav("Download PDF");
  const downloaded = await download;
  assert.equal(
    downloaded.suggestedFilename(),
    "Invoice_Existing_Buyer_INV_2026_42_13-10-2026.pdf",
  );
  await downloaded.saveAs("/tmp/billing-payment-a5.pdf");
  const pdfText = (path) =>
    execFileSync("pdftotext", [path, "-"], { encoding: "utf8" }).replace(
      /\s+/g,
      " ",
    );
  const zeroText = pdfText("/tmp/billing-payment-a5.pdf");
  for (const value of [
    "Existing Buyer",
    "INV/2026/42",
    "13/10/2026",
    "Bank Details",
    "GSTIN",
    "Grand Total",
    "CGST",
    "SGST",
    defaultSeller.name,
    defaultSeller.gstin,
    defaultSeller.phone,
    defaultSeller.bank,
    defaultSeller.account,
    defaultSeller.ifsc,
    "Double Decker 5 Doors Grey",
    "2.00",
    "7500.00",
    "15000.00",
    "₹15,000.00",
  ])
    assert.ok(zeroText.includes(value), `Missing PDF detail: ${value}`);
  assert.doesNotMatch(zeroText, /Special Discount|Return Amount/);
  for (const [discount, returns] of [
    [59, 0],
    [0, 118],
    [59, 118],
  ]) {
    await page
      .getByLabel("Special discount", { exact: true })
      .fill(String(discount));
    await page
      .getByLabel("Return amount", { exact: true })
      .fill(String(returns));
    const total = await page.locator(".grand-total strong").innerText();
    await nav("Preview");
    await expect(preview).toContainText(total);
    assert.equal(
      (await preview.innerText()).includes("Special Discount"),
      discount !== 0,
    );
    assert.equal(
      (await preview.innerText()).includes("Return Amount"),
      returns !== 0,
    );
    await page.keyboard.press("Escape");
    const next = page.waitForEvent("download");
    await nav("Download PDF");
    const path = `/tmp/billing-deductions-${discount}-${returns}.pdf`;
    await (await next).saveAs(path);
    const text = pdfText(path);
    assert.equal(text.includes("Special Discount"), discount !== 0);
    assert.equal(text.includes("Return Amount"), returns !== 0);
    assert.ok(text.includes(total));
    for (const label of [
      "Taxable Amount",
      "CGST",
      "SGST",
      "Total Tax",
      "Bank Details",
      "changed@bank",
    ])
      assert.ok(
        text.includes(label),
        `Missing ${label} after hiding deduction rows`,
      );
  }

  const info = execFileSync("pdfinfo", ["/tmp/billing-payment-a5.pdf"], {
    encoding: "utf8",
  });
  assert.match(info, /419\.\d+ x 595\.\d+ pts/);
  assert.match(
    execFileSync("pdftotext", ["/tmp/billing-payment-a5.pdf", "-"], {
      encoding: "utf8",
    }),
    /changed@bank/,
  );
  await page.getByLabel("PDF / print paper size").selectOption("a4");
  await nav("Print");
  await expect(page.locator("iframe.print-frame")).toHaveCount(1);
  const a4 = await page.evaluate(async () => {
    const frame = document.querySelector("iframe.print-frame");
    const url = frame.src;
    frame.onload = null;
    frame.remove(); // Native printer UI is outside this headless regression test.
    return Array.from(new Uint8Array(await (await fetch(url)).arrayBuffer()));
  });
  fs.writeFileSync("/tmp/billing-payment-a4.pdf", Buffer.from(a4));
  assert.match(
    execFileSync("pdfinfo", ["/tmp/billing-payment-a4.pdf"], {
      encoding: "utf8",
    }),
    /595\.\d+ x 841\.\d+ pts/,
  );
  assert.match(
    execFileSync("pdftotext", ["/tmp/billing-payment-a4.pdf", "-"], {
      encoding: "utf8",
    }),
    /changed@bank/,
  );
  const printText = pdfText("/tmp/billing-payment-a4.pdf");
  for (const detail of [
    "Existing Buyer",
    "INV/2026/42",
    "13/10/2026",
    "Special Discount: ₹59.00",
    "Return Amount: ₹118.00",
    "Grand Total: ₹14,823.00",
  ])
    assert.ok(printText.includes(detail), `Missing print detail: ${detail}`);
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".app-shell")).toBeHidden();
  await expect(page.locator(".print-only")).toBeVisible();
  await expect(page.locator(".print-only")).toContainText("13/10/2026");
  await expect(page.locator(".print-only")).toContainText(
    "Buyer: Existing Buyer",
  );
  await page.emulateMedia({ media: "screen" });
  await expect(
    page.getByLabel("Special discount", { exact: true }),
  ).toHaveValue("59");
  await nav("Load Draft");
  await expect(
    page.getByLabel("Special discount", { exact: true }),
  ).toHaveValue("0");
  await expect(page.getByLabel("Return amount", { exact: true })).toHaveValue(
    "0",
  );
  const multipage = await page.evaluate(
    async ({ payment }) => {
      const { generatePDF } = await import("/src/utils/pdfGenerator.ts");
      const { newInvoice, defaultSeller } =
        await import("/src/utils/invoiceTypes.ts");
      const invoice = newInvoice();
      invoice.items = Array.from({ length: 100 }, (_, n) => ({
        id: String(n),
        name: "Product " + n,
        hsn: "1234",
        qty: 1,
        price: 100,
      }));
      const doc = await generatePDF(invoice, defaultSeller, payment);
      return Array.from(new Uint8Array(doc.output("arraybuffer")));
    },
    { payment },
  );
  fs.writeFileSync(
    "/tmp/billing-payment-multipage.pdf",
    Buffer.from(multipage),
  );
  assert.match(
    execFileSync("pdfinfo", ["/tmp/billing-payment-multipage.pdf"], {
      encoding: "utf8",
    }),
    /Pages:\s+[2-9]/,
  );
  assert.match(
    execFileSync("pdftotext", ["/tmp/billing-payment-multipage.pdf", "-"], {
      encoding: "utf8",
    }),
    /Product 99/,
  );
  // Extended invoice layout: long addresses, mixed tax, branding and both paper sizes.
  for (const format of ["a4", "a5"]) {
    const result = await page.evaluate(
      async ({ payment, image, format }) => {
        const { generatePDF } = await import("/src/utils/pdfGenerator.ts");
        const { newInvoice, defaultSeller } =
          await import("/src/utils/invoiceTypes.ts");
        const { invoiceQr, upiPaymentUri } =
          await import("/src/utils/paymentQr.ts");
        const i = {
          ...newInvoice(),
          number: "LONG-42",
          dueDate: "2026-11-01",
          receivedAmount: 100,
          taxJurisdiction: "inter",
          buyer: {
            name: "Long Address Buyer",
            address:
              "Floor 7, Block B, Industrial Estate, Near Central Market, Bengaluru, Karnataka 560062. ".repeat(
                4,
              ),
            mobile: "1234567890",
            gstin: "",
          },
        };
        i.shipTo = {
          ...i.buyer,
          name: "Shipping Warehouse",
          address: "Warehouse 42, Delivery Road. ".repeat(8),
        };
        i.items = Array.from({ length: 75 }, (_, n) => ({
          id: String(n),
          name: "Detailed Product " + n + " with long description and variant",
          hsn: "1234",
          qty: 1,
          price: 118,
          gstPercent: n % 2 ? 5 : 18,
        }));
        const settings = { ...payment, qrMode: "dynamic" };
        const qr = await invoiceQr(i, settings);
        const uri = upiPaymentUri(i, settings);
        const doc = await generatePDF(
          i,
          {
            ...defaultSeller,
            email: "accounts@example.test",
            logo: image,
            seal: image,
            signature: image,
          },
          settings,
          format,
        );
        return {
          pdf: Array.from(new Uint8Array(doc.output("arraybuffer"))),
          qr,
          uri,
          received: i.receivedAmount,
        };
      },
      { payment, image, format },
    );
    assert.equal(new URL(result.uri).searchParams.get("am"), "8750.00");
    assert.equal(result.received, 100);
    assert.match(result.qr, /^data:image\/png;base64,/);
    const path = `/tmp/billing-upgrade-${format}.pdf`;
    fs.writeFileSync(path, Buffer.from(result.pdf));
    const text = pdfText(path);
    for (const label of [
      "Shipping Warehouse",
      "Long Address Buyer",
      "Detailed Product 74",
      "IGST",
      "Received",
      "Balance",
      "01/11/2026",
      "accounts@example.test",
      "AUTHORISED SIGNATORY",
    ])
      assert.ok(text.includes(label), `Missing ${label} in ${format}`);
    assert.ok(!text.includes("CGST"));
  }
  await nav("Business settings");
  await page.getByLabel("Upload logo", { exact: true }).setInputFiles({
    name: "logo.png",
    mimeType: "image/png",
    buffer: Buffer.from(image.split(",")[1], "base64"),
  });
  await expect(page.getByAltText("Business logo preview")).toBeVisible();
  await page.getByLabel("Invoice QR mode").selectOption("dynamic");
  await nav("Create invoice");
  await page.getByLabel("Received amount", { exact: true }).fill("100");
  await page.getByLabel("Due date", { exact: true }).fill("2026-11-01");
  await page
    .getByLabel("Shipping address", { exact: true })
    .selectOption("separate");
  await page.getByLabel("Supply type").selectOption("inter");
  await nav("Preview");
  await expect(preview).toContainText("Ship To");
  await expect(preview).toContainText("IGST");
  await expect(preview.locator("canvas").first()).toBeVisible();
  await expect(preview).toContainText("Balance Amount");
  await page.keyboard.press("Escape");
  await page.getByLabel("Tax mode", { exact: true }).selectOption("non-gst");
  await nav("Preview");
  await expect(preview).toContainText("NON-GST");
  await expect(preview).not.toContainText("IGST");
  await page.keyboard.press("Escape");
  await nav("Business settings");
  await page.getByLabel("Invoice QR mode").selectOption("static");
  await nav("Remove logo");
  await expect(page.getByAltText("Business logo preview")).toHaveCount(0);
  await nav("Products");
  await expect(
    page.getByRole("heading", { name: "Product catalogue", exact: true }),
  ).toBeVisible();
  await nav("Buyers");
  await expect(page.getByText("Existing Buyer", { exact: true })).toBeVisible();
  await nav("Sales");
  await expect(
    page.getByRole("heading", { name: "Sales", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("SALE-PARTIAL", { exact: true })).toBeVisible();
  await page.getByLabel("Payment status").selectOption("Partial");
  await expect(page.getByText("SALE-UNKNOWN", { exact: true })).toHaveCount(0);
  await expect(page.getByText("SALE-PARTIAL", { exact: true })).toBeVisible();
  await expect(
    page.getByText("1 invoice(s) with payment data unavailable", {
      exact: false,
    }),
  ).toBeVisible();
  await nav("Clear filters");
  await expect(page.getByText("SALE-UNKNOWN", { exact: true })).toBeVisible();
  await nav("Business settings");
  await page.getByRole("switch").uncheck();
  await nav("Save Changes");
  await expect(
    page.getByRole("status").filter({ hasText: "saved successfully" }),
  ).toBeVisible();
  await nav("Create invoice");
  await nav("Preview");
  await expect(
    page.getByRole("dialog").locator(".invoice-preview"),
  ).toHaveAttribute("aria-busy", "false");
  await page.keyboard.press("Escape");
  await nav("Business settings");
  await nav("Remove QR Code");
  await nav("Save Changes");
  await expect(
    page.getByRole("status").filter({ hasText: "saved successfully" }),
  ).toBeVisible();
  assert.equal(writes.at(-1).removeQrCode, true);
  assert.equal(payment.qrCode, "");
  await page.reload();
  await nav("Business settings");
  await expect(page.getByText("No QR code uploaded")).toBeVisible();
  payment.qrCode = "data:image/png;base64,broken";
  await page.reload();
  await nav("Business settings");
  await expect(
    page.locator(".payment-settings").getByRole("alert"),
  ).toContainText("QR image unavailable");
  await page
    .locator(".payment-settings")
    .getByRole("button", { name: "Retry image" })
    .click();
  await expect(
    page.locator(".payment-settings").getByRole("alert"),
  ).toContainText("QR image unavailable");
  await upload(Buffer.from(image.split(",")[1], "base64"));
  await nav("Save Changes");
  await expect(
    page.getByRole("status").filter({ hasText: "saved successfully" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.screenshot({
    path: "/tmp/billing-payment-mobile.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: login/session, load/retry, image validation/preview, save/retry/readback, mismatch, persistence, UPI-only update, billing draft, invoice preview, A5 PDF, A4 print, QR visibility/removal, mobile layout. No live records mutated.",
  );
} finally {
  await browser?.close();
  await vite.close();
}
