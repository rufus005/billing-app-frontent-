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
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format });
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
  const sources = [s.logo, qr, s.seal, s.signature];
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
    fontSize: format === "a4" ? 9 : 7,
    textColor: 25,
    lineColor: 180,
    lineWidth: 0.15,
    cellPadding: 2,
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
    y =
      (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable
        .finalY + 3;
  };
  table([
    [
      {
        content:
          i.taxMode === "non-gst" ? "SALES INVOICE · NON-GST" : "SALES INVOICE",
        styles: {
          fontStyle: "bold",
          halign: "center",
          fillColor: [245, 240, 255],
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
    [[address("Bill To", i.buyer), address("Ship To", i.shipTo || i.buyer)]],
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
      `${r.gstPercent ?? i.gst}%`,
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
        fillColor: [245, 240, 255],
        textColor: 25,
        fontStyle: "bold",
      },
      columnStyles: {
        0: { cellWidth: width * 0.07 },
        1: { cellWidth: width * 0.28 },
        2: { cellWidth: width * 0.12 },
        3: { cellWidth: width * 0.09, halign: "right" },
        4: { cellWidth: width * 0.14, halign: "right" },
        5: { cellWidth: width * 0.08 },
        6: { cellWidth: width * 0.22, halign: "right" },
      },
    },
  );
  const t = calculate(i),
    p = paymentSummary(i);
  const sums = [
    `Total Qty: ${t.qty}`,
    `Sale Amount: ${money(t.sale)}`,
    ...(i.discount !== 0 ? [`Special Discount: ${money(i.discount)}`] : []),
    ...(i.returns !== 0 ? [`Return Amount: ${money(i.returns)}`] : []),
    `Taxable Amount: ${money(t.taxable)}`,
    ...taxRows(i).map(([label, value]) => `${label}: ${money(value)}`),
    ...(taxRows(i).length ? [`Total Tax: ${money(t.tax)}`] : []),
    `Grand Total: ${money(t.grand)}`,
    `Received: ${p.received === null ? "Not recorded" : money(p.received)}`,
    `Balance: ${p.balance === null ? "Not recorded" : money(p.balance)}`,
  ];
  table(
    [
      [
        {
          content: `Bank Details\n${s.bank} – ${s.branch}\nAccount No.: ${s.account}\nIFSC: ${s.ifsc}${payment.upiId ? `\nUPI ID: ${payment.upiId}` : ""}${payment.payeeName ? `\nPayee: ${payment.payeeName}` : ""}`,
          styles: {
            cellWidth: width * 0.53,
            cellPadding: { top: 2, bottom: qr ? 35 : 2, left: 2, right: 2 },
          },
        },
        { content: sums.join("\n"), styles: { fontStyle: "bold" } },
      ],
      [{ content: amountToWords(t.grand), colSpan: 2 }],
      [
        {
          content: `Declaration\n${i.declaration || declaration}`,
          styles: { cellWidth: width * 0.53 },
        },
        {
          content: `For ${s.name}`,
          styles: {
            minCellHeight: 43,
            halign: "center",
            cellPadding: { top: 2, bottom: 33, left: 2, right: 2 },
          },
        },
      ],
    ],
    {
      pageBreak: "avoid",
      didDrawCell: (data) => {
        if (data.row.index === 0 && data.column.index === 0)
          drawImage(
            1,
            data.cell.x + 2,
            data.cell.y + data.cell.height - 33,
            31,
          );
        if (data.row.index !== 2 || data.column.index !== 1) return;
        const box = Math.min(24, (data.cell.width - 4) / 2);
        drawImage(2, data.cell.x + 2, data.cell.y + data.cell.height - 32, box);
        drawImage(
          3,
          data.cell.x + data.cell.width - box - 2,
          data.cell.y + data.cell.height - 32,
          box,
        );
        doc.text(
          "Authorised Signatory",
          data.cell.x + data.cell.width / 2,
          data.cell.y + data.cell.height - 3,
          { align: "center" },
        );
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
