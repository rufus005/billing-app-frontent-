import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, businessPaymentApi } from "../src/services/api";
import { containImage, readQrImage } from "../src/utils/paymentImage";

beforeEach(() => {
  vi.stubGlobal("sessionStorage", {
    getItem: vi.fn(() => "token"),
    removeItem: vi.fn(),
  });
  vi.stubGlobal("window", { dispatchEvent: vi.fn() });
});
afterEach(() => vi.unstubAllGlobals());

describe("payment API contract", () => {
  it("loads all settings and sends authenticated updates without clearing an unchanged QR", async () => {
    const value = {
      upiId: "shop@bank",
      qrCode: "image",
      payeeName: "Shop",
      showQrOnInvoices: true,
    };
    const fetch = vi
      .fn()
      .mockImplementation(async () => new Response(JSON.stringify(value)));
    vi.stubGlobal("fetch", fetch);
    expect(await businessPaymentApi.get()).toEqual(value);
    await businessPaymentApi.save({ upiId: "new@bank", removeQrCode: false });
    expect(fetch.mock.calls[1][1].headers.Authorization).toBe("Bearer token");
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({
      upiId: "new@bank",
      removeQrCode: false,
    });
  });
  it("rejects legacy/malformed responses instead of claiming settings are saved", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response('{"upiId":"","qrCode":""}')),
    );
    await expect(businessPaymentApi.get()).rejects.toThrow(
      "Backend API mismatch",
    );
  });
  it("reports HTML errors and still expires unauthorized sessions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("Unauthorized", { status: 401 })),
    );
    await expect(businessPaymentApi.get()).rejects.toThrow("HTTP 401");
    expect(sessionStorage.removeItem).toHaveBeenCalled();
    expect(window.dispatchEvent).toHaveBeenCalled();
  });
  it("keeps login rejection from dispatching a logout event", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response('{"message":"Invalid credentials"}', { status: 401 }),
        ),
    );
    await expect(api("/auth/login", "POST", {})).rejects.toThrow(
      "Invalid credentials",
    );
    expect(window.dispatchEvent).not.toHaveBeenCalled();
  });
  it("reports timeout as retryable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("timeout", "TimeoutError")),
    );
    await expect(businessPaymentApi.get()).rejects.toThrow("Please retry");
  });
});
describe("QR image validation and aspect ratio", () => {
  it("rejects unsupported, empty, oversized and mislabeled images", async () => {
    await expect(
      readQrImage(new File(["x"], "qr.svg", { type: "image/svg+xml" })),
    ).rejects.toThrow("PNG, JPG or WebP");
    await expect(
      readQrImage(new File([], "qr.png", { type: "image/png" })),
    ).rejects.toThrow("non-empty");
    await expect(
      readQrImage(
        new File([new Uint8Array(3 * 1024 * 1024 + 1)], "qr.png", {
          type: "image/png",
        }),
      ),
    ).rejects.toThrow("3 MB");
    await expect(
      readQrImage(new File(["not an image"], "qr.png", { type: "image/png" })),
    ).rejects.toThrow("does not match");
  });
  it("fits square, landscape and portrait images without stretching", () => {
    expect(containImage(120, 120, 27)).toEqual({ width: 27, height: 27 });
    expect(containImage(240, 120, 27)).toEqual({ width: 27, height: 13.5 });
    expect(containImage(120, 240, 27)).toEqual({ width: 13.5, height: 27 });
  });
});

// An uploaded original remains authoritative unless dynamic mode is explicit.
it("preserves an uploaded static QR when mode is unset", async () => {
  const { invoiceQr } = await import("../src/utils/paymentQr");
  const { newInvoice } = await import("../src/utils/invoiceTypes");
  expect(
    await invoiceQr(newInvoice(), {
      upiId: "sample@bank",
      payeeName: "Sample",
      qrCode: "data:image/png;base64,original",
    }),
  ).toBe("data:image/png;base64,original");
});

it("coalesces concurrent reads but fetches again after completion", async () => {
  const fetch = vi.fn().mockImplementation(async () => new Response("[]"));
  vi.stubGlobal("fetch", fetch);
  await Promise.all([api("/products"), api("/products")]);
  expect(fetch).toHaveBeenCalledTimes(1);
  await api("/products");
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("does not expire a newer session when an older request returns 401", async () => {
  let resolve!: (response: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise<Response>((r) => {
          resolve = r;
        }),
    ),
  );
  const pending = api("/products");
  vi.mocked(sessionStorage.getItem).mockReturnValue("new-token");
  resolve(new Response('{"message":"Expired"}', { status: 401 }));
  await expect(pending).rejects.toThrow("Expired");
  expect(sessionStorage.removeItem).not.toHaveBeenCalled();
});
