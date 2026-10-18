import { useState } from "react";
import type { BuyerRecord } from "../utils/invoiceTypes";
import { joinBuyerAddress } from "../utils/buyerAddress";
import { BuyerAddressFields } from "./BuyerAddressFields";
export function BuyerDetailsFields({
  buyer,
  onChange,
}: {
  buyer: BuyerRecord;
  onChange: (b: BuyerRecord) => void;
}) {
  const [section, setSection] = useState("Basic Details");
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
            <BuyerAddressFields
              key={buyer.id}
              address={
                buyer.addressParts
                  ? joinBuyerAddress(buyer.addressParts)
                  : buyer.address
              }
              onChange={(address, addressParts) =>
                onChange({ ...buyer, address, addressParts })
              }
            />
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
