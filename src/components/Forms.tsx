import { calculate } from "../utils/calculations";
import type { Buyer, Invoice, Seller } from "../utils/invoiceTypes";
export function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder = "",
  ...rest
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type={type}
        step={type === "number" ? "any" : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        {...rest}
      />
    </label>
  );
}
export function BuyerForm({
  buyer,
  onChange,
}: {
  buyer: Buyer;
  onChange: (b: Buyer) => void;
}) {
  return (
    <div className="form-grid">
      <Field
        label="Buyer name"
        value={buyer.name}
        onChange={(name) => onChange({ ...buyer, name })}
        placeholder="Enter customer or business name"
        maxLength={120}
      />
      <Field
        label="Mobile number"
        value={buyer.mobile}
        onChange={(mobile) => onChange({ ...buyer, mobile })}
        placeholder="+91"
        maxLength={30}
      />
      <Field
        label="Billing address"
        value={buyer.address}
        onChange={(address) => onChange({ ...buyer, address })}
        placeholder="Street, city, state and PIN code"
        maxLength={250}
      />
      <Field
        label="GSTIN (optional)"
        value={buyer.gstin}
        onChange={(gstin) => onChange({ ...buyer, gstin })}
        placeholder="Enter GSTIN"
        maxLength={15}
      />
    </div>
  );
}
export function InvoiceDetailsForm({
  invoice: i,
  onChange,
}: {
  invoice: Invoice;
  onChange: (i: Invoice) => void;
}) {
  return (
    <div className="form-grid details-grid">
      <Field
        label="Invoice number"
        value={i.number}
        onChange={(number) => onChange({ ...i, number })}
        maxLength={50}
      />
      <Field
        label="Invoice date"
        type="date"
        value={i.date}
        onChange={(date) => onChange({ ...i, date })}
      />
      <Field
        label="Due date"
        type="date"
        value={i.dueDate || ""}
        onChange={(dueDate) => onChange({ ...i, dueDate })}
      />
      <label className="field">
        Tax mode
        <select
          aria-label="Tax mode"
          value={i.taxMode || (i.gst ? "gst" : "non-gst")}
          onChange={(e) => {
            const taxMode = e.target.value as "gst" | "non-gst";
            onChange({
              ...i,
              taxMode,
              gst: taxMode === "non-gst" ? 0 : 18,
              items: i.items.map((r) => ({
                ...r,
                gstPercent: taxMode === "non-gst" ? 0 : undefined,
              })),
            });
          }}
        >
          <option value="gst">GST</option>
          <option value="non-gst">Non-GST</option>
        </select>
      </label>
      {i.taxMode !== "non-gst" && (
        <label className="field">
          Supply type
          <select
            aria-label="Supply type"
            value={i.taxJurisdiction || "intra"}
            onChange={(e) =>
              onChange({
                ...i,
                taxJurisdiction: e.target.value as "intra" | "inter",
              })
            }
          >
            <option value="intra">Within state — CGST + SGST</option>
            <option value="inter">Interstate — IGST</option>
          </select>
        </label>
      )}
      <p className="muted">
        Enter the total confirmed receipts, including earlier payments. Saving
        replaces this total; scanning a QR does not confirm payment.
      </p>
      {i.payments?.length ? (
        <p className="note">
          Receipts are locked to the payment history. Use Record Payment in
          Sales.
        </p>
      ) : (
        <Field
          label="Received amount"
          type="number"
          value={i.receivedAmount === undefined ? "" : String(i.receivedAmount)}
          onChange={(v) =>
            onChange({
              ...i,
              receivedAmount:
                v === ""
                  ? undefined
                  : Math.min(calculate(i).grand, Math.max(0, Number(v) || 0)),
            })
          }
        />
      )}
      <label className="field">
        Shipping address
        <select
          aria-label="Shipping address"
          value={i.shipTo ? "separate" : "same"}
          onChange={(e) =>
            onChange({
              ...i,
              shipTo: e.target.value === "same" ? undefined : { ...i.buyer },
            })
          }
        >
          <option value="same">Same as Bill To</option>
          <option value="separate">Separate Ship To</option>
        </select>
      </label>
      {i.shipTo && (
        <div>
          <h3>Ship To</h3>
          <BuyerForm
            buyer={i.shipTo}
            onChange={(shipTo) => onChange({ ...i, shipTo })}
          />
        </div>
      )}
      <Field
        label="Invoice time"
        type="time"
        value={i.time}
        onChange={(time) => onChange({ ...i, time })}
      />
      <label className="field">
        <span>Payment mode</span>
        <select
          value={i.mode}
          onChange={(e) => onChange({ ...i, mode: e.target.value })}
        >
          {["Cash", "Credit", "UPI", "Bank Transfer"].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </label>
      <Field
        label="Vehicle number (optional)"
        value={i.vehicle}
        onChange={(vehicle) => onChange({ ...i, vehicle })}
        placeholder="e.g. KA 01 AB 1234"
        maxLength={30}
      />
    </div>
  );
}
export function SellerForm({
  seller: s,
  onChange,
}: {
  seller: Seller;
  onChange: (s: Seller) => void;
}) {
  return (
    <div className="form-grid">
      {(
        Object.entries({
          name: "Company / seller name",
          address: "Address",
          gstin: "GSTIN",
          phone: "Phone number",
          email: "Email",
          pan: "PAN",
          website: "Website",
          pin: "PIN Code",
          city: "City / District",
          state: "State",
          bank: "Bank name",
          branch: "Bank branch",
          account: "Account number",
          ifsc: "IFSC code",
        }) as [keyof Seller, string][]
      ).map(([key, label]) => (
        <Field
          key={key}
          label={label}
          value={s[key] || ""}
          onChange={(v) => onChange({ ...s, [key]: v })}
          maxLength={key === "address" ? 250 : 120}
        />
      ))}
    </div>
  );
}
