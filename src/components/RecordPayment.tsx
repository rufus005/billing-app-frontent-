import { useState, useCallback } from "react";
import type { Invoice, PaymentRecord } from "../utils/invoiceTypes";
import { recordPayment } from "../services/api";
import { paymentSummary } from "../utils/invoicePresentation";
import { money } from "../utils/calculations";
import { Modal } from "./Modal";
export function RecordPayment({
  invoice,
  close,
  saved,
}: {
  invoice: Invoice;
  close: () => void;
  saved: (i: Invoice) => void;
}) {
  const [payment, setPayment] = useState<PaymentRecord>(() => ({
    id: crypto.randomUUID(),
    amount: paymentSummary(invoice).balance || 0,
    date: new Date().toLocaleDateString("en-CA"),
    method: "Cash",
    reference: "",
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const safeClose = useCallback(() => {
    if (!busy) close();
  }, [busy, close]);
  return (
    <Modal title={`Record Payment · ${invoice.number}`} onClose={safeClose}>
      <form
        className="payment-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const result = await recordPayment(invoice.id, payment);
            saved(result);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="payment-balance">
          <span>Outstanding balance</span>
          <strong>
            {paymentSummary(invoice).balance === null
              ? "Unknown"
              : money(paymentSummary(invoice).balance!)}
          </strong>
        </div>
        {paymentSummary(invoice).balance === null && (
          <p className="warning">
            Confirm the historical received total in the invoice before
            recording a new payment.
          </p>
        )}
        <div className="form-grid">
          <label>
            Payment amount
            <input
              required
              type="number"
              min="0.01"
              step="0.01"
              max={paymentSummary(invoice).balance ?? 0}
              value={payment.amount}
              onChange={(e) =>
                setPayment({ ...payment, amount: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Payment date
            <input
              required
              type="date"
              value={payment.date}
              onChange={(e) => setPayment({ ...payment, date: e.target.value })}
            />
          </label>
          <label>
            Payment method
            <select
              value={payment.method}
              onChange={(e) =>
                setPayment({
                  ...payment,
                  method: e.target.value as PaymentRecord["method"],
                })
              }
            >
              {["Cash", "UPI", "Bank Transfer"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            Payment reference
            <input
              maxLength={200}
              value={payment.reference}
              onChange={(e) =>
                setPayment({ ...payment, reference: e.target.value })
              }
            />
          </label>
        </div>
        <p>
          Record only money you have received. For split payments, record each
          confirmed method separately.
        </p>
        {error && (
          <p role="alert" className="warning">
            {error}
          </p>
        )}
        <div className="buyer-actions">
          <button type="button" disabled={busy} onClick={close}>
            Cancel
          </button>
          <button
            className="primary"
            disabled={busy || !paymentSummary(invoice).balance}
          >
            {busy ? "Recording…" : "Confirm payment"}
          </button>
        </div>
        <h3>Payment history</h3>
        <div className="dashboard-list">
          {invoice.paymentOpeningReceived !== undefined && (
            <p>
              Earlier confirmed receipts:{" "}
              {money(invoice.paymentOpeningReceived)}
            </p>
          )}
          {invoice.payments?.map((p) => (
            <div key={p.id}>
              <span>
                {p.date} · {p.method}
                <small>{p.reference}</small>
              </span>
              <strong>{money(p.amount)}</strong>
            </div>
          ))}
          {!invoice.payments?.length && (
            <p>
              No dated payments yet. Existing received total:{" "}
              {paymentSummary(invoice).received === null
                ? "Unknown"
                : money(paymentSummary(invoice).received!)}
            </p>
          )}
        </div>
      </form>
    </Modal>
  );
}
