// Large browser snapshots belong in IndexedDB, not the small localStorage quota.
// Image bytes are stored once by digest; no assets or historical records are pruned.
const snapshots = new Map<string, string>();
let database: IDBDatabase | undefined;
let queue: Promise<unknown> = Promise.resolve();
const managed = (key: string) =>
  /^billing-app:(seller:v1|working:v1|draft:v1|archived-draft:.*)$/.test(key);
const request = <T>(r: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
const complete = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () =>
      reject(tx.error || new Error("Browser storage transaction aborted."));
    tx.onerror = () => reject(tx.error);
  });
export function snapshotRaw(key: string) {
  return snapshots.get(key) ?? localStorage.getItem(key);
}
export function snapshotKeys() {
  return [...new Set([...Object.keys(localStorage), ...snapshots.keys()])];
}
async function encode(
  value: unknown,
  assets: Map<string, string>,
): Promise<unknown> {
  if (typeof value === "string" && value.startsWith("data:image/")) {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(value),
    );
    const id = Array.from(new Uint8Array(digest), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    assets.set(id, value);
    return { __billingImage: id };
  }
  if (Array.isArray(value))
    return Promise.all(value.map((v) => encode(v, assets)));
  if (value && typeof value === "object")
    return Object.fromEntries(
      await Promise.all(
        Object.entries(value).map(async ([k, v]) => [
          k,
          await encode(v, assets),
        ]),
      ),
    );
  return value;
}
function decode(value: any, assets: Map<string, string>): any {
  if (
    value &&
    typeof value === "object" &&
    typeof value.__billingImage === "string"
  ) {
    const source = assets.get(value.__billingImage);
    if (!source)
      throw new Error(
        "A saved browser image is unavailable. Existing data was preserved.",
      );
    return source;
  }
  if (Array.isArray(value)) return value.map((v) => decode(v, assets));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, decode(v, assets)]),
    );
  return value;
}
export async function initializeSnapshots() {
  const open = indexedDB.open("billing-app-snapshots", 1);
  open.onupgradeneeded = () => {
    open.result.createObjectStore("records");
    open.result.createObjectStore("images");
  };
  database = await request(open);
  const tx = database.transaction(["records", "images"], "readonly");
  const records = tx.objectStore("records"),
    images = tx.objectStore("images");
  const [ks, vs, ids, sources] = await Promise.all([
    request(records.getAllKeys()),
    request(records.getAll()),
    request(images.getAllKeys()),
    request(images.getAll()),
  ]);
  const assets = new Map(
    ids.map((id, n) => [String(id), sources[n] as string]),
  );
  const loaded = ks.map(
    (key, n) => [String(key), JSON.stringify(decode(vs[n], assets))] as const,
  );
  loaded.forEach(([key, raw]) => snapshots.set(key, raw));
  // Migrate only after a durable write; local originals survive every failure.
  for (const key of Object.keys(localStorage).filter(managed)) {
    const raw = localStorage.getItem(key);
    if (raw !== null) await persistSnapshot(key, JSON.parse(raw));
  }
}
export function persistSnapshot(key: string, value: unknown): Promise<void> {
  const raw = JSON.stringify(value);
  const save = async () => {
    if (!database) {
      localStorage.setItem(key, raw);
      return;
    }
    const assets = new Map<string, string>();
    const encoded = await encode(JSON.parse(raw), assets);
    const tx = database.transaction(["records", "images"], "readwrite");
    const done = complete(tx);
    try {
      for (const [id, source] of assets)
        tx.objectStore("images").put(source, id);
      tx.objectStore("records").put(encoded, key);
    } catch (error) {
      tx.abort();
      await done.catch(() => {});
      throw error;
    }
    await done;
    snapshots.set(key, raw);
    // This is only the redundant localStorage copy, never the saved record.
    localStorage.removeItem(key);
  };
  const result = queue.then(save, save);
  queue = result.catch(() => {});
  return result;
}
export async function removeSnapshot(key: string) {
  await queue;
  if (database) {
    const tx = database.transaction("records", "readwrite");
    const done = complete(tx);
    tx.objectStore("records").delete(key);
    await done;
  }
  localStorage.removeItem(key);
  snapshots.delete(key);
}
export function storageFailure(error: unknown) {
  return error instanceof DOMException && error.name === "QuotaExceededError"
    ? "Browser storage quota exceeded. Existing data is preserved. Save to Sales or download a backup before closing this tab."
    : "Browser storage is unavailable. Existing data is preserved. Save to Sales or download a backup before closing this tab.";
}
export async function storageUsage() {
  const localBytes = Object.keys(localStorage).reduce(
    (n, key) => n + 2 * (key.length + (localStorage.getItem(key)?.length || 0)),
    0,
  );
  const estimate = await navigator.storage?.estimate();
  return { localBytes, usage: estimate?.usage, quota: estimate?.quota };
}
