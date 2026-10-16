import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import fs from "node:fs";
const vite = await createServer({
  server: { host: "127.0.0.1", port: 0, watch: null },
  define: {
    "import.meta.env.VITE_API_URL": JSON.stringify("http://billing.test"),
  },
});
await vite.listen();
const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  args: ["--no-sandbox"],
});
const results = [];
try {
  for (let run = 0; run < 3; run++) {
    const page = await browser.newPage();
    const requests = [];
    await page.route("http://billing.test/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      requests.push(path);
      await new Promise((r) => setTimeout(r, 80));
      const data = path.endsWith("/auth/login")
        ? { token: "fixture" }
        : path.endsWith("/business-profile")
          ? null
          : path.endsWith("/business-payment")
            ? { upiId: "", qrCode: "", payeeName: "", showQrOnInvoices: true }
            : [];
      await route.fulfill({ json: data });
    });
    const start = performance.now();
    await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}`);
    await page.getByLabel("Username").fill("fixture");
    await page.getByLabel("Password").fill("fixture");
    const login = performance.now();
    await page.getByRole("button", { name: "Log in", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Create invoice" }),
    ).toBeVisible();
    const loginMs = performance.now() - login;
    await page.waitForTimeout(1200);
    const navigation = {};
    for (const name of [
      "Dashboard",
      "Sales",
      "Buyers",
      "Products",
      "Business settings",
      "Create invoice",
    ]) {
      const t = performance.now();
      await page
        .locator(".sidebar")
        .getByRole("button", { name, exact: true })
        .click();
      await page.waitForTimeout(100);
      navigation[name] = Math.round(performance.now() - t);
    }
    results.push({
      loginMs: Math.round(loginMs),
      totalMs: Math.round(performance.now() - start),
      requests,
      hiddenPdfCanvases: await page.locator(".print-only canvas").count(),
      navigation,
      resources: await page.evaluate(() =>
        performance
          .getEntriesByType("resource")
          .filter((r) => /pdf|font/i.test(r.name))
          .map((r) => r.name),
      ),
    });
    await page.close();
  }
  console.log(JSON.stringify(results, null, 2));
  if (process.env.PERF_OUTPUT)
    fs.writeFileSync(process.env.PERF_OUTPUT, JSON.stringify(results, null, 2));
} finally {
  await browser.close();
  await vite.close();
}
