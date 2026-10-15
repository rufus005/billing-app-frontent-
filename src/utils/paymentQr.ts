import QRCode from "qrcode";
import type { BusinessPaymentSettings, Invoice } from "./invoiceTypes";
import { paymentSummary } from "./invoicePresentation";

export function upiPaymentUri(
  invoice: Invoice,
  payment: BusinessPaymentSettings,
) {
  const { balance } = paymentSummary(invoice);
  if (invoice.status === "Cancelled" || balance === 0) return "";
  if (balance === null)
    throw Error("Record the received amount before generating an amount QR.");
  if (
    !/^[\w.-]+@[\w.-]+$/.test(payment.upiId.trim()) ||
    !payment.payeeName?.trim()
  )
    throw Error("Save a valid UPI ID and payee name in Business settings.");
  const params = {
    pa: payment.upiId.trim(),
    pn: payment.payeeName.trim(),
    am: balance.toFixed(2),
    cu: "INR",
    tr: invoice.id,
    tn: `Invoice ${invoice.number}`,
  };
  return (
    "upi://pay?" +
    Object.entries(params)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join("&")
  );
}
export async function invoiceQr(
  invoice: Invoice,
  payment: BusinessPaymentSettings,
) {
  if (payment.showQrOnInvoices === false) return "";
  const dynamic =
    payment.qrMode === "dynamic" ||
    (payment.qrMode === undefined &&
      !!payment.upiId.trim() &&
      !!payment.payeeName?.trim());
  if (!dynamic) return payment.qrCode;
  // Historical receipts may be unknown. Never invent an amount or prevent
  // printing the historical invoice simply because no amount QR is possible.
  if (paymentSummary(invoice).balance === null) return "";
  const uri = upiPaymentUri(invoice, payment);
  return uri
    ? QRCode.toDataURL(uri, {
        width: 384,
        margin: 4,
        errorCorrectionLevel: "M",
      })
    : "";
}
