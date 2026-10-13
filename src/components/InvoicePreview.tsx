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
            <th colSpan={2}>SALES INVOICE</th>
            <td>{i.time}</td>
          </tr>
          <tr>
            <td className="seller-cell">
              <strong>{s.name}</strong>
              <p>{s.address}</p>
              <p>
                GSTIN: {s.gstin} &nbsp; Ph: {s.phone}
              </p>
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
            </td>
          </tr>
          <tr>
            <td>
              <strong>Buyer: {i.buyer.name || "—"}</strong>
              <p>{i.buyer.address || "—"}</p>
              <p>
                GSTIN: {i.buyer.gstin || "—"}
                <br />
                Mobile: {i.buyer.mobile || "—"}
              </p>
            </td>
            <td>
              Invoice Mode
              <br />
              <strong>{i.mode}</strong>
            </td>
            <td>
              Vehicle No.
              <br />
              {i.vehicle || "—"}
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
            {payment.showQrOnInvoices !== false && payment.qrCode && (
              <PaymentQr
                className="invoice-qr"
                source={payment.qrCode}
                alt="Business UPI payment QR code"
              />
            )}
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
            ["Grand Total", money(t.grand)],
          ].map(([k, v]) => (
            <div key={k}>
              <span>{k}:</span>
              <strong>{v}</strong>
            </div>
          ))}
        </div>
        <table className="invoice-tax">
          <thead>
            <tr>
              <th>Taxable Amount</th>
              <th>CGST ({i.gst / 2}%)</th>
              <th>SGST ({i.gst / 2}%)</th>
              <th>Total Tax</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              {[t.taxable, t.cgst, t.sgst, t.tax].map((v, n) => (
                <td key={n}>{v.toFixed(2)}</td>
              ))}
            </tr>
          </tbody>
        </table>
        <p className="invoice-words">{amountToWords(t.grand)}</p>
        <div className="invoice-declaration">
          <div>
            <u>Declaration</u>
            <p>{declaration}</p>
          </div>
          <div>
            <strong>For {s.name}</strong>
            <p>Authorised Signatory</p>
          </div>
        </div>
      </div>
    </div>
  );
}
