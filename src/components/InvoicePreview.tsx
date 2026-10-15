import { useEffect, useState } from "react";
import { invoiceQr } from "../utils/paymentQr";
import { paymentSummary, taxRows } from "../utils/invoicePresentation";
import { PaymentQr } from "./PaymentQr";
import type {
  BusinessPaymentSettings,
  Invoice,
  Seller,
} from "../utils/invoiceTypes";
import { calculate, money, round } from "../utils/calculations";
import { amountToWords } from "../utils/amountToWords";
import { formatInvoiceDate } from "../utils/invoicePresentation";
import { declaration } from "../utils/pdfGenerator";
export function InvoicePreview({
  invoice: i,
  seller: s,
  payment = { upiId: "", qrCode: "" },
}: {
  invoice: Invoice;
  seller: Seller;
  payment?: BusinessPaymentSettings;
}) {
  const t = calculate(i);
  const p = paymentSummary(i);
  const [qr, setQr] = useState({ key: "", source: "", error: "" });
  const qrKey = JSON.stringify([i.id, i.number, i.status, p.balance, payment]);
  useEffect(() => {
    let active = true;
    invoiceQr(i, payment)
      .then((source) => {
        if (active) setQr({ key: qrKey, source, error: "" });
      })
      .catch((e) => {
        if (active) setQr({ key: qrKey, source: "", error: e.message });
      });
    return () => {
      active = false;
    };
  }, [qrKey]);
  const shipping = i.shipTo || i.buyer;

  return (
    <div className="invoice-paper">
      <table className="invoice-header">
        <colgroup>
          <col style={{ width: "60%" }} />
          <col style={{ width: "20%" }} />
          <col style={{ width: "20%" }} />
        </colgroup>
        <tbody>
          <tr>
            <th colSpan={2}>
              {i.taxMode === "non-gst"
                ? "SALES INVOICE · NON-GST"
                : "SALES INVOICE"}
            </th>
            <td>{i.time}</td>
          </tr>
          <tr>
            <td className="seller-cell">
              {s.logo && (
                <img
                  className="invoice-logo"
                  src={s.logo}
                  alt="Business logo"
                />
              )}
              <strong>{s.name}</strong>
              <p>{s.address}</p>
              <p>
                {i.taxMode !== "non-gst" && <>GSTIN: {s.gstin} &nbsp;</>} Ph:{" "}
                {s.phone}
              </p>
              {s.email && <p>{s.email}</p>}
            </td>
            <td>
              Invoice No.
              <br />
              <strong>{i.number}</strong>
            </td>
            <td>
              Dated
              <br />
              <strong>{formatInvoiceDate(i.date)}</strong>
              {i.dueDate && <p>Due: {formatInvoiceDate(i.dueDate)}</p>}
            </td>
          </tr>
          <tr>
            <td>
              <strong>Bill To · Buyer: {i.buyer.name || "—"}</strong>
              <p>{i.buyer.address || "—"}</p>
              <p>
                GSTIN: {i.buyer.gstin || "—"}
                <br />
                Mobile: {i.buyer.mobile || "—"}
              </p>
            </td>
            <td colSpan={2}>
              <strong>Ship To: {shipping.name || "—"}</strong>
              <p>{shipping.address || "—"}</p>
              <p>{shipping.mobile}</p>
              <p>
                Payment: {i.mode} · Vehicle: {i.vehicle || "—"}
              </p>
            </td>
          </tr>
        </tbody>
      </table>
      <table className="invoice-lines">
        <thead>
          <tr>
            {[
              "Sl No",
              "Item Description",
              "HSN Code",
              "Bill Qty",
              "Price",
              "Tax (incl.)",
              "Amount",
            ].map((x) => (
              <th key={x}>{x}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {i.items.map((r, n) => (
            <tr key={r.id}>
              <td>{n + 1}</td>
              <td>{r.name}</td>
              <td>{r.hsn}</td>
              <td>{r.qty.toFixed(2)}</td>
              <td>{(r.finalPrice ?? r.price).toFixed(2)}</td>
              <td>{r.gstPercent ?? i.gst}%</td>
              <td>{round(r.qty * (r.finalPrice ?? r.price)).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="invoice-bottom">
        <div className="invoice-bank">
          <div className="invoice-bank-layout">
            <div>
              <strong>Bank Details</strong>
              <p>
                {s.bank} – {s.branch}
              </p>
              <p>
                Account No.: {s.account}
                <br />
                IFSC: {s.ifsc}
              </p>
              {payment.upiId && <p>UPI ID: {payment.upiId}</p>}
              {payment.payeeName && <p>Payee: {payment.payeeName}</p>}
            </div>
            {qr.key === qrKey && qr.source && (
              <PaymentQr
                className="invoice-qr"
                source={qr.source}
                alt="Business UPI payment QR code"
              />
            )}
            {qr.key === qrKey && qr.error && <p role="alert">{qr.error}</p>}
          </div>
        </div>
        <div className="invoice-sums">
          {[
            ["Total Qty", t.qty],
            ["Sale Amount", money(t.sale)],
            ...(i.discount !== 0
              ? [["Special Discount", money(i.discount)]]
              : []),
            ...(i.returns !== 0 ? [["Return Amount", money(i.returns)]] : []),
            ["Net Sale Amount", money(t.net)],
            ["Taxable Amount", money(t.taxable)],
            ...taxRows(i).map(([label, value]) => [label, money(value)]),
            ...(taxRows(i).length ? [["Total Tax", money(t.tax)]] : []),
            ["Grand Total", money(t.grand)],
            [
              "Received",
              p.received === null ? "Not recorded" : money(p.received),
            ],
            ["Balance", p.balance === null ? "Not recorded" : money(p.balance)],
          ].map(([k, v]) => (
            <div key={k}>
              <span>{k}:</span>
              <strong>{v}</strong>
            </div>
          ))}
        </div>
        <p className="invoice-words">{amountToWords(t.grand)}</p>
        <div className="invoice-declaration">
          <div>
            <u>Declaration</u>
            <p>{i.declaration || declaration}</p>
          </div>
          <div>
            <strong>For {s.name}</strong>
            <div className="authorisation-images">
              {s.seal && <img src={s.seal} alt="Business seal" />}
              {s.signature && (
                <img src={s.signature} alt="Authorised signature" />
              )}
            </div>
            <p>Authorised Signatory</p>
          </div>
        </div>
      </div>
    </div>
  );
}
