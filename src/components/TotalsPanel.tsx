import { paymentSummary, taxRows } from "../utils/invoicePresentation";
import { Info, Plus, Trash2 } from "lucide-react";
import type { Invoice } from "../utils/invoiceTypes";
import { calculate, invoiceCharges, money, numeric } from "../utils/calculations";
import { amountToWords } from "../utils/amountToWords";
export function TotalsPanel({
  invoice: i,
  onChange,
}: {
  invoice: Invoice;
  onChange: (i: Invoice) => void;
}) {
  const t = calculate(i);
  const charges = invoiceCharges(i);
  const updateCharges = (next: typeof charges) =>
    onChange({ ...i, additionalCharges: next });
  return (
    <section className="card totals">
      <div className="section-title">
        <h2>{i.documentType === "quotation" ? "Quotation summary" : "Invoice summary"}</h2>
        <span className="tag">{t.qty} units</span>
      </div>
      <label className="field">
        Item pricing
        <select
          value={i.pricingMode || "inclusive"}
          onChange={(e) =>
            onChange({
              ...i,
              pricingMode: e.target.value as "inclusive" | "exclusive",
            })
          }
        >
          <option value="inclusive">GST Inclusive</option>
          <option value="exclusive">GST Exclusive</option>
        </select>
      </label>
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
          % <span>{i.pricingMode || "inclusive"}</span>
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
      <div className="section-title">
        <strong>Extra charges</strong>
        <button
          className="text-button"
          onClick={() =>
            updateCharges([
              ...charges,
              { name: "Custom Charge", amount: 0, taxable: false },
            ])
          }
        >
          <Plus size={15} /> Add Custom Charge
        </button>
      </div>
      {charges.map((charge, index) => (
        <div className="charge-row" key={index}>
          <input
            aria-label={`Charge ${index + 1} name`}
            value={charge.name}
            maxLength={100}
            onChange={(e) =>
              updateCharges(
                charges.map((item, n) =>
                  n === index ? { ...item, name: e.target.value } : item,
                ),
              )
            }
          />
          <input
            aria-label={`Charge ${index + 1} amount`}
            type="number"
            min="0"
            step="0.01"
            value={charge.amount}
            onChange={(e) =>
              updateCharges(
                charges.map((item, n) =>
                  n === index
                    ? { ...item, amount: numeric(e.target.value) }
                    : item,
                ),
              )
            }
          />
          <label>
            <input
              type="checkbox"
              aria-label={`Charge ${index + 1} taxable`}
              checked={charge.taxable || false}
              onChange={(e) =>
                updateCharges(
                  charges.map((item, n) =>
                    n === index ? { ...item, taxable: e.target.checked } : item,
                  ),
                )
              }
            />
            Taxable
          </label>
          <button
            className="icon-button danger"
            aria-label={`Delete charge ${index + 1}`}
            onClick={() =>
              updateCharges(charges.filter((_, n) => n !== index))
            }
          >
            <Trash2 size={15} />
          </button>
        </div>
      ))}
      <label className="total-line">
        Auto round off
        <input
          style={{ width: 18 }}
          type="checkbox"
          checked={i.autoRoundOff || false}
          onChange={(e) => onChange({ ...i, autoRoundOff: e.target.checked })}
        />
      </label>
      {t.roundOff !== undefined && t.roundOff !== 0 && (
        <div className="total-line">
          <span>Round off</span>
          <span>{money(t.roundOff)}</span>
        </div>
      )}
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
          {i.documentType === "quotation"
            ? "Not applicable"
            : paymentSummary(i).balance === null
              ? "Received amount not recorded"
              : money(paymentSummary(i).balance!)}
        </strong>
      </div>
      <p className="amount-words">{amountToWords(t.grand)}</p>
      <div className="note">
        <Info size={15} />
        <span>
          {i.documentType === "quotation"
            ? "Estimate only; quotation is not a payment request."
            : i.taxMode === "non-gst"
              ? "Non-GST invoice"
            : i.pricingMode === "exclusive"
              ? "GST is added to your item prices."
              : "GST is included in your item prices."}
        </span>
      </div>
    </section>
  );
}
