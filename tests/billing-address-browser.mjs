import { chromium, expect as baseExpect } from "@playwright/test";
import { createServer } from "vite";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { newInvoice, defaultSeller } from "../src/utils/invoiceTypes.ts";
import { joinBuyerAddress } from "../src/utils/buyerAddress.ts";
const expect = baseExpect.configure({ timeout: 60000 });
const out = "/tmp/billing-address-review";
fs.mkdirSync(out, { recursive: true });
const parts = {
  area: "42 Main Road",
  pin: "560062",
  city: "Bengaluru",
  state: "Karnataka",
};
let buyers = [
  {
    id: "saved-buyer",
    name: "Saved Buyer",
    mobile: "9000000000",
    gstin: "",
    email: "",
    notes: "Preserve notes",
    active: true,
    address: joinBuyerAddress(parts),
    addressParts: parts,
  },
  {
    id: "legacy-buyer",
    name: "Legacy Buyer",
    mobile: "",
    gstin: "",
    email: "",
    notes: "",
    active: true,
    address: "Legacy address, Delhi 110001",
  },
];
const invoice = {
  ...newInvoice(),
  number: "ADDRESS-TEST",
  receivedAmount: 0,
  items: [
    { id: "item", name: "Test cabinet", hsn: "9403", qty: 1, price: 118 },
  ],
};
const vite = await createServer({
  cacheDir: "node_modules/.vite-address",
  define: {
    "import.meta.env.VITE_API_URL": JSON.stringify("http://address.test"),
  },
  server: { host: "127.0.0.1", port: 0, hmr: false, watch: null },
});
await vite.listen();
let browser;
try {
  browser = await chromium.launch({
    executablePath: "/usr/bin/google-chrome",
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
    acceptDownloads: true,
  });
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  let outage = true,
    saveFails = false,
    invoices = [];
  await page.route("http://address.test/api/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204 });
    const reply = (json, status = 200) => route.fulfill({ json, status });
    if (path === "/api/auth/me") return reply({ username: "test" });
    if (outage)
      return reply(
        { message: "MongoDB unavailable. Your local data has been preserved." },
        503,
      );
    if (path === "/api/business-profile")
      return reply({ ...defaultSeller, qrMode: "dynamic" });
    if (path === "/api/business-payment")
      return reply({
        upiId: "sample@bank",
        qrCode: "",
        payeeName: "Sample Shop",
        showQrOnInvoices: true,
      });
    if (path === "/api/products" || path === "/api/buyer-prices")
      return reply([]);
    if (path.startsWith("/api/buyers")) {
      if (req.method() === "GET") return reply(buyers);
      if (saveFails)
        return reply(
          {
            message: "MongoDB unavailable. Your local data has been preserved.",
          },
          503,
        );
      const buyer = req.postDataJSON();
      buyers = [...buyers.filter((b) => b.id !== buyer.id), buyer];
      return reply(buyer);
    }
    if (path.startsWith("/api/invoices")) {
      if (req.method() === "GET") return reply(invoices);
      const saved = { ...req.postDataJSON(), revision: 1 };
      invoices = [saved];
      return reply(saved);
    }
    throw Error(`Unexpected request ${req.method()} ${path}`);
  });
  await page.route("https://api.pincodeapi.in/api/v1/pincode/*", (route) =>
    route.fulfill({
      json: {
        success: true,
        data: {
          pincode: new URL(route.request().url()).pathname.split("/").at(-1),
          post_offices: [{ district: "Bengaluru Urban", state: "Karnataka" }],
        },
      },
    }),
  );
  await page.addInitScript((i) => {
    sessionStorage.setItem("billing-app:token", "test-session");
    if (!sessionStorage.getItem("seeded")) {
      localStorage.setItem("billing-app:working:v1", JSON.stringify(i));
      sessionStorage.setItem("seeded", "yes");
    }
  }, invoice);
  await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  const preview = page.getByRole("dialog");
  await expect(
    preview.getByRole("button", { name: "Retry business details" }),
  ).toBeVisible();
  await expect(preview.locator("canvas")).toHaveCount(0);
  outage = false;
  await preview.getByRole("button", { name: "Retry business details" }).click();
  await preview
    .getByRole("button", { name: "Retry loading", exact: true })
    .click();
  await expect(preview.locator(".invoice-preview")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await expect(preview.locator("canvas")).not.toHaveCount(0);
  await preview.getByLabel("Close dialog").click();
  await expect(page.getByLabel("Invoice number", { exact: true })).toHaveValue(
    "ADDRESS-TEST",
  );
  await page.getByRole("button", { name: "Retry connection" }).click();
  await page.getByLabel("Buyer", { exact: true }).selectOption("saved-buyer");
  await page.getByRole("button", { name: "Keep Current Prices" }).click();
  await expect(page.getByLabel("PIN Code", { exact: true })).toHaveValue(
    "560062",
  );
  await expect(
    page.getByLabel("Address / Street / Area", { exact: true }),
  ).toHaveValue("42 Main Road");
  await page.getByLabel("PIN Code", { exact: true }).fill("");
  await page.getByLabel("PIN Code", { exact: true }).pressSequentially("560063");
  await expect(page.getByLabel("City / District", { exact: true })).toHaveValue(
    "Bengaluru Urban",
  );
  await page
    .getByLabel("City / District", { exact: true })
    .fill("Manual District");
  await page
    .getByLabel("Address / Street / Area", { exact: true })
    .fill("43 Main Road\nSecond Floor");
  saveFails = true;
  await page.getByRole("button", { name: "Save Buyer", exact: true }).click();
  await expect(page.locator(".toast")).toContainText("MongoDB unavailable");
  await expect(
    page.getByLabel("Address / Street / Area", { exact: true }),
  ).toHaveValue("43 Main Road\nSecond Floor");
  saveFails = false;
  await page.getByRole("button", { name: "Save Buyer", exact: true }).click();
  await expect(page.locator(".toast")).toContainText(
    "Buyer billing details saved",
  );
  assert.equal(
    buyers.find((b) => b.id === "saved-buyer").notes,
    "Preserve notes",
  );
  await page.getByLabel("Buyer", { exact: true }).selectOption("legacy-buyer");
  await page.getByRole("button", { name: "Keep Current Prices" }).click();
  await expect(
    page.getByLabel("Address / Street / Area", { exact: true }),
  ).toHaveValue("Legacy address, Delhi 110001");
  await expect(page.getByLabel("PIN Code", { exact: true })).toHaveValue("");
  await page.getByLabel("Buyer", { exact: true }).selectOption("saved-buyer");
  await page.getByRole("button", { name: "Keep Current Prices" }).click();
  await expect(page.getByLabel("City / District", { exact: true })).toHaveValue(
    "Manual District",
  );
  await page
    .getByRole("button", { name: "Save to Sales as Draft", exact: true })
    .click();
  await expect(page.locator(".toast")).toContainText(
    "Invoice saved to MongoDB",
  );
  assert.match(
    invoices[0].buyer.address,
    /Second Floor\nCity \/ District: Manual District/,
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByLabel("PIN Code", { exact: true })).toHaveValue(
    "560063",
  );
  for (const format of ["a4", "a5"]) {
    await page.getByLabel("PDF / print paper size").selectOption(format);
    const downloaded = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download PDF", exact: true })
      .click();
    const path = `${out}/address-${format}.pdf`;
    await (await downloaded).saveAs(path);
    const text = execFileSync("pdftotext", [path, "-"], {
      encoding: "utf8",
    }).replace(/\s+/g, " ");
    for (const value of [
      "43 Main Road",
      "Second Floor",
      "Manual District",
      "Karnataka",
      "560063",
    ])
      assert.ok(text.includes(value), value);
  }
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(preview.locator(".invoice-preview")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await expect(
    preview.locator(".invoice-accessible-text").first(),
  ).toContainText("43 Main Road");
  await preview.getByLabel("Close dialog").click();
  await page.getByRole("button", { name: "Print", exact: true }).click();
  await expect(page.locator(".print-frame")).toHaveAttribute("src", /^blob:/);
  await page
    .getByRole("button", { name: "Add New Buyer", exact: true })
    .click();
  const modal = page.getByRole("dialog");
  await modal
    .getByLabel("Buyer Name", { exact: true })
    .fill("Save and New Buyer");
  await modal.getByRole("button", { name: "02 Address", exact: true }).click();
  await modal
    .getByLabel("Address / Street / Area", { exact: true })
    .fill("New Street");
  await modal.getByLabel("PIN Code", { exact: true }).fill("560062");
  await expect(modal.getByLabel("State", { exact: true })).toHaveValue(
    "Karnataka",
  );
  await modal.getByRole("button", { name: "Save & New", exact: true }).click();
  await expect(modal.getByLabel("Buyer Name", { exact: true })).toHaveValue("");
  await modal.getByRole("button", { name: "02 Address", exact: true }).click();
  await expect(modal.getByLabel("PIN Code", { exact: true })).toHaveValue("");
  assert.ok(
    buyers.some(
      (b) => b.name === "Save and New Buyer" && b.addressParts.pin === "560062",
    ),
  );
  await modal
    .getByRole("button", { name: "01 Basic Details", exact: true })
    .click();
  await modal
    .getByLabel("Buyer Name", { exact: true })
    .fill("Retain unsaved buyer");
  saveFails = true;
  await modal.getByRole("button", { name: "Save & New", exact: true }).click();
  await expect(modal.getByRole("alert")).toContainText("MongoDB unavailable");
  await expect(modal.getByLabel("Buyer Name", { exact: true })).toHaveValue(
    "Retain unsaved buyer",
  );
  await modal.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.screenshot({ path: `${out}/mobile.png`, fullPage: true });
  assert.deepEqual(errors, []);
  console.log(
    "PASS preview outage/retry, preserved local draft, buyer selection, PIN/manual edit, Save Buyer failure/success, invoice save/reload, A4/A5 downloads, print PDF, Save & New success/failure, mobile.",
  );
} finally {
  await browser?.close();
  await vite.close();
}
