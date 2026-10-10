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
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
  timeoutMs?: number,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/api${path}`, {
      method,
      signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
      headers: {
        "Content-Type": "application/json",
        ...(session.get() ? { Authorization: `Bearer ${session.get()}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError")
      throw Error("The server took too long to respond. Please retry.");
    throw Error("Server unavailable. Check that the backend is running.");
  }
  if (response.status === 401 && path !== "/auth/login") {
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
export const invoiceApi = resource<Invoice>("/invoices");
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
