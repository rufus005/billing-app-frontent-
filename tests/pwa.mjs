import { chromium, expect } from "@playwright/test";
import { preview } from "vite";
import assert from "node:assert/strict";
const server = await preview({
  preview: { host: "127.0.0.1", port: 4187, strictPort: true },
});
const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  args: ["--no-sandbox"],
});
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  let offline = false;
  await context.route("**/api/**", (route) => {
    if (offline) return route.abort("internetdisconnected");
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({
      json: path.endsWith("/auth/login")
        ? { token: "pwa-test" }
        : path.endsWith("/auth/me")
          ? { username: "fixture" }
          : path.endsWith("/business-profile")
            ? null
            : path.endsWith("/business-payment")
              ? { upiId: "", qrCode: "", payeeName: "", showQrOnInvoices: true }
              : [],
    });
  });
  await page.goto("http://127.0.0.1:4187");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  const manifest = await (
    await page.request.get("http://127.0.0.1:4187/manifest.webmanifest")
  ).json();
  assert.equal(manifest.display, "standalone");
  for (const icon of manifest.icons) {
    const response = await page.request.get(`http://127.0.0.1:4187${icon.src}`);
    assert.equal(response.status(), 200);
    assert.match(response.headers()["content-type"], /image\/png/);
  }
  await page.getByLabel("Username").fill("fixture");
  await page.getByLabel("Password").fill("fixture");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Create invoice" }),
  ).toBeVisible();
  await page
    .getByLabel("Buyer name", { exact: true })
    .fill("Draft must survive");
  await page.waitForTimeout(700);
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "Products", exact: true })
    .click();
  const start = performance.now();
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "Create invoice", exact: true })
    .click();
  await expect(page.getByLabel("Buyer name", { exact: true })).toHaveValue(
    "Draft must survive",
  );
  console.log(
    "Create Invoice resume ms:",
    Math.round(performance.now() - start),
  );
  await page.reload();
  await expect(page.getByLabel("Buyer name", { exact: true })).toHaveValue(
    "Draft must survive",
  );
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    console.log('Layout', width, await page.evaluate(() => [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1).slice(0, 15).map(e => [e.tagName, e.className, Math.round(e.getBoundingClientRect().right)])));
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
      `Overflow at ${width}px`,
    );
    await page.screenshot({
      path: `/tmp/billing-pwa-${width}.png`,
      fullPage: true,
    });
  }
  // Exercise the app's install action without installing an OS-level application.
  await page.evaluate(() => {
    const event = new Event("beforeinstallprompt", { cancelable: true });
    event.prompt = async () => {
      window.installCalled = true;
    };
    event.userChoice = Promise.resolve({ outcome: "dismissed" });
    dispatchEvent(event);
  });
  await page.getByRole("button", { name: "Install App", exact: true }).click();
  assert.equal(await page.evaluate(() => window.installCalled), true);
  const cdp = await context.newCDPSession(page);
  const installability = await cdp.send("Page.getInstallabilityErrors");
  assert.deepEqual(installability.installabilityErrors, []);
  const cacheUrls = await page.evaluate(async () => {
    const names = await caches.keys();
    return (
      await Promise.all(
        names.map(async (name) =>
          (await (await caches.open(name)).keys()).map((r) => r.url),
        ),
      )
    ).flat();
  });
  assert.ok(cacheUrls.some((url) => url.endsWith("/index.html")));
  assert.ok(cacheUrls.every((url) => !url.includes("/api/")));
  offline = true;
  await context.setOffline(true);
  await expect(page.getByText(/You’re offline/)).toBeVisible();
  await page
    .getByLabel("Buyer name", { exact: true })
    .fill("Offline draft preserved");
  await page.waitForTimeout(700);
  await page.reload();
  await expect(page.getByLabel("Username")).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(
    "Unable to reach the server",
  );
  offline = false;
  await context.setOffline(false);
  await page.reload();
  await expect(page.getByLabel("Buyer name", { exact: true })).toHaveValue(
    "Offline draft preserved",
  );
  const ios = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
    viewport: { width: 390, height: 844 },
  });
  const iphone = await ios.newPage();
  await iphone.goto("http://127.0.0.1:4187");
  await iphone
    .getByRole("button", { name: "Install App", exact: true })
    .click();
  await expect(
    iphone.getByText(/tap Share, then Add to Home Screen/),
  ).toBeVisible();
  assert.deepEqual(errors, []);
  console.log(
    "PASS production PWA: installability, icons, install action, iPhone guidance, static-only cache, offline shell, draft recovery, navigation and responsive widths",
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
