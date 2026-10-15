import { useState } from "react";
import type { Seller } from "../utils/invoiceTypes";
import { readQrImage } from "../utils/paymentImage";

export function BusinessAssets({
  seller,
  onChange,
}: {
  seller: Seller;
  onChange: (s: Seller) => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section className="card">
      <h2>Branding & authorisation</h2>
      <p>
        Saved on this device with your seller details. PNG, JPG or WebP, up to 3
        MB each.
      </p>
      {error && <p role="alert">{error}</p>}
      <div className="form-grid">
        {(["logo", "signature", "seal"] as const).map((key) => (
          <div key={key}>
            {seller[key] && (
              <img
                className="business-asset"
                src={seller[key]}
                alt={`Business ${key} preview`}
              />
            )}
            <label className="field">
              {seller[key] ? "Replace" : "Upload"} {key}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={busy}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  setBusy(true);
                  setError("");
                  try {
                    const data = await readQrImage(file);
                    onChange({ ...seller, [key]: data });
                  } catch (e) {
                    setError(
                      (e as Error).message.replaceAll("QR image", "Image"),
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </label>
            {seller[key] && (
              <button
                disabled={busy}
                onClick={() => onChange({ ...seller, [key]: "" })}
              >
                Remove {key}
              </button>
            )}
          </div>
        ))}
      </div>
      <label className="field">
        Invoice QR mode
        <select
          value={seller.qrMode || "static"}
          onChange={(e) =>
            onChange({
              ...seller,
              qrMode: e.target.value as "static" | "dynamic",
            })
          }
        >
          <option value="static">Uploaded Static QR</option>
          <option value="dynamic">Dynamic Amount QR</option>
        </select>
      </label>
      <p>
        Dynamic QR uses the recorded balance. Scanning never records a payment.
      </p>
    </section>
  );
}
