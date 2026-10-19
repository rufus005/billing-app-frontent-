import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

// The allowlist contains build files only: never API responses or business data.
function offlineShell(): Plugin {
  return {
    name: "billing-offline-shell",
    apply: "build",
    generateBundle(_, bundle) {
      const publicFiles = [
        "manifest.webmanifest",
        "icons/app-192.png",
        "icons/app-512.png",
        "icons/maskable-512.png",
        "icons/apple-touch-icon.png",
        "fonts/InvoiceSans.ttf",
        "fonts/InvoiceSans-Bold.ttf",
        "images/authorised-signature.png",
      ];
      const files = [...Object.keys(bundle), ...publicFiles];
      const hash = createHash("sha256");
      for (const file of Object.values(bundle))
        hash.update(file.type === "chunk" ? file.code : file.source);
      for (const file of publicFiles)
        hash.update(readFileSync(new URL(`./public/${file}`, import.meta.url)));
      const version = hash.digest("hex").slice(0, 16);
      this.emitFile({
        type: "asset",
        fileName: "sw.js",
        source: `
const CACHE = "billing-shell-${version}";
const FILES = ${JSON.stringify(files.map((f) => "/" + f))};
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)));
});
// Do not skipWaiting or reload clients: unsaved edits must never be interrupted.
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith("billing-shell-") && key !== CACHE)
    .map(key => caches.delete(key)))));
});
self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin ||
      request.headers.has("authorization") || url.search) return;
  const path = request.mode === "navigate" && (url.pathname === "/" || url.pathname === "/index.html")
    ? "/index.html" : url.pathname;
  if (!FILES.includes(path)) return;
  event.respondWith(caches.open(CACHE).then(async cache =>
    (await cache.match(path)) || fetch(request)));
});
`,
      });
    },
  };
}
export default defineConfig({
  plugins: [react(), tailwindcss(), offlineShell()],
});
