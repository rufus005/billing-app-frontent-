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
          bank: "Bank name",
          branch: "Bank branch",
          account: "Account number",
          ifsc: "IFSC code",
        }) as [keyof Seller, string][]
      ).map(([key, label]) => (
        <Field
          key={key}
          label={label}
          value={s[key]}
          onChange={(v) => onChange({ ...s, [key]: v })}
          maxLength={key === "address" ? 250 : 120}
        />
      ))}
    </div>
  );
}
