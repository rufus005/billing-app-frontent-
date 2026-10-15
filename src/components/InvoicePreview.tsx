import { useEffect, useRef, useState } from "react";
import type {
  BusinessPaymentSettings,
  Invoice,
  Seller,
} from "../utils/invoiceTypes";
import { generatePDF } from "../utils/pdfGenerator";

const emptyPayment: BusinessPaymentSettings = { upiId: "", qrCode: "" };

// One document layout for preview, download and print. Render the actual PDF,
// rather than maintaining a second HTML invoice that can drift from it.
export function InvoicePreview({
  invoice,
  seller,
  payment = emptyPayment,
  format = "a5",
}: {
  invoice: Invoice;
  seller: Seller;
  payment?: BusinessPaymentSettings;
  format?: "a4" | "a5";
}) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState({ loading: true, error: "" });
  const key = JSON.stringify([invoice, seller, payment, format]);
  useEffect(() => {
    let active = true;
    let dispose: (() => void) | undefined;
    const container = host.current!;
    container.replaceChildren();
    setState({ loading: true, error: "" });
    void (async () => {
      const [i, s, p, size] = JSON.parse(key);
      const [doc, pdfjs, worker] = await Promise.all([
        generatePDF(i, s, p, size),
        import("pdfjs-dist"),
        import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
      ]);
      if (!active) return;
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      const task = pdfjs.getDocument({
        data: new Uint8Array(doc.output("arraybuffer")),
      });
      dispose = () => {
        void task.destroy();
      };
      const pdf = await task.promise;
      for (let n = 1; n <= pdf.numPages; n++) {
        if (!active) return;
        const page = await pdf.getPage(n);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({ canvas, viewport }).promise;
        const text = await page.getTextContent();
        if (!active) return;
        const sheet = document.createElement("section");
        sheet.className = "invoice-pdf-page";
        sheet.style.width = size === "a4" ? "210mm" : "148mm";
        canvas.setAttribute("aria-hidden", "true");
        const description = document.createElement("div");
        description.className = "invoice-accessible-text";
        description.textContent = text.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ");
        sheet.setAttribute(
          "aria-label",
          `Invoice page ${n} of ${pdf.numPages}`,
        );
        sheet.append(canvas, description);
        container.append(sheet);
      }
      if (active) setState({ loading: false, error: "" });
    })().catch((error) => {
      if (active)
        setState({
          loading: false,
          error: error.message || "Could not render invoice.",
        });
    });
    return () => {
      active = false;
      dispose?.();
      container.replaceChildren();
    };
  }, [key]);
  return (
    <div className="invoice-preview" aria-busy={state.loading}>
      {state.loading && <p role="status">Preparing invoice…</p>}
      {state.error && <p role="alert">{state.error}</p>}
      <div className="invoice-paper" ref={host} />
    </div>
  );
}
