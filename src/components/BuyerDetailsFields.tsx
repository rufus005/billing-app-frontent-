import { useEffect, useRef, useState } from "react";
import type { BuyerRecord } from "../utils/invoiceTypes";
import {
  joinBuyerAddress,
  splitBuyerAddress,
  lookupPin,
  type AddressParts,
} from "../utils/buyerAddress";
export function BuyerDetailsFields({
  buyer,
  onChange,
}: {
  buyer: BuyerRecord;
  onChange: (b: BuyerRecord) => void;
}) {
  const [section, setSection] = useState("Basic Details");
  const [parts, setParts] = useState(
    () => buyer.addressParts || splitBuyerAddress(buyer.address),
  );
  const [lookup, setLookup] = useState("");
  const [requestedPin, setRequestedPin] = useState("");
  const latest = useRef({ buyer, onChange, parts });
  latest.current = { buyer, onChange, parts };
  const edits = useRef({ city: 0, state: 0 });
  function update(key: keyof AddressParts, value: string) {
    if (key === "city" || key === "state") edits.current[key]++;
    const next = { ...parts, [key]: value };
    setParts(next);
    onChange({ ...buyer, address: joinBuyerAddress(next), addressParts: next });
    if (key === "pin") {
      setRequestedPin(value);
      setLookup("");
    }
  }
  useEffect(() => {
    if (!/^[1-9]\d{5}$/.test(requestedPin)) return;
    const controller = new AbortController();
    const revision = { ...edits.current };
    let active = true;
    let timeout: ReturnType<typeof setTimeout>;
    const timer = setTimeout(async () => {
      setLookup("Looking up PIN Code…");
      timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const place = await lookupPin(requestedPin, controller.signal);
        if (!active) return;
        const current = latest.current;
        const next = {
          ...current.parts,
          city:
            edits.current.city === revision.city
              ? place.city
              : current.parts.city,
          state:
            edits.current.state === revision.state
              ? place.state
              : current.parts.state,
        };
        setParts(next);
        current.onChange({
          ...current.buyer,
          address: joinBuyerAddress(next),
          addressParts: next,
        });
        setLookup("Location found. You can edit City / District and State.");
      } catch (e) {
        if (active)
          setLookup(
            controller.signal.aborted
              ? "PIN lookup timed out. Enter City / District and State manually."
              : (e as Error).message,
          );
      } finally {
        clearTimeout(timeout);
      }
    }, 450);
    return () => {
      active = false;
      clearTimeout(timer);
      clearTimeout(timeout);
      controller.abort();
    };
  }, [requestedPin]);
  const textField = (
    key:
      | "pan"
      | "email"
      | "shippingAddress"
      | "contactName"
      | "contactPhone"
      | "bankName"
      | "bankAccount"
      | "bankIfsc"
      | "customFields",
    label: string,
  ) => (
    <label key={key}>
      {label}
      <input
        value={buyer[key] || ""}
        onChange={(e) => onChange({ ...buyer, [key]: e.target.value })}
      />
    </label>
  );
  return (
    <div className="party-layout">
      <nav aria-label="Party sections" className="party-nav">
        {[
          "Basic Details",
          "Address",
          "Credit Settings",
          "Contact Person Details",
          "Party Bank Account",
          "Custom Fields",
        ].map((label, n) => (
          <button
            type="button"
            aria-current={section === label ? "step" : undefined}
            className={section === label ? "active" : ""}
            key={label}
            onClick={() => setSection(label)}
          >
            <span>{String(n + 1).padStart(2, "0")}</span>
            {label}
          </button>
        ))}
      </nav>
      <div className="party-content">
        <h3>{section}</h3>
        <div className="buyer-details-grid">
          <div hidden={section !== "Basic Details"} className="party-fields">
            <label>
              Party Type
              <select
                value={buyer.partyType || "Customer"}
                onChange={(e) =>
                  onChange({
                    ...buyer,
                    partyType: e.target.value as "Customer" | "Supplier",
                  })
                }
              >
                <option>Customer</option>
                <option>Supplier</option>
              </select>
            </label>
            <label>
              Buyer Name
              <input
                autoComplete="organization"
                value={buyer.name}
                onChange={(e) => onChange({ ...buyer, name: e.target.value })}
                placeholder="Customer or company name"
              />
            </label>
            <label>
              Mobile Number
              <input
                type="tel"
                autoComplete="tel"
                value={buyer.mobile}
                onChange={(e) => onChange({ ...buyer, mobile: e.target.value })}
              />
            </label>
            <label>
              GSTIN (optional)
              <input
                maxLength={15}
                value={buyer.gstin}
                onChange={(e) =>
                  onChange({ ...buyer, gstin: e.target.value.toUpperCase() })
                }
              />
            </label>
            {textField("pan", "PAN Number")}
            {textField("email", "Email (optional)")}
            <label>
              Opening Balance
              <input
                type="number"
                step="0.01"
                min="0"
                value={buyer.openingBalance ?? ""}
                onChange={(e) =>
                  onChange({ ...buyer, openingBalance: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Balance type
              <select
                value={buyer.openingBalanceType || "To Collect"}
                onChange={(e) =>
                  onChange({
                    ...buyer,
                    openingBalanceType: e.target.value as
                      "To Collect" | "To Pay",
                  })
                }
              >
                <option>To Collect</option>
                <option>To Pay</option>
              </select>
            </label>
          </div>
          <div hidden={section !== "Address"} className="party-fields">
            <label className="buyer-wide">
              Address / Area
              <textarea
                autoComplete="street-address"
                rows={3}
                value={parts.area}
                onChange={(e) => update("area", e.target.value)}
                placeholder="Building, street and area"
              />
            </label>
            <label>
              PIN Code
              <input
                inputMode="numeric"
                autoComplete="postal-code"
                maxLength={6}
                value={parts.pin}
                onChange={(e) =>
                  update("pin", e.target.value.replace(/\D/g, ""))
                }
                placeholder="560062"
                aria-describedby="buyer-pin-status"
              />
            </label>
            <label>
              City / District
              <input
                autoComplete="address-level2"
                value={parts.city}
                onChange={(e) => update("city", e.target.value)}
              />
            </label>
            <label className="buyer-wide">
              State
              <input
                autoComplete="address-level1"
                value={parts.state}
                onChange={(e) => update("state", e.target.value)}
              />
            </label>
            <p
              className="buyer-wide buyer-pin-status"
              id="buyer-pin-status"
              role="status"
            >
              {lookup ||
                "Enter a 6-digit PIN Code to look up City / District and State. You can correct either field."}
            </p>
            <label className="buyer-wide">
              Separate Shipping Address
              <textarea
                rows={3}
                value={buyer.shippingAddress || ""}
                onChange={(e) =>
                  onChange({ ...buyer, shippingAddress: e.target.value })
                }
                placeholder="Leave blank to use billing address"
              />
            </label>
          </div>
          <div hidden={section !== "Credit Settings"} className="party-fields">
            {(["creditLimit", "creditDays"] as const).map((key) => (
              <label key={key}>
                {key === "creditLimit"
                  ? "Credit Limit"
                  : "Credit Period (days)"}
                <input
                  type="number"
                  min="0"
                  step={key === "creditDays" ? "1" : "0.01"}
                  value={buyer[key] ?? ""}
                  onChange={(e) =>
                    onChange({ ...buyer, [key]: Number(e.target.value) })
                  }
                />
              </label>
            ))}
          </div>
          <div
            hidden={section !== "Contact Person Details"}
            className="party-fields"
          >
            {textField("contactName", "Contact Name")}
            {textField("contactPhone", "Contact Phone")}
          </div>
          <div
            hidden={section !== "Party Bank Account"}
            className="party-fields"
          >
            {textField("bankName", "Bank Name")}
            {textField("bankAccount", "Account Number")}
            {textField("bankIfsc", "IFSC Code")}
          </div>
          <div hidden={section !== "Custom Fields"} className="party-fields">
            <label className="buyer-wide">
              Custom Fields
              <textarea
                rows={5}
                placeholder="Additional information, one field per line"
                value={buyer.customFields || ""}
                onChange={(e) =>
                  onChange({ ...buyer, customFields: e.target.value })
                }
              />
            </label>
            <label className="buyer-wide">
              Notes (optional)
              <textarea
                value={buyer.notes}
                onChange={(e) => onChange({ ...buyer, notes: e.target.value })}
              />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
