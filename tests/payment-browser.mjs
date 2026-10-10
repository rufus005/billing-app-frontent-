import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { sampleProducts } from "../src/data/sampleProducts.ts";
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
    if (path === "/api/buyer-prices" || path === "/api/invoices")
      return reply([]);
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
  await nav("Save Draft");
  await nav("Preview");
  await expect(
    page.getByRole("dialog").getByText("UPI ID: changed@bank"),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog").getByAltText("Business UPI payment QR code"),
  ).toHaveCSS("object-fit", "contain");
  await page.screenshot({
    path: "/tmp/billing-payment-preview.png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  const download = page.waitForEvent("download");
  await nav("Download PDF");
  await (await download).saveAs("/tmp/billing-payment-a5.pdf");
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
  await nav("Business settings");
  await page.getByRole("switch").uncheck();
  await nav("Save Changes");
  await expect(
    page.getByRole("status").filter({ hasText: "saved successfully" }),
  ).toBeVisible();
  await nav("Create invoice");
  await nav("Preview");
  await expect(
    page.getByRole("dialog").getByAltText("Business UPI payment QR code"),
  ).toHaveCount(0);
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
