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
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format });
  const margin = (doc.internal.pageSize.getWidth() - 134) / 2;
  const qrImage =
    payment.qrCode && payment.showQrOnInvoices !== false
      ? await loadPaymentImage(payment.qrCode)
      : null;
  const [normal, bold] = await fonts();
  doc.addFileToVFS("InvoiceSans.ttf", normal);
  doc.addFont("InvoiceSans.ttf", "Invoice", "normal");
  doc.addFileToVFS("InvoiceSans-Bold.ttf", bold);
  doc.addFont("InvoiceSans-Bold.ttf", "Invoice", "bold");
  doc.setFont("Invoice");
  doc.setProperties({ title: `Sales Invoice ${i.number}`, author: s.name });
  const styles = {
    font: "Invoice",
    fontSize: 6.3,
    textColor: 0,
    lineColor: 0,
    lineWidth: 0.15,
    cellPadding: 1.1,
  };
  const header = () => {
    autoTable(doc, {
      startY: 7,
      margin: { left: margin, right: margin },
      theme: "grid",
      styles,
      body: [
        [
          {
            content: "SALES INVOICE",
            styles: { fontStyle: "bold", halign: "center" },
            colSpan: 2,
          },
          { content: i.time, styles: { halign: "center" } },
        ],
        [
          {
            content: `${s.name}\n${s.address}\nGSTIN: ${s.gstin}  Ph: ${s.phone}`,
            styles: { cellWidth: 80 },
          },
          { content: `Invoice No.\n${i.number}`, styles: { cellWidth: 27 } },
          { content: `Dated\n${formatInvoiceDate(i.date)}` },
        ],
        [
          {
            content: `Buyer: ${i.buyer.name || "—"}\n${i.buyer.address || "—"}\nGSTIN: ${i.buyer.gstin || "—"}  Mobile: ${i.buyer.mobile || "—"}`,
          },
          { content: `Invoice Mode\n${i.mode}` },
          { content: `Vehicle No.\n${i.vehicle || "—"}` },
        ],
      ],
      columnStyles: {
        0: { cellWidth: 80 },
        1: { cellWidth: 27 },
        2: { cellWidth: 27 },
      },
    });
    return (
      (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable
        .finalY + 2
    );
  };
  const top = header();
  autoTable(doc, {
    startY: top,
    margin: { top, bottom: 9, left: margin, right: margin },
    theme: "grid",
    styles,
    headStyles: { fillColor: 255, textColor: 0, fontStyle: "bold" },
    head: [
      [
        "Sl No",
        "Item Description",
        "HSN Code",
        "Bill Qty",
        "Price (₹)",
        "Amount (₹)",
      ],
    ],
    body: i.items.map((r, n) => [
      n + 1,
      r.name,
      r.hsn,
      r.qty.toFixed(2),
      (r.finalPrice ?? r.price).toFixed(2),
      (
        Math.round((r.qty * (r.finalPrice ?? r.price) + Number.EPSILON) * 100) /
        100
      ).toFixed(2),
    ]),
    columnStyles: {
      0: { cellWidth: 9 },
      1: { cellWidth: 49 },
      2: { cellWidth: 19 },
      3: { cellWidth: 15, halign: "right" },
      4: { cellWidth: 19, halign: "right" },
      5: { cellWidth: 23, halign: "right" },
    },
    rowPageBreak: "avoid",
    willDrawPage: (data) => {
      if (data.pageNumber > 1) header();
    },
  });
  let y =
    (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable
      .finalY + 2;
  const t = calculate(i);
  const deductionRows: RowInput[] = [];
  if (i.discount !== 0)
    deductionRows.push([{ content: `Special Discount: ${money(i.discount)}` }]);
  if (i.returns !== 0)
    deductionRows.push([{ content: `Return Amount: ${money(i.returns)}` }]);
  const summaryRowCount = 3 + deductionRows.length;
  // All final sections form one measured table, so AutoTable moves the entire block when needed.
  const body: RowInput[] = [
    [
      {
        content: `Bank Details\n${s.bank} – ${s.branch}\nAccount No.: ${s.account}\nIFSC: ${s.ifsc}${payment.upiId ? `\nUPI ID: ${payment.upiId}` : ""}${payment.payeeName ? `\nPayee: ${payment.payeeName}` : ""}`,
        rowSpan: summaryRowCount,
        styles: {
          cellWidth: 73,
          minCellHeight: qrImage ? 32 : 0,
          cellPadding: {
            top: 2,
            bottom: 2,
            left: 2,
            right:
              payment.qrCode && payment.showQrOnInvoices !== false ? 31 : 2,
          },
        },
      },
      { content: `Total Qty: ${t.qty}    Sale Amount: ${money(t.sale)}` },
    ],
    ...deductionRows,
    [{ content: `Net Sale Amount: ${money(t.net)}` }],
    [
      {
        content: `Grand Total: ${money(t.grand)}`,
        styles: { fontStyle: "bold" },
      },
    ],
    [{ content: "", colSpan: 2, styles: { minCellHeight: 14 } }],
    [
      {
        content: amountToWords(t.grand),
        colSpan: 2,
        styles: { fontStyle: "bold" },
      },
    ],
    [
      {
        content: `Declaration\n${i.declaration || declaration}`,
        styles: { cellWidth: 73, minCellHeight: 22 },
      },
      {
        content: `For ${s.name}\n\nAuthorised Signatory`,
        styles: { halign: "center" as const },
      },
    ],
  ];
  autoTable(doc, {
    startY: y,
    margin: { top, bottom: 10, left: margin, right: margin },
    theme: "grid",
    styles,
    body,
    pageBreak: "avoid",
    rowPageBreak: "avoid",
    didDrawCell: (data) => {
      if (
        payment.showQrOnInvoices !== false &&
        payment.qrCode &&
        data.section === "body" &&
        data.row.index === 0 &&
        data.column.index === 0
      ) {
        if (!qrImage) return;
        const size = containImage(
          qrImage.naturalWidth,
          qrImage.naturalHeight,
          27,
        );
        const canvas = document.createElement("canvas");
        canvas.width = qrImage.naturalWidth;
        canvas.height = qrImage.naturalHeight;
        const context = canvas.getContext("2d");
        if (!context)
          throw new Error("Could not prepare the QR image for PDF.");
        context.fillStyle = "white";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(qrImage, 0, 0);
        doc.addImage(
          canvas.toDataURL("image/png"),
          "PNG",
          data.cell.x + data.cell.width - 29 + (27 - size.width) / 2,
          data.cell.y + 2 + (27 - size.height) / 2,
          size.width,
          size.height,
        );
      }
      if (data.row.index === summaryRowCount && data.section === "body") {
        const width = data.cell.width / 4;
        const labels = [
          "Taxable Amount",
          `CGST (${i.items.some((r) => r.gstPercent !== undefined && r.gstPercent !== i.gst) ? "mixed" : i.gst / 2 + "%"})`,
          `SGST (${i.items.some((r) => r.gstPercent !== undefined && r.gstPercent !== i.gst) ? "mixed" : i.gst / 2 + "%"})`,
          "Total Tax",
        ];
        const values = [t.taxable, t.cgst, t.sgst, t.tax];
        doc.setFontSize(6.3);
        labels.forEach((label, n) => {
          const x = data.cell.x + width * (n + 0.5);
          doc.setFont("Invoice", "bold");
          doc.text(label, x, data.cell.y + 4, { align: "center" });
          doc.setFont("Invoice", "normal");
          doc.text(values[n].toFixed(2), x, data.cell.y + 10, {
            align: "center",
          });
        });
        doc.line(
          data.cell.x,
          data.cell.y + 6,
          data.cell.x + data.cell.width,
          data.cell.y + 6,
        );
      }
    },
    columnStyles: { 0: { cellWidth: 73 }, 1: { cellWidth: 61 } },
    willDrawPage: () => {
      if (doc.getNumberOfPages() > 1) header();
    },
  });
  const pages = doc.getNumberOfPages();
  for (let n = 1; n <= pages; n++) {
    doc.setPage(n);
    doc.setFontSize(6);
    doc.text(
      `Invoice ${i.number} • Page ${n} of ${pages}`,
      doc.internal.pageSize.getWidth() / 2,
      doc.internal.pageSize.getHeight() - 5,
      {
        align: "center",
      },
    );
  }
  return doc;
}
