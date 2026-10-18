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
    lineColor: 0,
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
      {
        content: "ORIGINAL FOR RECIPIENT",
        styles: {
          fontSize: 7,
          textColor: [115, 115, 145],
          cellWidth: 45,
          lineColor: [115, 115, 145],
          lineWidth: 0.2,
          cellPadding: 0.5,
        },
      },
      { content: "" },
    ],
  ]);
  const location = [s.city, s.state, s.pin]
    .filter(Boolean)
    .filter((v) => !s.address.toLowerCase().includes(v!.toLowerCase()))
    .join(", ");
  y += format === "a4" ? 3 : 2;
  const logoBox = format === "a4" ? 32 : 23;
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
  const headerLeft = margin + (s.logo ? logoBox + 6 : 0);
  table(
    [
      [
        {
          content: s.name,
          styles: { fontSize: format === "a4" ? 18 : 11, fontStyle: "bold" },
        },
      ],
      [
        {
          content: sellerDetails,
          styles: { cellPadding: { top: 0, bottom: 1, left: 1.2, right: 1.2 } },
        },
      ],
    ],
    { margin: { left: headerLeft, right: margin, top: 13, bottom: 12 } },
  );
  if (s.logo) {
    drawImage(0, margin + 1, headerTop - 2, logoBox);
    y = Math.max(y, headerTop + logoBox + 2);
  }
  y += 2;
  doc.setLineWidth(1.8);
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
        fillColor: [229, 229, 229],
        fontStyle: "bold",
        cellPadding: { top: 3.5, bottom: 3.5, left: 4, right: 4 },
      },
    },
  );
  const address = (buyer: Invoice["buyer"]) =>
    [
      buyer.address || "—",
      buyer.gstin && `GSTIN: ${buyer.gstin}`,
      buyer.mobile && `Mobile: ${buyer.mobile}`,
    ]
      .filter(Boolean)
      .join("\n");
  y += 1;
  table(
    [
      ["BILL TO", "SHIP TO"],
      [i.buyer.name || "—", (i.shipTo || i.buyer).name || "—"],
      [address(i.buyer), address(i.shipTo || i.buyer)],
    ],
    {
      styles: {
        ...styles,
        cellPadding: { top: 1.2, bottom: 1.2, left: 0, right: 3 },
      },
      columnStyles: {
        0: { cellWidth: width / 2 },
        1: { cellWidth: width / 2 },
      },
      didParseCell: (data) => {
        if (data.row.index === 1) data.cell.styles.fontStyle = "bold";
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
        r.name +
          (r.color ? `\nCOLOR ${r.color}` : "") +
          (r.discountPercent ? ` (discount ${r.discountPercent}%)` : ""),
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
      didParseCell: (data) => {
        if (data.section === "head")
          data.cell.styles.halign =
            data.column.index === 0
              ? "left"
              : data.column.index < 3
                ? "center"
                : "right";
      },
      headStyles: {
        fillColor: [255, 255, 255],
        textColor: 0,
        fontStyle: "bold",
        lineWidth: { top: 0.4, bottom: 0.4 },
        cellPadding: { top: 3, bottom: 3, left: 1.2, right: 1.2 },
      },
      bodyStyles: { lineWidth: { bottom: 0.1 }, lineColor: 190 },
      columnStyles: {
        0: { cellWidth: width * 0.28 },
        1: { cellWidth: width * 0.11, halign: "center" },
        2: { cellWidth: width * 0.14, halign: "center" },
        3: { cellWidth: width * 0.12, halign: "right" },
        4: { cellWidth: width * 0.16, halign: "right" },
        5: { cellWidth: width * 0.19, halign: "right" },
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
    ["Name", s.name],
    ["IFSC Code", s.ifsc],
    ["Account No", s.account],
    ["Bank", [s.bank, s.branch].filter(Boolean).join(", ")],
  ];
  const paymentDetails = [
    payment.payeeName && `UPI Payee Name: ${payment.payeeName}`,
    payment.upiId && `UPI ID:\n${payment.upiId}`,
  ]
    .filter(Boolean)
    .join("\n");
  if (!qr) {
    if (payment.payeeName) bankRows.push(["UPI Payee Name", payment.payeeName]);
    if (payment.upiId) bankRows.push(["UPI ID", payment.upiId]);
  }
  if (doc.getNumberOfPages() === 1)
    y = Math.max(y, itemTop + (format === "a4" ? 54 : 24));
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
        0: { cellWidth: width * 0.39 },
        1: { cellWidth: width * 0.14, halign: "center" },
        2: { cellWidth: width * 0.28, halign: "right" },
        3: { cellWidth: width * 0.19, halign: "right" },
      },
    },
  );
  y += 2;
  const bankWidth = width * 0.52;
  const compactStyles = {
    ...styles,
    cellPadding: { top: 0.5, bottom: 0.5, left: 1.2, right: 1.2 },
  };
  doc.setFont("Invoice", "normal");
  doc.setFontSize(styles.fontSize);
  const labelWidth = bankWidth * 0.3;
  const lineHeight = styles.fontSize * 0.3528 * 1.15;
  const qrSize = 46;
  const qrCellHeight = qrSize + 2;
  const paymentHeight = qr
    ? Math.max(
        qrCellHeight,
        doc.splitTextToSize(
          `PAYMENT QR CODE\n\n${paymentDetails}`,
          bankWidth * 0.5 - 2.4,
        ).length *
          lineHeight +
          2.4,
      ) + 2
    : 0;
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
        1,
      0,
    ) +
    paymentHeight;
  const wordsText = `Total Amount (in words)\n${amountToWords(t.grand)}`;
  const wordsHeight =
    doc.splitTextToSize(wordsText, width * 0.52 - 2.4).length * lineHeight +
    2.4;
  const footerText = i.declaration ? `Declaration\n${i.declaration}` : "";
  doc.setFontSize(7);
  const declarationHeight = footerText
    ? doc.splitTextToSize(footerText, width - 2.4).length *
        (7 * 0.3528 * 1.15) +
      2.4
    : 0;
  doc.setFontSize(styles.fontSize);
  const signatureHeight = 34;
  const rightHeight =
    sums.reduce(
      (height, [label, value]) =>
        height +
        Math.max(
          doc.splitTextToSize(label, width * 0.23 - 2.4).length,
          doc.splitTextToSize(value, width * 0.12 - 2.4).length,
        ) *
          lineHeight +
        1,
      0,
    ) +
    4 +
    5 +
    wordsHeight +
    3 +
    signatureHeight +
    declarationHeight;
  const pageHeight = doc.internal.pageSize.getHeight();
  if (
    y +
      Math.max(
        bankHeight + 5 + signatureHeight + declarationHeight,
        rightHeight,
      ) >
    pageHeight - margin
  ) {
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
      styles: compactStyles,
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
          { content: `PAYMENT QR CODE\n\n${paymentDetails || " "}` },
          { content: "", styles: { minCellHeight: qrCellHeight } },
        ],
      ],
      {
        tableWidth: bankWidth,
        columnStyles: {
          0: { cellWidth: bankWidth * 0.5 },
          1: { cellWidth: bankWidth * 0.5 },
        },
        margin: {
          left: margin,
          right: margin + width - bankWidth,
          top: margin,
          bottom: margin,
        },
        didDrawCell: (data) => {
          if (data.column.index !== 1) return;
          drawImage(
            1,
            data.cell.x + 1,
            data.cell.y + (data.cell.height - qrSize) / 2,
            qrSize,
          );
        },
      },
    );
  }
  const bankBottom = y;
  y = footerTop;
  table(
    sums.map(([label, value]) => [
      label,
      { content: value, styles: { halign: "right" } },
    ]),
    {
      styles: compactStyles,
      didParseCell: (data) => {
        const label = sums[data.row.index]?.[0];
        if (label === "Total Amount" || label === "Balance Amount")
          data.cell.styles.fontStyle = "bold";
        if (label === "Total Amount") {
          data.cell.styles.lineWidth = { top: 0.1, bottom: 0.1 };
          data.cell.styles.lineColor = 170;
          data.cell.styles.cellPadding = {
            top: 1.5,
            bottom: 1.5,
            left: 1.2,
            right: 1.2,
          };
        }
      },
      margin: {
        left: margin + width * 0.65,
        right: margin,
        top: margin,
        bottom: margin,
      },
      columnStyles: {
        0: { cellWidth: width * 0.23, halign: "right" },
        1: { cellWidth: width * 0.12, halign: "right" },
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
  // Follow the payment summary instead of stretching the footer to the page edge.
  y += 5;
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
        const imageHeight = (imageWidth * img.naturalHeight) / img.naturalWidth;
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
