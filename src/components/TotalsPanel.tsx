import { paymentSummary, taxRows } from "../utils/invoicePresentation";
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
            disabled={i.taxMode === "non-gst"}
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
      {taxRows(i).map(([label, value]) => (
        <div className="total-line muted" key={label}>
          <span>{label}</span>
          <span>{money(value)}</span>
        </div>
      ))}
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
      <div className="total-line">
        <span>Balance</span>
        <strong>
          {paymentSummary(i).balance === null
            ? "Received amount not recorded"
            : money(paymentSummary(i).balance!)}
        </strong>
      </div>
      <p className="amount-words">{amountToWords(t.grand)}</p>
      <div className="note">
        <Info size={15} />
        <span>
          {i.taxMode === "non-gst"
            ? "Non-GST invoice"
            : "GST is included in your item prices."}
        </span>
      </div>
    </section>
  );
}
