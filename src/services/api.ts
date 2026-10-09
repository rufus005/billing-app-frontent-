import type {
  Product,
  BuyerRecord,
  BuyerPrice,
  Invoice,
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
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(
      `${apiBaseUrl}/api${path}`,
      {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(session.get()
            ? { Authorization: `Bearer ${session.get()}` }
            : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
    );
  } catch {
    throw Error("Server unavailable. Check that the backend is running.");
  }
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && path != "/auth/login") {
      session.clear();
      window.dispatchEvent(new Event("billing-logout"));
    }
    throw Error(data.message || "Request failed.");
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
