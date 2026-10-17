import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import fs from "node:fs";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
const out = process.env.INVOICE_ARTIFACTS || "/tmp/billing-invoice-review";
fs.mkdirSync(out, { recursive: true });
const vite = await createServer({
  cacheDir: "node_modules/.vite-render",
  optimizeDeps: {
    include: ["react", "react-dom/client", "pdfjs-dist", "jsqr"],
  },
  plugins: [
    {
      name: "invoice-test-fixture",
      resolveId(id) {
        if (id === "/invoice-fixture") return id;
      },
      load(id) {
        if (id === "/invoice-fixture")
          return 'export {default as React} from "react"; export {createRoot} from "react-dom/client"; export * as pdfjs from "pdfjs-dist"; export {default as jsQR} from "jsqr";';
      },
    },
  ],
  server: { hmr: false, host: "127.0.0.1", port: 0, watch: null },
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
    viewport: { width: 1000, height: 1200 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route(
    `http://127.0.0.1:${vite.httpServer.address().port}/`,
    (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><html><head><link rel="stylesheet" href="/src/styles.css"></head><body></body></html>',
      }),
  );
  await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await page.evaluate(async () => {
    const { React, createRoot } = await import("/invoice-fixture");
    const { InvoicePreview } =
      await import("/src/components/InvoicePreview.tsx");
    document.body.innerHTML = '<div id="fixture"></div>';
    const root = createRoot(document.getElementById("fixture"));
    window.renderInvoice = (props) =>
      root.render(React.createElement(InvoicePreview, props));
  });
  const storageResult = await page.evaluate(async () => {
    const store = await import("/src/utils/browserSnapshots.ts");
    const legacy = {
      name: "Saved business",
      logo: "data:image/png;base64,UNCHANGED",
    };
    localStorage.setItem("billing-app:seller:v1", JSON.stringify(legacy));
    localStorage.setItem("billing-app:ledger:v2", "preserved-ledger");
    await store.initializeSnapshots();
    if (store.snapshotRaw("billing-app:seller:v1") !== JSON.stringify(legacy))
      throw Error("Migration changed seller");
    await store.persistSnapshot("billing-app:working:v1", {
      seller: legacy,
      payload: "x".repeat(6 * 1024 * 1024),
    });
    await store.persistSnapshot("billing-app:archived-draft:test", {
      seller: legacy,
    });
    const db = await new Promise((resolve, reject) => {
      const r = indexedDB.open("billing-app-snapshots", 1);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const count = await new Promise((resolve) => {
      const r = db.transaction("images").objectStore("images").count();
      r.onsuccess = () => resolve(r.result);
    });
    const originalPut = IDBObjectStore.prototype.put;
    localStorage.setItem(
      "billing-app:draft:v1",
      JSON.stringify({ preserve: true }),
    );
    IDBObjectStore.prototype.put = () => {
      throw new DOMException("Full", "QuotaExceededError");
    };
    let failed = false;
    try {
      await store.persistSnapshot("billing-app:draft:v1", {
        replacement: true,
      });
    } catch {
      failed = true;
    } finally {
      IDBObjectStore.prototype.put = originalPut;
    }
    if (
      !failed ||
      localStorage.getItem("billing-app:draft:v1") !== '{"preserve":true}'
    )
      throw Error("Failed write destroyed original");
    return {
      count,
      ledger: localStorage.getItem("billing-app:ledger:v2"),
      localSeller: localStorage.getItem("billing-app:seller:v1"),
      usage: await store.storageUsage(),
    };
  });
  assert.equal(
    storageResult.count,
    1,
    "Duplicate image bytes must be stored once",
  );
  assert.equal(storageResult.ledger, "preserved-ledger");
  assert.equal(
    storageResult.localSeller,
    null,
    "Only redundant migrated copy is removed",
  );
  await page.evaluate(async () => {
    const store = await import("/src/utils/browserSnapshots.ts?reload-test");
    await store.initializeSnapshots();
    const restored = JSON.parse(store.snapshotRaw("billing-app:working:v1"));
    if (
      restored.payload.length !== 6 * 1024 * 1024 ||
      restored.seller.logo !== "data:image/png;base64,UNCHANGED"
    )
      throw Error("Large snapshot/image did not survive reload");
  });
  console.log(
    "PASS real browser storage: migration, 6 MB snapshot, image deduplication, reload, failed-write preservation",
    storageResult.usage,
  );
  for (const format of ["a4", "a5"])
    for (const scenario of [
      "reference",
      "branding",
      "partial",
      "zero",
      "paid",
      "non-gst",
      "long",
      "multiple",
      "multipage",
    ].filter(
      (scenario) =>
        !process.env.INVOICE_SCENARIO ||
        scenario === process.env.INVOICE_SCENARIO,
    )) {
      const result = await page.evaluate(
        async ({ format, scenario }) => {
          const { newInvoice, defaultSeller } =
            await import("/src/utils/invoiceTypes.ts");
          const { generatePDF } = await import("/src/utils/pdfGenerator.ts");
          const { invoiceQr } = await import("/src/utils/paymentQr.ts");
          const { calculate } = await import("/src/utils/calculations.ts");
          const { paymentSummary } =
            await import("/src/utils/invoicePresentation.ts");
          const { jsQR } = await import("/invoice-fixture");
          const i = {
            ...newInvoice(),
            id: "sample-18000",
            number: "INV/2026/42",
            date: "2026-10-15",
            receivedAmount:
              scenario === "paid" ? 18000 : scenario === "zero" ? 0 : 5000,
            taxMode: scenario === "non-gst" ? "non-gst" : "gst",
            buyer: {
              name: "Sample Buyer",
              address: "Bengaluru, Karnataka",
              gstin: "29ABCDE1234F1Z5",
              mobile: "9000000000",
            },
          };
          const count =
            scenario === "multipage" ? 75 : scenario === "multiple" ? 8 : 1;
          i.items = Array.from({ length: count }, (_, n) => ({
            id: String(n),
            name:
              count === 1
                ? "Storage cabinet"
                : `Product ${n + 1} — storage cabinet with adjustable shelves`,
            hsn: "940320",
            qty: 1,
            price: 18000 / count,
            gstPercent: 18,
          }));
          if (scenario === "long") {
            i.buyer.address =
              "Floor 7, Block B, Industrial Estate, Near Central Market, Bengaluru, Karnataka 560062. ".repeat(
                4,
              );
            i.shipTo = {
              ...i.buyer,
              name: "Shipping Warehouse",
              address: "Warehouse 42, Delivery Road, Karnataka. ".repeat(7),
            };
            i.items[0].name =
              "Storage cabinet with a very long description, adjustable shelves, grey powder coated finish and additional accessories";
          }
          const payment = {
            upiId: "sample@bank",
            payeeName: "Sample & Sons",
            qrMode: "dynamic",
            qrCode: "",
          };
          const source = await invoiceQr(i, payment);
          let decoded = null;
          if (source) {
            const img = new Image();
            img.src = source;
            await img.decode();
            const canvas = document.createElement("canvas");
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0);
            decoded = jsQR(
              ctx.getImageData(0, 0, img.width, img.height).data,
              img.width,
              img.height,
            )?.data;
          }
          const seller = { ...defaultSeller };
          if (scenario === "branding" || scenario === "reference") {
            const canvas = document.createElement("canvas");
            canvas.width = 240;
            canvas.height = 180;
            const ctx = canvas.getContext("2d");
            ctx.fillStyle = "#39317a";
            ctx.fillRect(0, 0, 240, 180);
            ctx.fillStyle = "white";
            ctx.font = "bold 36px sans-serif";
            ctx.fillText("LOGO", 62, 100);
            const { invoiceSeller } =
              await import("/src/utils/invoicePresentation.ts");
            i.seller = { ...defaultSeller };
            Object.assign(
              seller,
              invoiceSeller(i, { ...defaultSeller, logo: canvas.toDataURL() }),
            );
            if (!seller.logo)
              throw Error("Legacy invoice lost the saved business logo");
            seller.pan = "ABCDE1234F";
            seller.email = "accounts@example.test";
            seller.website = "https://example.test";
            seller.branch = "KONANAKUNTE, BANGALORE — Business Banking Branch";
            payment.payeeName =
              "A long uploaded static QR payee name for layout verification";
            payment.upiId = "long.existing.payment.identifier@bank";
            payment.qrCode = source;
            payment.qrMode = "static";
          }
          if (scenario === "reference") {
            Object.assign(seller, {
              name: "DYNAMIC UNIVERSAL MARKETING",
              address:
                "NO .13 , Ground floor,Subbaraju Layout , Near Gokula Nandana Residency , doddakallasandra , Kanakapura Main Road , Bengaluru, Karnataka, 560062",
              pan: "AKFPU1710L",
              email: "marketingdynamic81@gmail.com",
              website: "https://www.dynamicshoerack.in/",
              bank: "Axis Bank",
              branch: "KONANAKUNTE",
            });
            Object.assign(i, {
              number: "3227",
              date: "2026-09-26",
              time: "",
              buyer: {
                name: "SRI KRISHNA",
                address: "BOMMASANDRA JIGANI, Bangalore, Karnataka, 560099",
                mobile: "9845336660",
                gstin: "",
              },
              shipTo: {
                name: "SRI KRISHNA",
                address: "BOMMASANDRA, Bangalore, Karnataka, 560099",
                mobile: "",
                gstin: "",
              },
            });
            i.items[0].name = "J4 SHOE RACK";
            i.items[0].color = "BROWN";
            i.items[0].hsn = "7323";
            payment.payeeName = "";
            payment.upiId = "sample@bank";
          }
          const doc = await generatePDF(i, seller, payment, format);
          window.renderInvoice({
            invoice: i,
            seller,
            payment,
            format,
          });
          return {
            pdf: Array.from(new Uint8Array(doc.output("arraybuffer"))),
            decoded,
            totals: calculate(i),
            summary: paymentSummary(i),
            pages: doc.getNumberOfPages(),
          };
        },
        { format, scenario },
      );
      await expect(page.locator(".invoice-preview")).toHaveAttribute(
        "aria-busy",
        "false",
        { timeout: 60000 },
      );
      await expect(page.locator('[role="alert"]')).toHaveCount(0);
      assert.equal(result.totals.grand, 18000);
      const balance =
        scenario === "paid" ? 0 : scenario === "zero" ? 18000 : 13000;
      assert.equal(result.summary.balance, balance);
      if (balance) {
        const params = new URL(result.decoded).searchParams;
        assert.equal(params.get("pa"), "sample@bank");
        assert.equal(params.get("pn"), "Sample & Sons");
        assert.equal(params.get("am"), balance.toFixed(2));
        assert.equal(params.get("cu"), "INR");
        assert.equal(params.get("tr"), "sample-18000");
        assert.equal(params.get("tn"), "Invoice INV/2026/42");
      } else assert.equal(result.decoded, null);
      const path = `${out}/${scenario}-${format}`;
      fs.writeFileSync(path + ".pdf", Buffer.from(result.pdf));
      await page
        .locator(".invoice-paper")
        .screenshot({ path: path + "-preview.png" });
      // Compare every preview pixel against rendering the separately generated download.
      const verified = await page.evaluate(async (bytes) => {
        const { pdfjs } = await import("/invoice-fixture");
        const { jsQR } = await import("/invoice-fixture");
        const task = pdfjs.getDocument({ data: new Uint8Array(bytes) });
        const pdf = await task.promise;
        const canvases = [
          ...document.querySelectorAll(".invoice-pdf-page canvas"),
        ];
        let equal = canvases.length === pdf.numPages;
        let pdfQr = null;
        let clipped = [];
        for (let n = 1; n <= pdf.numPages; n++) {
          const p = await pdf.getPage(n),
            viewport = p.getViewport({ scale: 2 });
          const c = document.createElement("canvas");
          c.width = Math.ceil(viewport.width);
          c.height = Math.ceil(viewport.height);
          await p.render({ canvas: c, viewport }).promise;
          equal &&= c.toDataURL() === canvases[n - 1].toDataURL();
          const rgba = c
            .getContext("2d")
            .getImageData(0, 0, c.width, c.height).data;
          pdfQr ||= jsQR(rgba, c.width, c.height)?.data;
          const text = await p.getTextContent();
          if (pdf.numPages === 1 && p.view[3] > 800) {
            const signature = text.items.find(
              (item) => item.str === "AUTHORISED SIGNATORY FOR",
            );
            if (!signature || signature.transform[5] < 100)
              throw Error(
                "Signature must follow the summary, not sit at the page edge",
              );
            const upi = text.items.find((item) => item.str === "UPI ID:");
            if (upi && upi.transform[4] > p.view[2] / 2)
              throw Error("UPI details must stay in the left bank column");
          }
          for (const item of text.items)
            if ("str" in item && item.str.trim()) {
              const x = item.transform[4],
                y = item.transform[5];
              if (
                x < 15 ||
                x + item.width > p.view[2] - 15 ||
                y < 7 ||
                y > p.view[3] - 10
              )
                clipped.push(item.str);
            }
        }
        await task.destroy();
        return { equal, pdfQr, clipped };
      }, result.pdf);
      assert.equal(
        verified.equal,
        true,
        `${scenario} ${format}: preview/download pixels differ`,
      );
      assert.deepEqual(
        verified.clipped,
        [],
        `${scenario} ${format}: text outside margins`,
      );
      assert.equal(
        verified.pdfQr || null,
        result.decoded,
        `${scenario} ${format}: QR in PDF must decode`,
      );
      const text = execFileSync("pdftotext", [path + ".pdf", "-"], {
        encoding: "utf8",
      }).replace(/\s+/g, " ");
      assert.match(
        text,
        /AUTHORISED SIGNATORY FOR DYNAMIC UNIVERSAL MARK(?:E)?TING/,
      );
      assert.doesNotMatch(text, /Special Discount|Return Amount/);
      assert.match(text, /Rupees Eighteen Thousand Only/);
      if (scenario === "non-gst") {
        assert.equal(result.totals.tax, 0);
        assert.doesNotMatch(text, /CGST|SGST|IGST/);
      }
      if (scenario === "multipage") {
        assert.ok(result.pages > 1);
        assert.match(text, /Product 75/);
      }
      console.log(
        `PASS ${scenario} ${format}: ${result.pages} page(s), exact preview/PDF pixels, decoded QR, totals, text margins`,
      );
    }
  assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  await vite.close();
}
