import { Info } from "lucide-react";
import type { Invoice } from "../utils/invoiceTypes";
import { calculate, money, numeric } from "../utils/calculations";
import { amountToWords } from "../utils/amountToWords";
export function TotalsPanel({
  invoice: i,
  onChange,
}: {
  invoice: Invoice;
  onChange: (i: Invoice) => void;
}) {
  const t = calculate(i);
  return (
    <section className="card totals">
      <div className="section-title">
        <h2>Invoice summary</h2>
        <span className="tag">{t.qty} units</span>
      </div>
      <div className="total-line">
        <span>Sale amount</span>
        <strong>{money(t.sale)}</strong>
      </div>
      {(["discount", "returns"] as const).map((k) => (
        <label className="total-line" key={k}>
          <span>{k === "discount" ? "Special discount" : "Return amount"}</span>
          <div className="money-input">
            <span>₹</span>
            <input
              aria-label={
                k === "discount" ? "Special discount" : "Return amount"
              }
              type="number"
              min="0"
              step="0.01"
              value={i[k]}
              onChange={(e) => onChange({ ...i, [k]: numeric(e.target.value) })}
            />
          </div>
        </label>
      ))}
      {i.discount + i.returns > t.sale && (
        <p className="warning">
          Deductions exceed the sale amount. Net sale is limited to zero.
        </p>
      )}
      <div className="total-line subtotal">
        <span>Net sale amount</span>
        <strong>{money(t.net)}</strong>
      </div>
      <div className="tax-label">
        <span>GST breakdown</span>
        <label>
          <input
            aria-label="GST rate"
            type="number"
            min="0"
            max="100"
            step="0.1"
            value={i.gst}
            onChange={(e) =>
              onChange({ ...i, gst: Math.min(100, numeric(e.target.value)) })
            }
          />
          % <span>inclusive</span>
        </label>
      </div>
      <div className="total-line muted">
        <span>Taxable amount</span>
        <span>{money(t.taxable)}</span>
      </div>
      <div className="total-line muted">
        <span>
          CGST (
          {i.items.some(
            (r) => r.gstPercent !== undefined && r.gstPercent !== i.gst,
          )
            ? "mixed"
            : i.gst / 2 + "%"}
          )
        </span>
        <span>{money(t.cgst)}</span>
      </div>
      <div className="total-line muted">
        <span>
          SGST (
          {i.items.some(
            (r) => r.gstPercent !== undefined && r.gstPercent !== i.gst,
          )
            ? "mixed"
            : i.gst / 2 + "%"}
          )
        </span>
        <span>{money(t.sgst)}</span>
      </div>
      <div className="total-line">
        <span>Total tax</span>
        <span>{money(t.tax)}</span>
      </div>
      <div className="grand-total">
        <div>
          <span>Grand total</span>
          <small>Including all taxes</small>
        </div>
        <strong>{money(t.grand)}</strong>
      </div>
      <p className="amount-words">{amountToWords(t.grand)}</p>
      <div className="note">
        <Info size={15} />
        <span>GST is included in your item prices.</span>
      </div>
    </section>
  );
}
