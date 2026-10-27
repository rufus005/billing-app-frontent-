import type {
  Product,
  BuyerRecord,
  BuyerPrice,
  Invoice,
  BusinessPaymentSettings,
} from "../utils/invoiceTypes";
const tokenKey = "billing-app:token";
const apiBaseUrl = (import.meta.env.VITE_API_URL || "http://localhost:5000")
  .trim()
  .replace(/\/+$/, "");
export const session = {
  get: () => sessionStorage.getItem(tokenKey),
  set: (token: string) => sessionStorage.setItem(tokenKey, token),
  clear: () => sessionStorage.removeItem(tokenKey),
};
const pending = new Map<string, Promise<unknown>>();
export function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
  timeoutMs = 20000,
): Promise<T> {
  // Only coalesce concurrent reads, scoped to the current credentials. Never cache results.
  const key = JSON.stringify([session.get(), path, timeoutMs]);
  if (method !== "GET") {
    pending.clear();
    return request<T>(path, method, body, timeoutMs);
  }
  const existing = pending.get(key);
  if (existing) return existing as Promise<T>;
  const promise = request<T>(path, method, body, timeoutMs).finally(() => {
    if (pending.get(key) === promise) pending.delete(key);
  });
  pending.set(key, promise);
  return promise;
}
async function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
  timeoutMs?: number,
): Promise<T> {
  const token = session.get();
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/api${path}`, {
      method,
      cache: "no-store",
      signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError")
      throw Error("The server took too long to respond. Please retry.");
    throw Error("Unable to reach the server. Check your connection and retry. Your local draft is preserved.");
  }
  if (
    response.status === 401 &&
    path !== "/auth/login" &&
    session.get() === token
  ) {
    session.clear();
    window.dispatchEvent(new Event("billing-logout"));
  }
  const data = await response.json().catch(() => {
    throw Error(
      `The server returned an unreadable response (HTTP ${response.status}). Please retry.`,
    );
  });
  if (!response.ok) {
    throw Error(
      data?.message ||
        `Request failed (HTTP ${response.status}). Please retry.`,
    );
  }
  return data;
}
function resource<T extends { id: string }>(path: string) {
  return {
    list: (query = "") => api<T[]>(path + query),
    save: (value: T, exists: boolean) =>
      api<T>(
        path + (exists ? "/" + encodeURIComponent(value.id) : ""),
        exists ? "PUT" : "POST",
        value,
      ),
    remove: (value: T) =>
      api(path + "/" + encodeURIComponent(value.id), "DELETE", value),
  };
}
export const productApi = resource<Product>("/products");
export const buyerApi = resource<BuyerRecord>("/buyers");
export const buyerPriceApi = resource<BuyerPrice>("/buyer-prices");
const invoices = resource<Invoice>("/invoices");
export const invoiceApi = {
  ...invoices,
  convert: (quotation: Invoice) =>
    api<Invoice>(
      `/invoices/${encodeURIComponent(quotation.id)}/convert`,
      "POST",
      quotation,
    ),
};
export const businessPaymentApi = {
  get: () =>
    api<unknown>("/business-payment", "GET", undefined, 20000).then(
      parsePaymentSettings,
    ),
  save: (
    value: Partial<BusinessPaymentSettings> & { removeQrCode?: boolean },
  ) => api<unknown>("/business-payment", "PUT", value, 20000),
};

function parsePaymentSettings(value: unknown): BusinessPaymentSettings {
  const data = value as BusinessPaymentSettings | null;
  if (
    !data ||
    typeof data.upiId !== "string" ||
    typeof data.qrCode !== "string" ||
    typeof data.payeeName !== "string" ||
    typeof data.showQrOnInvoices !== "boolean"
  ) {
    throw new Error(
      "Backend API mismatch: business-payment must return upiId, qrCode, payeeName and showQrOnInvoices. Please retry after the API is updated.",
    );
  }
  return data;
}

export const businessProfileApi = {
  get: () =>
    api<import("../utils/invoiceTypes").Seller | null>("/business-profile"),
  save: (seller: import("../utils/invoiceTypes").Seller) =>
    api<import("../utils/invoiceTypes").Seller>("/business-profile", "PUT", {
      ...seller,
      qrMode: seller.qrMode ?? null,
    }),
};
export const recordPayment = (
  id: string,
  payment: import("../utils/invoiceTypes").PaymentRecord,
) =>
  api<Invoice>(
    "/invoices/" + encodeURIComponent(id) + "/payments",
    "POST",
    payment,
  );
