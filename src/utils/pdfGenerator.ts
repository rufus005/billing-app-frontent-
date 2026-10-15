import { invoiceQr } from "./paymentQr";
import { paymentSummary, taxRows } from "./invoicePresentation";
import { jsPDF } from "jspdf";
import autoTable, { type RowInput } from "jspdf-autotable";
import type { BusinessPaymentSettings, Invoice, Seller } from "./invoiceTypes";
import { calculate, money } from "./calculations";
import { loadPaymentImage, containImage } from "./paymentImage";
import { formatInvoiceDate } from "./invoicePresentation";
import { amountToWords } from "./amountToWords";
export const declaration =
  "We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.";
let fontCache: Promise<string[]> | undefined;
function fonts() {
  return (fontCache ??= Promise.all(
    ["InvoiceSans.ttf", "InvoiceSans-Bold.ttf"].map(async (name) => {
      const r = await fetch(`${import.meta.env.BASE_URL}fonts/${name}`);
      if (!r.ok) throw new Error("Could not load the local invoice font.");
      const bytes = new Uint8Array(await r.arrayBuffer());
      let binary = "";
      for (let n = 0; n < bytes.length; n += 8192)
        binary += String.fromCharCode(...bytes.subarray(n, n + 8192));
      return btoa(binary);
    }),
  ).catch((e) => {
    fontCache = undefined;
    throw e;
  }));
}
export async function generatePDF(
  i: Invoice,
  s: Seller,
  payment: BusinessPaymentSettings = { upiId: "", qrCode: "" },
  format: "a4" | "a5" = "a5",
) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format,
    compress: true,
  });
  const margin = 8;
  const width = doc.internal.pageSize.getWidth() - margin * 2;
  const [normal, bold] = await fonts();
  doc.addFileToVFS("InvoiceSans.ttf", normal);
  doc.addFont("InvoiceSans.ttf", "Invoice", "normal");
  doc.addFileToVFS("InvoiceSans-Bold.ttf", bold);
  doc.addFont("InvoiceSans-Bold.ttf", "Invoice", "bold");
  doc.setFont("Invoice");
  doc.setProperties({ title: `Sales Invoice ${i.number}`, author: s.name });
  const qr = await invoiceQr(i, payment);
  const sources = [
    s.logo,
    qr,
    s.seal,
    `${import.meta.env.BASE_URL}images/authorised-signature.png`,
  ];
  const images = await Promise.all(
    sources.map((source) => (source ? loadPaymentImage(source) : null)),
  );
  const drawImage = (index: number, x: number, y: number, box: number) => {
    const img = images[index];
    if (!img) return;
    const size = containImage(img.naturalWidth, img.naturalHeight, box);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw Error("Could not prepare invoice image.");
    ctx.drawImage(img, 0, 0);
    doc.addImage(
      canvas.toDataURL("image/png"),
      "PNG",
      x + (box - size.width) / 2,
      y + (box - size.height) / 2,
      size.width,
      size.height,
    );
  };
  const styles = {
    font: "Invoice",
    fontSize: format === "a4" ? 10 : 8.5,
    textColor: 0,
    lineColor: 70,
    lineWidth: 0.15,
    cellPadding: 1.8,
    overflow: "linebreak" as const,
  };
  let y = 8;
  const table = (
    body: RowInput[],
    extra: Partial<import("jspdf-autotable").UserOptions> = {},
  ) => {
    autoTable(doc, {
      startY: y,
      margin: { top: 13, bottom: 12, left: margin, right: margin },
      theme: "grid",
      styles,
      body,
      rowPageBreak: "avoid",
      ...extra,
    });
    y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable
      .finalY;
  };
  table([
    [
      {
        content:
          i.taxMode === "non-gst" ? "SALES INVOICE · NON-GST" : "SALES INVOICE",
        styles: {
          fontStyle: "bold",
          fontSize: 12,
          halign: "center",
          fillColor: [245, 245, 245],
        },
      },
    ],
  ]);
  table(
    [
      [
        {
          content: `${s.name}\n${s.address}\n${i.taxMode === "non-gst" ? "" : `GSTIN: ${s.gstin}\n`}Ph: ${s.phone}${s.email ? `\n${s.email}` : ""}`,
          styles: {
            cellWidth: width * 0.62,
            minCellHeight: s.logo ? 26 : 0,
            cellPadding: { top: 2, bottom: 2, left: s.logo ? 27 : 2, right: 2 },
          },
        },
        {
          content: `Invoice No. ${i.number}\nDated: ${formatInvoiceDate(i.date)}${i.dueDate ? `\nDue: ${formatInvoiceDate(i.dueDate)}` : ""}\nPayment: ${i.mode}\nVehicle: ${i.vehicle || "—"}`,
        },
      ],
    ],
    {
      didDrawCell: (data) => {
        if (data.column.index === 0)
          drawImage(0, data.cell.x + 2, data.cell.y + 2, 23);
      },
    },
  );
  const address = (label: string, buyer: Invoice["buyer"]) =>
    `${label}: ${buyer.name || "—"}\n${buyer.address || "—"}\nGSTIN: ${buyer.gstin || "—"}\nMobile: ${buyer.mobile || "—"}`;
  table(
    [
      [
        address("Bill To · Buyer", i.buyer),
        address("Ship To", i.shipTo || i.buyer),
      ],
    ],
    {
      columnStyles: {
        0: { cellWidth: width / 2 },
        1: { cellWidth: width / 2 },
      },
    },
  );
  table(
    i.items.map((r, n) => [
      n + 1,
      r.name,
      r.hsn,
      r.qty.toFixed(2),
      (r.finalPrice ?? r.price).toFixed(2),
      `${i.taxMode === "non-gst" ? 0 : (r.gstPercent ?? i.gst)}%`,
      (
        Math.round((r.qty * (r.finalPrice ?? r.price) + Number.EPSILON) * 100) /
        100
      ).toFixed(2),
    ]),
    {
      head: [
        ["#", "Item", "HSN", "Qty", "Rate (₹)", "Tax incl.", "Amount (₹)"],
      ],
      headStyles: {
        fillColor: [245, 245, 245],
        textColor: 0,
        fontStyle: "bold",
      },
      columnStyles: {
        0: { cellWidth: width * 0.05 },
        1: { cellWidth: width * 0.27 },
        2: { cellWidth: width * 0.13 },
        3: { cellWidth: width * 0.08, halign: "right" },
        4: { cellWidth: width * 0.15, halign: "right" },
        5: { cellWidth: width * 0.1 },
        6: { cellWidth: width * 0.22, halign: "right" },
      },
    },
  );
  const t = calculate(i),
    p = paymentSummary(i);
  const sums: [string, string][] = [
    ["Total Qty", String(t.qty)],
    ["Sale Amount", money(t.sale)],
    ...(i.discount !== 0
      ? [["Special Discount", money(i.discount)] as [string, string]]
      : []),
    ...(i.returns !== 0
      ? [["Return Amount", money(i.returns)] as [string, string]]
      : []),
    ["Taxable Amount", money(t.taxable)],
    ...taxRows(i).map(([label, value]): [string, string] => [
      label,
      money(value),
    ]),
    ...(taxRows(i).length
      ? [["Total Tax", money(t.tax)] as [string, string]]
      : []),
    ["Grand Total", money(t.grand)],
    [
      "Received Amount",
      p.received === null ? "Not recorded" : money(p.received),
    ],
    ["Balance Amount", p.balance === null ? "Not recorded" : money(p.balance)],
  ];
  const bankText = `Bank Details\nBank Name: ${s.bank}\nAccount Number: ${s.account}\nIFSC: ${s.ifsc}${payment.payeeName ? `\nUPI Payee Name: ${payment.payeeName}` : ""}${payment.upiId ? `\nUPI ID: ${payment.upiId}` : ""}`;
  const bankWidth = width * 0.48 - 2;
  doc.setFontSize(styles.fontSize);
  const bankLines = doc.splitTextToSize(bankText, bankWidth - 4).length;
  const bankHeight =
    bankLines * styles.fontSize * 0.3528 * 1.15 + 4 + (qr ? 34 : 0);
  table(
    sums.map(([label, value], index) => [
      ...(index === 0
        ? [
            {
              content: bankText,
              rowSpan: sums.length,
              styles: {
                cellWidth: bankWidth,
                minCellHeight: bankHeight,
                cellPadding: { top: 2, right: 2, bottom: qr ? 34 : 2, left: 2 },
              },
            },
          ]
        : []),
      ...(index === 0 ? [{ content: "", rowSpan: sums.length, styles: { cellWidth: 2, lineWidth: 0, fillColor: 255 } }] : []),
      {
        content: label + ":",
        styles: { fontStyle: index >= sums.length - 3 ? "bold" : "normal" },
      },
      {
        content: value,
        styles: {
          halign: "right",
          fontStyle: index >= sums.length - 3 ? "bold" : "normal",
        },
      },
    ]),
    {
      pageBreak: "avoid",
      columnStyles: {
        0: { cellWidth: bankWidth },
        1: { cellWidth: 2 },
        2: { cellWidth: width * 0.28 },
        3: { cellWidth: width * 0.24 },
      },
      didDrawCell: (data) => {
        if (data.column.index === 0 && data.row.index === 0)
          drawImage(
            1,
            data.cell.x + (data.cell.width - 31) / 2,
            data.cell.y + data.cell.height - 33,
            31,
          );
      },
    },
  );
  table([[{ content: amountToWords(t.grand), styles: { fontStyle: "bold" } }]]);
  table(
    [
      [
        {
          content: `Declaration\n${i.declaration || declaration}`,
          styles: { cellWidth: width * 0.48 },
        },
        { content: "", styles: { minCellHeight: 29 } },
      ],
    ],
    {
      pageBreak: "avoid",
      didDrawCell: (data) => {
        if (data.column.index !== 1) return;
        const x = data.cell.x,
          top = data.cell.y,
          w = data.cell.width;
        if (s.seal) drawImage(2, x + 2, top + 1, 16);
        const img = images[3];
        if (img) {
          const h = 15,
            imageWidth = Math.min(
              w - 8,
              (h * img.naturalWidth) / img.naturalHeight,
            );
          const imageHeight =
            (imageWidth * img.naturalHeight) / img.naturalWidth;
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          canvas.getContext("2d")!.drawImage(img, 0, 0);
          doc.addImage(
            canvas.toDataURL("image/png"),
            "PNG",
            x + (w - imageWidth) / 2,
            top + 2,
            imageWidth,
            imageHeight,
          );
        }
        doc.setFont("Invoice", "bold");
        doc.setFontSize(format === "a4" ? 8 : 6.5);
        const company = "DYNAMIC UNIVERSAL MARKETING";
        const captionSize = Math.min(format === "a4" ? 8 : 7, (w - 6) / doc.getTextWidth(company) * doc.getFontSize());
        doc.setFontSize(captionSize);
        const caption = ["AUTHORISED SIGNATORY FOR", company];
        doc.text(caption, x + w / 2, top + 21, { align: "center" });
      },
    },
  );
  const pages = doc.getNumberOfPages();
  for (let n = 1; n <= pages; n++) {
    doc.setPage(n);
    doc.setFontSize(6);
    if (n > 1) doc.text(`Invoice ${i.number} · continued`, margin, 8);
    doc.text(
      `Invoice ${i.number} • Page ${n} of ${pages}`,
      doc.internal.pageSize.getWidth() / 2,
      doc.internal.pageSize.getHeight() - 5,
      { align: "center" },
    );
  }
  return doc;
}
