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
  format: "a4" | "a5" = "a4",
) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format,
    compress: true,
  });
  const margin = format === "a4" ? 10 : 7;
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
    s.signature || `${import.meta.env.BASE_URL}images/authorised-signature.png`,
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
    fontSize: format === "a4" ? 9 : 7,
    textColor: 0,
    lineColor: 70,
    lineWidth: 0,
    cellPadding: 1.2,
    overflow: "linebreak" as const,
  };
  let y = 6;
  const table = (
    body: RowInput[],
    extra: Partial<import("jspdf-autotable").UserOptions> = {},
  ) => {
    autoTable(doc, {
      startY: y,
      margin: { top: margin, bottom: margin, left: margin, right: margin },
      theme: "plain",
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
          i.taxMode === "non-gst" ? "SALES INVOICE · NON-GST" : "TAX INVOICE",
        styles: { fontStyle: "bold", fontSize: 8, cellWidth: 26 },
      },
      { content: "ORIGINAL FOR RECIPIENT", styles: { fontSize: 7 } },
    ],
  ]);
  const location = [s.city, s.state, s.pin]
    .filter(Boolean)
    .filter((v) => !s.address.toLowerCase().includes(v!.toLowerCase()))
    .join(", ");
  const logoBox = format === "a4" ? 30 : 23;
  const sellerDetails = [
    s.address,
    location,
    [
      s.phone && `Mobile: ${s.phone}`,
      i.taxMode !== "non-gst" && s.gstin && `GSTIN: ${s.gstin}`,
      s.pan && `PAN: ${s.pan}`,
    ]
      .filter(Boolean)
      .join("    "),
    s.email && `Email: ${s.email}`,
    s.website,
  ]
    .filter(Boolean)
    .join("\n");
  const headerTop = y;
  const headerLeft = margin + (s.logo ? logoBox + 4 : 0);
  table(
    [
      [
        {
          content: s.name,
          styles: { fontSize: format === "a4" ? 15 : 11, fontStyle: "bold" },
        },
      ],
      [{ content: sellerDetails }],
    ],
    { margin: { left: headerLeft, right: margin, top: 13, bottom: 12 } },
  );
  if (s.logo) {
    drawImage(0, margin + 1, headerTop + 1, logoBox);
    y = Math.max(y, headerTop + logoBox + 2);
  }
  y += 2;
  doc.setLineWidth(1);
  doc.line(margin, y, margin + width, y);
  y += 1;
  table(
    [
      [
        `Invoice No: ${i.number}`,
        {
          content: `Invoice Date: ${formatInvoiceDate(i.date)}${i.time ? " " + i.time : ""}${i.dueDate ? `\nDue: ${formatInvoiceDate(i.dueDate)}` : ""}`,
          styles: { halign: "right" },
        },
      ],
    ],
    {
      styles: {
        ...styles,
        fillColor: [232, 232, 232],
        fontStyle: "bold",
        cellPadding: 2,
      },
    },
  );
  const address = (label: string, buyer: Invoice["buyer"]) =>
    [
      label,
      buyer.name || "—",
      buyer.address || "—",
      buyer.gstin && `GSTIN: ${buyer.gstin}`,
      buyer.mobile && `Mobile: ${buyer.mobile}`,
    ]
      .filter(Boolean)
      .join("\n");
  table(
    [[address("BILL TO", i.buyer), address("SHIP TO", i.shipTo || i.buyer)]],
    {
      columnStyles: {
        0: { cellWidth: width / 2 },
        1: { cellWidth: width / 2 },
      },
    },
  );
  y += 2;
  const itemTop = y;
  table(
    i.items.map((r) => {
      const gst = i.taxMode === "non-gst" ? 0 : (r.gstPercent ?? i.gst);
      const rate =
        (r.finalPrice ?? r.price) * (1 - (r.discountPercent || 0) / 100);
      const amount = Math.round((r.qty * rate + Number.EPSILON) * 100) / 100;
      const taxable =
        i.pricingMode === "exclusive" ? amount : amount / (1 + gst / 100);
      const tax =
        i.pricingMode === "exclusive" ? (amount * gst) / 100 : amount - taxable;
      return [
        r.name + (r.discountPercent ? ` (discount ${r.discountPercent}%)` : ""),
        r.hsn,
        String(r.qty),
        (i.pricingMode === "exclusive" ? rate : rate / (1 + gst / 100)).toFixed(
          2,
        ),
        `${tax.toFixed(2)}\n(${gst}%)`,
        (taxable + tax).toFixed(2),
      ];
    }),
    {
      head: [["ITEMS", "HSN", "QTY.", "RATE", "TAX", "AMOUNT"]],
      headStyles: {
        fillColor: [232, 232, 232],
        textColor: 0,
        fontStyle: "bold",
        lineWidth: { top: 0.4, bottom: 0.4 },
      },
      bodyStyles: { lineWidth: { bottom: 0.1 }, lineColor: 190 },
      columnStyles: {
        0: { cellWidth: width * 0.32 },
        1: { cellWidth: width * 0.12, halign: "center" },
        2: { cellWidth: width * 0.1, halign: "center" },
        3: { cellWidth: width * 0.15, halign: "right" },
        4: { cellWidth: width * 0.14, halign: "center" },
        5: { cellWidth: width * 0.17, halign: "right" },
      },
    },
  );
  const t = i.totals || calculate(i),
    p = paymentSummary(i);
  const sums: [string, string][] = [
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

    ...(i.additionalCharges
      ? [["Additional Charges", money(i.additionalCharges)] as [string, string]]
      : []),
    ...(t.roundOff
      ? [["Round Off", money(t.roundOff)] as [string, string]]
      : []),
    ["Total Amount", money(t.grand)],
    [
      "Received Amount",
      p.received === null ? "Not recorded" : money(p.received),
    ],
    ["Balance Amount", p.balance === null ? "Not recorded" : money(p.balance)],
  ];
  const bankRows = [
    ["Bank Name", [s.bank, s.branch].filter(Boolean).join(", ")],
    ["Account Holder", s.name],
    ["Account Number", s.account],
    ["IFSC", s.ifsc],
  ];
  const paymentDetails = [
    payment.payeeName && `UPI Payee Name: ${payment.payeeName}`,
    payment.upiId && `UPI ID: ${payment.upiId}`,
  ]
    .filter(Boolean)
    .join("\n");
  if (!qr) {
    if (payment.payeeName)
      bankRows.push(["UPI Payee Name", payment.payeeName]);
    if (payment.upiId) bankRows.push(["UPI ID", payment.upiId]);
  }
  if (doc.getNumberOfPages() === 1)
    y = Math.max(y, itemTop + (format === "a4" ? 36 : 24));
  table(
    [
      [
        { content: "SUBTOTAL", styles: { fontStyle: "bold" } },
        String(t.qty),
        money(t.tax),
        money(t.grand),
      ],
    ],
    {
      styles: {
        ...styles,
        fontStyle: "bold",
        lineWidth: { top: 0.4, bottom: 0.4 },
      },
      columnStyles: {
        0: { cellWidth: width * 0.42 },
        1: { cellWidth: width * 0.12 },
        2: { cellWidth: width * 0.23, halign: "right" },
        3: { cellWidth: width * 0.23, halign: "right" },
      },
    },
  );
  const bankWidth = width * 0.48;
  doc.setFont("Invoice", "normal");
  doc.setFontSize(styles.fontSize);
  const labelWidth = bankWidth * 0.37;
  const lineHeight = styles.fontSize * 0.3528 * 1.15;
  const bankHeight =
    7 +
    bankRows.reduce(
      (height, [label, value]) =>
        height +
        Math.max(
          doc.splitTextToSize(label + ":", labelWidth - 2.4).length,
          doc.splitTextToSize(value || "—", bankWidth - labelWidth - 2.4)
            .length,
        ) *
          lineHeight +
        2.4,
      0,
    ) +
    (qr ? 32 : 0);
  const wordsText = `Total Amount (in words)\n${amountToWords(t.grand)}`;
  const wordsHeight =
    doc.splitTextToSize(wordsText, width * 0.52 - 2.4).length * lineHeight +
    2.4;
  const footerText = i.declaration
    ? `Declaration\n${i.declaration}`
    : "";
  doc.setFontSize(7);
  const declarationHeight = footerText
    ? doc.splitTextToSize(footerText, width - 2.4).length *
      (7 * 0.3528 * 1.15) +
    2.4
    : 0;
  doc.setFontSize(styles.fontSize);
  const signatureHeight = 34;
  const rightHeight =
    sums.length * (lineHeight + 2.4) +
    5 +
    wordsHeight +
    3 +
    signatureHeight +
    declarationHeight;
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y + Math.max(bankHeight, rightHeight) > pageHeight - margin) {
    doc.addPage();
    y = margin + 3;
  }
  const footerTop = y;
  table(
    [
      [{ content: "BANK DETAILS", colSpan: 2, styles: { fontStyle: "bold" } }],
      ...bankRows.map(([label, value]) => [label + ":", value || "—"]),
    ],
    {
      tableWidth: bankWidth,
      columnStyles: {
        0: { cellWidth: labelWidth },
        1: { cellWidth: bankWidth - labelWidth },
      },
      margin: {
        left: margin,
        right: margin + width - bankWidth,
        top: margin,
        bottom: margin,
      },
    },
  );
  if (qr) {
    y += 2;
    table(
      [
        [
          { content: paymentDetails || " " },
          { content: "", styles: { minCellHeight: 28 } },
        ],
      ],
      {
        tableWidth: bankWidth,
        columnStyles: {
          0: { cellWidth: bankWidth - 29 },
          1: { cellWidth: 29 },
        },
        margin: {
          left: margin,
          right: margin + width - bankWidth,
          top: margin,
          bottom: margin,
        },
        didDrawCell: (data) => {
          if (data.column.index !== 1) return;
          const box = 25;
          drawImage(
            1,
            data.cell.x + (data.cell.width - box) / 2,
            data.cell.y + (data.cell.height - box) / 2,
            box,
          );
        },
      },
    );
  }
  const bankBottom = y;
  y = footerTop;
  table(
    sums.map(([label, value]) => [
      label + ":",
      { content: value, styles: { halign: "right" } },
    ]),
    {
      margin: {
        left: margin + width * 0.52,
        right: margin,
        top: margin,
        bottom: margin,
      },
      columnStyles: {
        0: { cellWidth: width * 0.28 },
        1: { cellWidth: width * 0.2, halign: "right" },
      },
    },
  );
  y += 5;
  table([
    [
      { content: "", styles: { cellWidth: width * 0.48 } },
      {
        content: wordsText,
        styles: { halign: "right" },
      },
    ],
  ]);
  y = Math.max(y, bankBottom);
  const footerHeight = signatureHeight + declarationHeight;
  y = Math.max(y + 3, pageHeight - margin - footerHeight);
  const footerRows: RowInput[] = [
    [
      { content: "", styles: { cellWidth: width * 0.48 } },
      { content: "", styles: { minCellHeight: 29 } },
    ],
    ...(i.declaration
      ? [
          [
            {
              content: footerText,
              colSpan: 2,
              styles: { fontSize: 7 },
            },
          ],
        ]
      : []),
  ];
  table(footerRows, {
    pageBreak: "avoid",
    didDrawCell: (data) => {
      if (data.row.index !== 0 || data.column.index !== 1) return;
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
          x + w - imageWidth - 2,
          top + 2,
          imageWidth,
          imageHeight,
        );
      }
      doc.setFont("Invoice", "bold");
      doc.setFontSize(format === "a4" ? 8 : 6.5);
      const company = s.name;
      const captionSize = Math.min(
        format === "a4" ? 8 : 7,
        ((w - 6) / doc.getTextWidth(company)) * doc.getFontSize(),
      );
      doc.setFontSize(captionSize);
      const caption = ["AUTHORISED SIGNATORY FOR", company];
      doc.text(caption, x + w - 2, top + 21, { align: "right" });
    },
  });
  const pages = doc.getNumberOfPages();
  for (let n = 1; n <= pages; n++) {
    doc.setPage(n);
    doc.setFontSize(6);
    if (n > 1) doc.text(`Invoice ${i.number} · continued`, margin, 8);
    if (pages > 1)
      doc.text(
        `Invoice ${i.number} • Page ${n} of ${pages}`,
        doc.internal.pageSize.getWidth() / 2,
        doc.internal.pageSize.getHeight() - 5,
        { align: "center" },
      );
  }
  return doc;
}
