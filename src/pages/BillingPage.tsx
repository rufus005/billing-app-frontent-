import { useState, useEffect, useCallback, useRef } from "react";
import {
  ReceiptText,
  Package,
  Settings,
  Plus,
  ChevronRight,
  Save,
  FolderOpen,
  Trash2,
  Printer,
  Download,
  Eye,
  UserRound,
  FileText,
  ShieldCheck,
  Check,
  ArrowUpRight,
  PanelLeftClose,
  Store,
  X,
} from "lucide-react";
import type {
  Invoice,
  Product,
  Seller,
  BuyerRecord,
  BuyerPrice,
  BusinessPaymentSettings,
} from "../utils/invoiceTypes";
import { defaultSeller, newInvoice } from "../utils/invoiceTypes";
import { read, write, keys, getLedger } from "../utils/storage";
import {
  api,
  productApi,
  buyerApi,
  buyerPriceApi,
  invoiceApi,
  businessPaymentApi,
  session,
} from "../services/api";
import {
  BuyerManager,
  BuyerSelector,
  PriceManager,
} from "../components/BuyerModules";
import { SalesManager } from "../components/SalesManager";
import { priceSnapshot, reprice } from "../utils/pricing";
import { selectionToLine, lookupCode, type Selection } from "../utils/products";
import { BuyerForm, InvoiceDetailsForm, SellerForm } from "../components/Forms";
import { ItemTable } from "../components/ItemTable";
import { BarcodeInput } from "../components/BarcodeInput";
import { TotalsPanel } from "../components/TotalsPanel";
import { ProductManager } from "../components/ProductManager";
import { AddItemModal } from "../components/AddItemModal";
import { Modal } from "../components/Modal";
import { PaymentQr } from "../components/PaymentQr";
import { InvoicePreview } from "../components/InvoicePreview";
import { readQrImage } from "../utils/paymentImage";
import { generatePDF } from "../utils/pdfGenerator";
export default function BillingPage() {
  const [seller, setSeller] = useState<Seller>(() =>
    read(keys.seller, defaultSeller),
  );
  const [products, setProducts] = useState<Product[]>(() => []);
  const [invoice, setInvoice] = useState<Invoice>(() =>
    read(keys.working, newInvoice()),
  );
  const [buyers, setBuyers] = useState<BuyerRecord[]>([]),
    [rates, setRates] = useState<BuyerPrice[]>([]);
  const [pendingBuyer, setPendingBuyer] = useState<string | null>(null),
    [loaded, setLoaded] = useState(false);
  const reload = async () => {
    const [p, b, r] = await Promise.all([
      productApi.list(),
      buyerApi.list(),
      buyerPriceApi.list(),
    ]);
    setProducts(p);
    setBuyers(b);
    setRates(r);
    setLoaded(true);
  };
  useEffect(() => {
    reload().catch((e) => setNotice(e.message));
  }, []);
  const saveProducts = async (next: Product[]) => {
    try {
      for (const p of next) {
        const old = products.find((x) => x.id === p.id);
        if (JSON.stringify(old) !== JSON.stringify(p))
          await productApi.save(p, !!old);
      }
      for (const old of products)
        if (!next.some((p) => p.id === old.id)) await productApi.remove(old);
      await reload();
    } catch (e) {
      setNotice((e as Error).message);
      await reload().catch(() => {});
    }
  };
  const changeBuyer = async (id: string, apply: boolean) => {
    try {
      const latest = apply ? await buyerPriceApi.list() : rates;
      const buyer = buyers.find((b) => b.id === id);
      setInvoice((old) => ({
        ...old,
        buyerId: id || undefined,
        buyer: buyer
          ? {
              name: buyer.name,
              mobile: buyer.mobile,
              address: buyer.address,
              gstin: buyer.gstin,
            }
          : { name: "", mobile: "", address: "", gstin: "" },
        items: apply ? reprice(old.items, products, id, latest) : old.items,
      }));
      setPendingBuyer(null);
    } catch (e) {
      setNotice((e as Error).message);
    }
  };
  const saveInvoice = async (status: Invoice["status"]) => {
    setBusy(true);
    try {
      const saved = await invoiceApi.save(
        {
          ...invoice,
          seller: invoice.seller || seller,
          status,
          items: invoice.items.map((r) => ({
            ...r,
            finalPrice: r.finalPrice ?? r.price,
          })),
        },
        invoice.revision > 0,
      );
      setInvoice(saved);
      await reload();
      setNotice("Invoice saved to MongoDB.");
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const [page, setPage] = useState("billing");
  const [picker, setPicker] = useState(false),
    [preview, setPreview] = useState(false),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false);
  const [payment, setPayment] = useState<BusinessPaymentSettings>({
    payeeName: "",
    showQrOnInvoices: true,
    upiId: "",
    qrCode: "",
  });
  const [savedPayment, setSavedPayment] = useState<BusinessPaymentSettings>({
    payeeName: "",
    showQrOnInvoices: true,
    upiId: "",
    qrCode: "",
  });
  const [paymentLoaded, setPaymentLoaded] = useState(false);
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [paymentUnconfirmed, setPaymentUnconfirmed] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [paymentMessage, setPaymentMessage] = useState("");
  const [qrReading, setQrReading] = useState(false);
  const [qrPreview, setQrPreview] = useState(false);
  const closeQrPreview = useCallback(() => setQrPreview(false), []);
  const paymentDirty =
    payment.upiId !== savedPayment.upiId ||
    payment.qrCode !== savedPayment.qrCode ||
    payment.payeeName !== savedPayment.payeeName ||
    payment.showQrOnInvoices !== savedPayment.showQrOnInvoices;
  const qrInput = useRef<HTMLInputElement>(null);
  const closePicker = useCallback(() => setPicker(false), []),
    closePreview = useCallback(() => setPreview(false), []);
  const persist = (key: string, data: unknown) => {
    try {
      write(key, data);
      return true;
    } catch {
      setNotice(
        "Storage is full or unavailable. Download your invoice before closing this tab.",
      );
      return false;
    }
  };
  useEffect(() => {
    persist(keys.seller, seller);
  }, [seller]);

  const loadPaymentSettings = useCallback(async () => {
    setPaymentError("");
    setPaymentLoaded(false);
    setPaymentMessage("");
    try {
      const value = await businessPaymentApi.get();
      setPayment(value);
      setSavedPayment(value);
      setPaymentLoaded(true);
      setPaymentUnconfirmed(false);
      return value;
    } catch (e) {
      setPaymentError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void loadPaymentSettings();
  }, [loadPaymentSettings]);
  const savePaymentSettings = async () => {
    if (!paymentLoaded || paymentSaving || qrReading) return;
    if (
      payment.upiId.trim() &&
      !/^[\w.-]+@[\w.-]+$/.test(payment.upiId.trim())
    ) {
      setPaymentError("Enter a valid UPI ID, such as name@bank.");
      return;
    }
    setPaymentError("");
    setPaymentMessage("");
    setPaymentSaving(true);
    try {
      const removeQrCode = !payment.qrCode;
      const qrChanged =
        !!payment.qrCode &&
        (paymentUnconfirmed || payment.qrCode !== savedPayment.qrCode);
      const expected = {
        ...payment,
        upiId: payment.upiId.trim(),
        payeeName: payment.payeeName?.trim() || "",
      };
      setPaymentUnconfirmed(true);
      await businessPaymentApi.save({
        upiId: payment.upiId.trim(),
        payeeName: payment.payeeName?.trim() || "",
        showQrOnInvoices: payment.showQrOnInvoices,
        qrCode: qrChanged ? payment.qrCode : undefined,
        removeQrCode,
      });
      const result = await businessPaymentApi.get();
      if (
        result.upiId !== expected.upiId ||
        result.qrCode !== expected.qrCode ||
        result.payeeName !== (payment.payeeName?.trim() || "") ||
        result.showQrOnInvoices !== (payment.showQrOnInvoices !== false)
      ) {
        throw new Error(
          "Backend API mismatch: the saved payment settings do not match your changes. Your edits are preserved; retry saving.",
        );
      }
      const savedValue = result;
      setPayment(savedValue);
      setSavedPayment(savedValue);
      setPaymentUnconfirmed(false);
      setPaymentMessage("Payment settings saved successfully.");
    } catch (e) {
      setPaymentError((e as Error).message);
    } finally {
      setPaymentSaving(false);
    }
  };
  const selectQrCode = async (file?: File) => {
    if (!file) return;
    setPaymentError("");
    setPaymentMessage("");
    setQrReading(true);
    try {
      const qrCode = await readQrImage(file);
      setPayment((old) => ({ ...old, qrCode }));
    } catch (e) {
      setPaymentError((e as Error).message);
    } finally {
      setQrReading(false);
    }
  };

  useEffect(() => {
    setSaved(false);
    const timer = setTimeout(() => {
      if (persist(keys.working, invoice)) setSaved(true);
    }, 400);
    return () => clearTimeout(timer);
  }, [invoice]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 6500);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => {
      if (
        !saved ||
        paymentDirty ||
        paymentUnconfirmed ||
        paymentSaving ||
        qrReading
      ) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [saved, paymentDirty, paymentUnconfirmed, paymentSaving, qrReading]);
  const add = async (selection: Selection[]) => {
    try {
      const latest = await buyerPriceApi.list();
      setRates(latest);
      setInvoice((old) => ({
        ...old,
        items: [
          ...old.items,
          ...selection.map((selection) => ({
            ...selectionToLine(selection),
            ...priceSnapshot(
              selection.product,
              selection.variant,
              old.buyerId,
              latest,
            ),
            gstPercent: selection.product.gstPercent ?? old.gst,
          })),
        ],
      }));
      setPicker(false);
      setNotice("Products added to invoice.");
    } catch (e) {
      setNotice((e as Error).message);
    }
  };
  const exportInvoice = async (print = false) => {
    if (!invoice.items.length) {
      setNotice("Add at least one item before printing or downloading.");
      return;
    }
    if (
      !invoice.number ||
      !invoice.date ||
      !seller.name ||
      invoice.items.some((x) => !x.name.trim() || x.qty <= 0)
    ) {
      setNotice(
        "Check invoice number, date, seller name, item descriptions and quantities.",
      );
      return;
    }
    setBusy(true);
    try {
      if (paymentUnconfirmed || paymentSaving)
        throw new Error(
          "Confirm your payment settings by retrying Save Changes in Business settings before exporting.",
        );
      const confirmedPayment = paymentLoaded
        ? savedPayment
        : await loadPaymentSettings();
      if (!confirmedPayment)
        throw new Error(
          "Payment settings unavailable. Retry loading in Business settings, then export again.",
        );
      const doc = await generatePDF(
        invoice,
        invoice.seller || seller,
        confirmedPayment,
        print ? "a4" : "a5",
      );
      if (print) {
        const url = doc.output("bloburl");
        const frame = document.createElement("iframe");
        frame.className = "print-frame";
        frame.src = String(url);
        document.body.appendChild(frame);
        frame.onload = () => {
          setTimeout(() => {
            frame.contentWindow?.focus();
            frame.contentWindow?.print();
          }, 400);
        };
        setTimeout(() => {
          frame.remove();
          URL.revokeObjectURL(String(url));
        }, 120000);
        setNotice("Print preview opened. Select A4 paper and actual size.");
      } else {
        doc.save(`${invoice.number.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`);
        setNotice("A5 invoice PDF downloaded.");
      }
    } catch (e) {
      setNotice(
        `Could not generate invoice: ${e instanceof Error ? e.message : "Please try again."}`,
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="app-shell">
        <aside className="sidebar">
          <a
            href="#"
            className="brand"
            onClick={(e) => {
              e.preventDefault();
              setPage("billing");
            }}
          >
            <div className="brand-icon">
              <ReceiptText size={25} />
            </div>
            <span>
              Billing<span className="brand-light">App</span>
            </span>
          </a>
          <div className="workspace-label">WORKSPACE</div>
          <nav>
            {[
              { id: "billing", icon: ReceiptText, label: "Create invoice" },
              { id: "sales", icon: ReceiptText, label: "Sales" },
              { id: "buyers", icon: UserRound, label: "Buyers" },
              { id: "products", icon: Package, label: "Products" },
              { id: "prices", icon: FileText, label: "Buyer Price List" },
              { id: "settings", icon: Settings, label: "Business settings" },
            ].map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                className={page === id ? "active" : ""}
                onClick={() => setPage(id)}
              >
                <Icon size={19} />
                {label}
                {page === id && <span className="nav-dot" />}
              </button>
            ))}
          </nav>
          <div className="local-card">
            <div className="local-icon">
              <ShieldCheck size={20} />
            </div>
            <strong>Just you. Your business.</strong>
            <p>
              Business records saved in MongoDB.
              <br />
              Local drafts remain on this device.
            </p>
            <span>
              <i /> Admin workspace
            </span>
          </div>
          <div className="sidebar-bottom">
            <div className="avatar">DU</div>
            <div>
              <strong>Your workspace</strong>
              <small>Admin account</small>
            </div>
            <PanelLeftClose size={17} />
          </div>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <div className="breadcrumb">
              Workspace <ChevronRight size={14} />
              <span>
                {
                  (
                    {
                      billing: "Create invoice",
                      products: "Products",
                      buyers: "Buyers",
                      prices: "Buyer Price List",
                      sales: "Sales",
                      settings: "Business settings",
                    } as Record<string, string>
                  )[page]
                }
              </span>
            </div>
            <div className="topbar-right">
              <span className="local-status">
                <i /> Business workspace
              </span>
              <button
                onClick={() => {
                  session.clear();
                  window.dispatchEvent(new Event("billing-logout"));
                }}
              >
                Logout
              </button>
            </div>
          </header>
          <main>
            {!loaded && (
              <p role="alert">
                Business data has not loaded.{" "}
                <button
                  onClick={() => reload().catch((e) => setNotice(e.message))}
                >
                  Retry connection
                </button>
              </p>
            )}
            {page === "billing" ? (
              <>
                <div className="page-heading">
                  <div>
                    <div className="eyebrow">LET’S MAKE IT OFFICIAL</div>
                    <h1>
                      Create invoice{" "}
                      <span className="draft-badge">{invoice.status}</span>
                    </h1>
                    <p>A little less paperwork. A little more business.</p>
                  </div>
                  <button
                    onClick={() => {
                      if (
                        (invoice.items.length || invoice.buyer.name) &&
                        !confirm(
                          "Start a new invoice? Save a draft first if you want to keep this invoice.",
                        )
                      )
                        return;
                      setInvoice(newInvoice());
                      setNotice("New invoice ready.");
                    }}
                  >
                    <Plus size={17} />
                    New invoice
                  </button>
                </div>
                <div className="billing-grid">
                  <div className="billing-main">
                    <section className="card seller-strip">
                      <div className="store-icon">
                        <Store size={22} />
                      </div>
                      <div>
                        <small>BILLING FROM</small>
                        <h3>{seller.name}</h3>
                        <p>
                          GSTIN: {seller.gstin || "Not set"} <span>·</span>{" "}
                          {seller.phone}
                        </p>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => setPage("settings")}
                      >
                        Edit details <ArrowUpRight size={15} />
                      </button>
                    </section>
                    <section className="card">
                      <div className="section-title">
                        <div>
                          <UserRound size={19} />
                          <h2>Buyer details</h2>
                        </div>
                        <span className="muted section-hint">
                          Who are you billing?
                        </span>
                      </div>
                      <BuyerSelector
                        buyers={buyers}
                        value={invoice.buyerId}
                        onChange={(id) => {
                          if (id === invoice.buyerId) return;
                          if (invoice.items.length) setPendingBuyer(id);
                          else void changeBuyer(id, false);
                        }}
                      />
                      <BuyerForm
                        buyer={invoice.buyer}
                        onChange={(buyer) => setInvoice({ ...invoice, buyer })}
                      />
                    </section>
                    <section className="card">
                      <div className="section-title">
                        <div>
                          <FileText size={19} />
                          <h2>Invoice details</h2>
                        </div>
                      </div>
                      <InvoiceDetailsForm
                        invoice={invoice}
                        onChange={setInvoice}
                      />
                    </section>
                    <section className="card item-card">
                      <div className="section-title">
                        <div>
                          <Package size={19} />
                          <h2>Invoice items</h2>
                          <span className="tag">{invoice.items.length}</span>
                        </div>
                        <button
                          className="primary"
                          onClick={() => setPicker(true)}
                        >
                          <Plus size={16} />
                          Add Item
                        </button>
                      </div>
                      <div className="scan-row">
                        <BarcodeInput
                          onScan={(code) => {
                            const match = lookupCode(products, code);
                            if (match && "product" in match) void add([match]);
                            else if (match) setPicker(true);
                            else setNotice(`No product found for “${code}”.`);
                          }}
                        />
                        <span>Scan. Add. Done.</span>
                      </div>
                      <ItemTable
                        items={invoice.items}
                        onChange={(items) => setInvoice({ ...invoice, items })}
                      />
                      <div className="items-footer">
                        <button
                          className="text-button"
                          onClick={() =>
                            setInvoice({
                              ...invoice,
                              items: [
                                ...invoice.items,
                                {
                                  id: crypto.randomUUID(),
                                  name: "",
                                  hsn: "",
                                  qty: 1,
                                  price: 0,
                                },
                              ],
                            })
                          }
                        >
                          <Plus size={15} />
                          Add custom row
                        </button>
                        <span>Prices are inclusive of GST</span>
                      </div>
                    </section>
                    <div className="draft-actions">
                      <button
                        className="primary"
                        disabled={
                          busy || !loaded || invoice.status === "Cancelled"
                        }
                        onClick={() => saveInvoice("Completed")}
                      >
                        {invoice.revision ? "Save Changes" : "Complete Sale"}
                      </button>
                      <button
                        disabled={
                          busy || !loaded || invoice.status === "Cancelled"
                        }
                        onClick={() => saveInvoice("Draft")}
                      >
                        Save to Sales as Draft
                      </button>
                      <button
                        onClick={() => {
                          if (persist(keys.draft, invoice))
                            setNotice(
                              "Draft saved. You can load it at any time.",
                            );
                        }}
                      >
                        <Save size={16} />
                        Save Draft
                      </button>
                      <button
                        onClick={() => {
                          const draft = read<Invoice | null>(keys.draft, null);
                          if (!draft) {
                            setNotice("No saved draft yet.");
                            return;
                          }
                          if (
                            confirm(
                              "Replace the current invoice with your saved draft?",
                            )
                          ) {
                            setInvoice(draft);
                            setNotice("Saved draft loaded.");
                          }
                        }}
                      >
                        <FolderOpen size={16} />
                        Load Draft
                      </button>
                      <button
                        className="text-button muted"
                        onClick={() => {
                          if (
                            confirm(
                              "Delete the saved draft? Your current invoice will remain.",
                            )
                          )
                            try {
                              localStorage.removeItem(keys.draft);
                              setNotice("Saved draft cleared.");
                            } catch {
                              setNotice("Could not clear local storage.");
                            }
                        }}
                      >
                        <Trash2 size={15} />
                        Clear Draft
                      </button>
                      <span className="autosave">
                        <Check size={14} />
                        {saved ? "Changes saved locally" : "Saving…"}
                      </span>
                    </div>
                  </div>
                  <aside className="summary-column">
                    <TotalsPanel invoice={invoice} onChange={setInvoice} />
                    <div className="card export-card">
                      <button
                        className="primary full"
                        disabled={busy}
                        onClick={() => exportInvoice()}
                      >
                        <Download size={17} />
                        {busy ? "Preparing invoice…" : "Download PDF"}
                      </button>
                      <div className="export-secondary">
                        <button
                          disabled={busy}
                          onClick={() => exportInvoice(true)}
                        >
                          <Printer size={16} />
                          Print
                        </button>
                        <button onClick={() => setPreview(true)}>
                          <Eye size={16} />
                          Preview
                        </button>
                      </div>
                      <p>
                        A5 download <span>·</span> A4 print
                      </p>
                    </div>
                    <div className="help-note">
                      <ShieldCheck size={18} />
                      <p>
                        Your invoice is saved on this device.
                        <br />
                        <strong>Download a PDF to keep a copy.</strong>
                      </p>
                    </div>
                  </aside>
                </div>
                <footer className="workspace-footer">
                  <span>Made for the way you do business.</span>
                  <span>
                    Billing App <span> / </span> Business workspace
                  </span>
                </footer>
              </>
            ) : page === "products" ? (
              <ProductManager products={products} onChange={saveProducts} />
            ) : page === "buyers" ? (
              <BuyerManager
                buyers={buyers}
                reload={reload}
                notify={setNotice}
              />
            ) : page === "prices" ? (
              <PriceManager
                buyers={buyers}
                products={products}
                rates={rates}
                reload={reload}
                notify={setNotice}
              />
            ) : page === "sales" ? (
              <SalesManager
                open={(i) => {
                  setInvoice(i);
                  setPage("billing");
                }}
                reload={reload}
                notify={setNotice}
              />
            ) : (
              <>
                <div className="page-heading">
                  <div>
                    <div className="eyebrow">MAKE IT YOURS</div>
                    <h1>Business settings</h1>
                    <p>Your seller and bank details appear on every invoice.</p>
                  </div>
                  <span className="tag">
                    <Check size={14} />
                    Saved automatically
                  </span>
                </div>
                <section className="card">
                  <h2>Local data backup and import</h2>
                  <p>
                    Existing browser data is preserved. Import copies products
                    Existing browser data is preserved. Import copies products
                    and saved sales into an empty database, keeping current
                    stock quantities. Seller details and working drafts stay on
                    this device; UPI payment settings are saved in MongoDB.
                  </p>
                  <button
                    onClick={() => {
                      const data = Object.fromEntries(
                        Object.values(keys).map((key) => [
                          key,
                          localStorage.getItem(key),
                        ]),
                      );
                      const url = URL.createObjectURL(
                        new Blob([JSON.stringify(data, null, 2)], {
                          type: "application/json",
                        }),
                      );
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = "billing-local-backup.json";
                      a.click();
                      setTimeout(() => URL.revokeObjectURL(url), 1000);
                    }}
                  >
                    Download local backup
                  </button>
                  <button
                    disabled={busy || !loaded}
                    onClick={async () => {
                      if (
                        !confirm(
                          "Copy local products and saved sales into MongoDB? This requires an empty database and does not deduct stock again. Download a local backup first.",
                        )
                      )
                        return;
                      setBusy(true);
                      try {
                        if (
                          !localStorage.getItem(keys.ledger) &&
                          !localStorage.getItem(keys.products)
                        )
                          throw Error(
                            "No existing local catalogue or sales found.",
                          );
                        const l = getLedger(true);
                        await api("/import", "POST", {
                          products: l.products,
                          sales: l.sales,
                        });
                        await reload();
                        setNotice(
                          "Local products and sales imported. Original browser data is preserved.",
                        );
                      } catch (e) {
                        setNotice((e as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Import local products and sales
                  </button>
                </section>
                <section className="card">
                  <div className="section-title">
                    <h2>Seller & bank details</h2>
                  </div>
                  <SellerForm seller={seller} onChange={setSeller} />
                </section>
                <section className="card payment-settings">
                  <div className="section-title">
                    <h2>UPI &amp; QR Payment Settings</h2>
                    <span className="muted section-hint">
                      Make it easy for customers to pay
                    </span>
                  </div>
                  {paymentError && (
                    <div className="payment-feedback error" role="alert">
                      {paymentError}
                      {!paymentLoaded && (
                        <button onClick={() => void loadPaymentSettings()}>
                          Retry loading
                        </button>
                      )}
                    </div>
                  )}
                  {paymentMessage && !paymentDirty && (
                    <p className="payment-feedback success" role="status">
                      {paymentMessage}
                    </p>
                  )}
                  <div
                    className="payment-settings-body"
                    aria-busy={
                      paymentSaving ||
                      qrReading ||
                      (!paymentLoaded && !paymentError)
                    }
                  >
                    <div className="payment-qr-control">
                      <div className="qr-preview">
                        {payment.qrCode ? (
                          <PaymentQr
                            source={payment.qrCode}
                            alt="Business UPI QR preview"
                          />
                        ) : (
                          <span>No QR code uploaded</span>
                        )}
                      </div>
                      <input
                        ref={qrInput}
                        className="visually-hidden"
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        aria-label="Business QR image"
                        disabled={!paymentLoaded || paymentSaving || qrReading}
                        onChange={(event) => {
                          selectQrCode(event.currentTarget.files?.[0]);
                          event.currentTarget.value = "";
                        }}
                      />
                      <div className="payment-qr-actions">
                        <button
                          disabled={!payment.qrCode || qrReading}
                          onClick={() => setQrPreview(true)}
                        >
                          Preview QR
                        </button>
                        <button
                          disabled={
                            !paymentLoaded || paymentSaving || qrReading
                          }
                          onClick={() => qrInput.current?.click()}
                        >
                          {payment.qrCode
                            ? "Replace QR Code"
                            : "Upload QR Code"}
                        </button>
                        <button
                          disabled={
                            !paymentLoaded ||
                            !payment.qrCode ||
                            paymentSaving ||
                            qrReading
                          }
                          onClick={() =>
                            setPayment((old) => ({ ...old, qrCode: "" }))
                          }
                        >
                          Remove QR Code
                        </button>
                      </div>
                    </div>
                    <div className="payment-fields">
                      <label className="field">
                        <span>UPI ID</span>
                        <input
                          value={payment.upiId}
                          disabled={
                            !paymentLoaded || paymentSaving || qrReading
                          }
                          maxLength={100}
                          placeholder="name@bank"
                          onChange={(event) =>
                            setPayment((old) => ({
                              ...old,
                              upiId: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <label className="field">
                        <span>UPI Payee Name</span>
                        <input
                          value={payment.payeeName || ""}
                          disabled={
                            !paymentLoaded || paymentSaving || qrReading
                          }
                          maxLength={100}
                          placeholder="Your Business Name"
                          onChange={(event) =>
                            setPayment((old) => ({
                              ...old,
                              payeeName: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <label className="payment-toggle">
                        <input
                          role="switch"
                          type="checkbox"
                          checked={payment.showQrOnInvoices !== false}
                          disabled={
                            !paymentLoaded || paymentSaving || qrReading
                          }
                          onChange={(event) =>
                            setPayment((old) => ({
                              ...old,
                              showQrOnInvoices: event.target.checked,
                            }))
                          }
                        />{" "}
                        Enable QR Code on Invoice
                      </label>
                      <p className="muted">
                        PNG, JPG or WebP, up to 3 MB. Save changes to apply them
                        to invoices.
                      </p>
                      <div className="payment-save-row">
                        <span className="muted" role="status">
                          {qrReading
                            ? "Checking image…"
                            : !paymentLoaded
                              ? paymentError
                                ? "Payment settings unavailable"
                                : "Loading payment settings…"
                              : paymentDirty || paymentUnconfirmed
                                ? "Unsaved changes"
                                : "Saved to MongoDB"}
                        </span>
                        <button
                          className="primary"
                          disabled={
                            !paymentLoaded ||
                            paymentSaving ||
                            qrReading ||
                            (!paymentDirty && !paymentUnconfirmed)
                          }
                          onClick={() => void savePaymentSettings()}
                        >
                          {paymentSaving ? "Saving…" : "Save Changes"}
                        </button>
                      </div>
                    </div>
                  </div>
                </section>
              </>
            )}
          </main>
        </div>
      </div>
      {qrPreview && (
        <Modal title="QR Code Preview" onClose={closeQrPreview}>
          <div className="qr-enlarged">
            <PaymentQr source={payment.qrCode} alt="Full payment QR code" />
          </div>
          <p className="qr-caption">
            {payment.payeeName}
            <br />
            {payment.upiId}
          </p>
        </Modal>
      )}
      {pendingBuyer !== null && (
        <Modal title="Buyer changed" onClose={() => setPendingBuyer(null)}>
          <p>
            Buyer changed. Apply this buyer's saved price list to existing
            invoice items?
          </p>
          <footer>
            <button onClick={() => setPendingBuyer(null)}>Cancel</button>
            <button onClick={() => changeBuyer(pendingBuyer, false)}>
              Keep Current Prices
            </button>
            <button
              className="primary"
              onClick={() => changeBuyer(pendingBuyer, true)}
            >
              Apply Prices
            </button>
          </footer>
        </Modal>
      )}
      {notice && (
        <div role="status" className="toast">
          <Check size={18} />
          <span>{notice}</span>
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {picker && (
        <AddItemModal
          products={products}
          onProducts={saveProducts}
          onAdd={add}
          onClose={closePicker}
        />
      )}
      {preview && (
        <Modal title="Invoice preview · A5" onClose={closePreview} wide>
          {!paymentLoaded && (
            <p className="payment-feedback error" role="alert">
              {paymentError || "Loading payment settings…"}
              {paymentError && (
                <button onClick={() => void loadPaymentSettings()}>
                  Retry loading
                </button>
              )}
            </p>
          )}
          <div className="preview-scroll">
            <InvoicePreview
              invoice={invoice}
              seller={invoice.seller || seller}
              payment={savedPayment}
            />
          </div>
          <footer>
            <span className="muted">
              PDF handles page breaks automatically.
            </span>
            <button
              className="primary"
              disabled={busy}
              onClick={() => exportInvoice()}
            >
              <Download size={16} />
              Download PDF
            </button>
          </footer>
        </Modal>
      )}
      <div className="print-only">
        <InvoicePreview
          invoice={invoice}
          seller={invoice.seller || seller}
          payment={savedPayment}
        />
      </div>
    </>
  );
}
