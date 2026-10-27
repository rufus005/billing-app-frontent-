import { joinBuyerAddress, splitBuyerAddress } from "../utils/buyerAddress";
import {
  persistSnapshot,
  removeSnapshot,
  snapshotRaw,
  snapshotKeys,
  storageFailure,
  storageUsage,
} from "../utils/browserSnapshots";
import { invoiceSeller } from "../utils/invoicePresentation";
import { invoiceCharges } from "../utils/calculations";
import { PartyModal } from "../components/PartyModal";
import { Dashboard } from "../components/Dashboard";
import { businessProfileApi } from "../services/api";
import { LayoutDashboard } from "lucide-react";
import { BusinessAssets } from "../components/BusinessAssets";
import {
  lazy,
  Suspense,
  useState,
  useEffect,
  useCallback,
  useRef,
  type SetStateAction,
} from "react";
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
import {
  defaultSeller,
  newInvoice,
} from "../utils/invoiceTypes";
import { read, keys, getLedger } from "../utils/storage";
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
const InvoicePreview = lazy(() =>
  import("../components/InvoicePreview").then((m) => ({
    default: m.InvoicePreview,
  })),
);
import { readQrImage } from "../utils/paymentImage";
import { invoiceFilename } from "../utils/invoicePresentation";

export default function BillingPage() {
  const [seller, setSeller] = useState<Seller>(() =>
    read(keys.seller, defaultSeller),
  );
  const [savedQrMode, setSavedQrMode] = useState<Seller["qrMode"]>();
  const [profileReady, setProfileReady] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileStored, setProfileStored] = useState(false);
  const [profileError, setProfileError] = useState("");
  const initialSeller = useRef(JSON.stringify(seller));
  const loadBusinessProfile = useCallback(async () => {
    setProfileError("");
    try {
      const value = await businessProfileApi.get();
      if (value) {
        setSeller((old) =>
          JSON.stringify(old) === initialSeller.current
            ? { ...old, ...value }
            : old,
        );
        setSavedQrMode(value.qrMode);
      }
      setProfileReady(true);
      return value;
    } catch (e) {
      setProfileError((e as Error).message);
      throw e;
    }
  }, []);
  useEffect(() => {
    void loadBusinessProfile().catch(() => {});
  }, [loadBusinessProfile]);
  const saveProfile = async () => {
    setProfileBusy(true);
    try {
      const value = await businessProfileApi.save(seller);
      setSeller(value);
      setSavedQrMode(value.qrMode);
      setProfileError("");
      setProfileReady(true);
      setNotice("Business details saved to MongoDB.");
    } catch (e) {
      setProfileError((e as Error).message);
    } finally {
      setProfileBusy(false);
    }
  };
  const [paperSize, setPaperSize] = useState<"a4" | "a5">("a4");
  const [products, setProducts] = useState<Product[]>(() => []);
  const [invoice, setInvoiceState] = useState<Invoice>(() =>
    read(keys.working, newInvoice()),
  );
  const setInvoice = (action: SetStateAction<Invoice>) =>
    setInvoiceState((old) => {
      const next = typeof action === "function" ? action(old) : action;
      // Keep saved historical totals until the user edits financial inputs.
      const financial = (i: Invoice) =>
        JSON.stringify([
          i.items,
          i.discount,
          i.returns,
          i.gst,
          i.taxMode,
          i.pricingMode,
          i.additionalCharges,
          i.autoRoundOff,
        ]);
      if (
        next.id === old.id &&
        next.revision === old.revision &&
        financial(next) !== financial(old)
      )
        return { ...next, totals: undefined };
      return next;
    });
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
        shipTo: buyer?.shippingAddress
          ? {
              name: buyer.name,
              mobile: buyer.mobile,
              gstin: buyer.gstin,
              address: buyer.shippingAddress,
            }
          : undefined,
        buyer: buyer
          ? {
              name: buyer.name,
              mobile: buyer.mobile,
              address: buyer.addressParts
                ? joinBuyerAddress(buyer.addressParts)
                : buyer.address,
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
      const isQuotation = invoice.documentType === "quotation";
      const saved = await invoiceApi.save(
        {
          ...invoice,
          seller: invoice.seller || seller,
          additionalCharges: invoiceCharges(invoice),
          status: isQuotation ? "Draft" : status,
          quotationStatus: isQuotation
            ? invoice.quotationStatus || "Draft"
            : undefined,
          items: invoice.items.map((r) => ({
            ...r,
            finalPrice: r.finalPrice ?? r.price,
          })),
        },
        invoice.revision > 0,
      );
      const fields = [
        "dueDate",
        "shipTo",
        "taxMode",
        "taxJurisdiction",
        "receivedAmount",
        "documentType",
        "quotationStatus",
        "additionalCharges",
      ] as const;
      const missing = fields.filter(
        (key) => {
          if (key === "additionalCharges")
            return (
              JSON.stringify(invoiceCharges(saved)) !==
              JSON.stringify(invoiceCharges(invoice))
            );
          return (
            invoice[key] !== undefined &&
            JSON.stringify(saved[key]) !== JSON.stringify(invoice[key])
          );
        },
      );
      if (missing.length) {
        setInvoice({
          ...invoice,
          ...saved,
          ...Object.fromEntries(missing.map((key) => [key, invoice[key]])),
        });
        await reload();
        setNotice(
          `Invoice saved, but backend did not preserve: ${missing.join(", ")}. Local edits retained; backend update required.`,
        );
        return;
      }
      setInvoice(saved);
      await reload();
      setNotice(
        saved.documentType === "quotation"
          ? "Quotation saved to MongoDB."
          : "Invoice saved to MongoDB.",
      );
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const [newParty, setNewParty] = useState(false);
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
  const persist = async (key: string, data: unknown) => {
    try {
      await persistSnapshot(key, data);
      return true;
    } catch (error) {
      setNotice(storageFailure(error));
      return false;
    }
  };
  useEffect(() => {
    let active = true;
    setProfileStored(false);
    void persist(keys.seller, seller).then((ok) => {
      if (active) setProfileStored(ok);
    });
    return () => {
      active = false;
    };
  }, [seller]);

  const loadPaymentSettings = useCallback(async () => {
    setPaymentError("");
    setPaymentLoaded(false);
    setPaymentMessage("");
    try {
      const value = await businessPaymentApi.get();
      setPayment(value);
      if (value.qrCodeWarning) setPaymentError(value.qrCodeWarning);
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
    let active = true;
    const timer = setTimeout(async () => {
      if ((await persist(keys.working, invoice)) && active) setSaved(true);
    }, 400);
    return () => {
      active = false;
      clearTimeout(timer);
    };
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
        !profileStored ||
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
  }, [
    saved,
    profileStored,
    paymentDirty,
    paymentUnconfirmed,
    paymentSaving,
    qrReading,
  ]);
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
            gstPercent:
              old.taxMode === "non-gst"
                ? 0
                : (selection.product.gstPercent ?? old.gst),
          })),
        ],
      }));
      setPicker(false);
      setNotice("Products added to invoice.");
    } catch (e) {
      setNotice((e as Error).message);
    }
  };
  const startInvoice = async () => {
    if (invoice.items.length || invoice.buyer.name || invoice.buyer.address) {
      if (!(await persist(`billing-app:archived-draft:${invoice.id}`, invoice)))
        return;
    }
    setInvoice(newInvoice());
    setPage("billing");
    setNotice("New invoice ready. Previous work is available in local drafts.");
  };
  // Navigation resumes the editor; only New invoice archives and resets work.
  const navigate = (target: string) => setPage(target);
  const [localDraftsOpen, setLocalDraftsOpen] = useState(false);
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
      const exportBusiness = profileReady
        ? seller
        : { ...seller, ...(await loadBusinessProfile()) };
      const { generatePDF } = await import("../utils/pdfGenerator");
      const doc = await generatePDF(
        invoice,
        invoiceSeller(invoice, exportBusiness),
        { ...confirmedPayment, qrMode: savedQrMode },
        paperSize,
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
        setNotice(
          "Print preview opened. Select the chosen paper size and actual size.",
        );
      } else {
        doc.save(invoiceFilename(invoice));
        setNotice(`${paperSize.toUpperCase()} invoice PDF downloaded.`);
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
      {newParty && (
        <PartyModal
          onClose={() => setNewParty(false)}
          onSaved={(buyer, keepOpen) => {
            if (!keepOpen) setNewParty(false);
            setInvoice((old) => ({
              ...old,
              buyerId: buyer.id,
              buyer: {
                name: buyer.name,
                mobile: buyer.mobile,
                address: buyer.addressParts
                  ? joinBuyerAddress(buyer.addressParts)
                  : buyer.address,
                gstin: buyer.gstin,
              },
              shipTo: buyer.shippingAddress
                ? {
                    name: buyer.name,
                    mobile: buyer.mobile,
                    address: buyer.shippingAddress,
                    gstin: buyer.gstin,
                  }
                : undefined,
            }));
            void reload().catch((e) => setNotice(e.message));
          }}
        />
      )}
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
              { id: "dashboard", icon: LayoutDashboard, label: "Dashboard" },
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
                onClick={() => navigate(id)}
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
                      dashboard: "Dashboard",
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
            {page === "dashboard" ? (
              <Dashboard
                products={products}
                navigate={navigate}
                open={(i) => {
                  setInvoice(i);
                  setPage("billing");
                }}
              />
            ) : page === "billing" ? (
              <>
                <div className="page-heading">
                  <div>
                    <div className="eyebrow">LET’S MAKE IT OFFICIAL</div>
                    <h1>
                      Create{" "}
                      {invoice.documentType === "quotation"
                        ? "quotation"
                        : "invoice"}{" "}
                      <span className="draft-badge">
                        {invoice.documentType === "quotation"
                          ? invoice.quotationStatus || "Draft"
                          : invoice.status}
                      </span>
                    </h1>
                    <p>A little less paperwork. A little more business.</p>
                  </div>
                  <button onClick={startInvoice}>
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
                      <button
                        className="text-button"
                        onClick={() => setNewParty(true)}
                      >
                        <Plus size={15} /> Add New Buyer
                      </button>
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
                        key={`${invoice.id}:${invoice.buyerId || "walk-in"}`}
                        buyer={invoice.buyer}
                        onChange={(buyer) => setInvoice({ ...invoice, buyer })}
                      />
                      {invoice.buyerId && (
                        <button
                          disabled={busy}
                          onClick={async () => {
                            const original = buyers.find(
                              (b) => b.id === invoice.buyerId,
                            );
                            if (!original) {
                              setNotice(
                                "Load the saved buyer before updating billing details.",
                              );
                              return;
                            }
                            setBusy(true);
                            try {
                              const savedBuyer = await buyerApi.save(
                                {
                                  ...original,
                                  ...invoice.buyer,
                                  addressParts: splitBuyerAddress(
                                    invoice.buyer.address,
                                  ),
                                },
                                true,
                              );
                              if (savedBuyer.address !== invoice.buyer.address)
                                throw Error(
                                  "The server did not preserve the billing address. Your local edits are retained.",
                                );
                              setBuyers((old) =>
                                old.map((b) =>
                                  b.id === savedBuyer.id ? savedBuyer : b,
                                ),
                              );
                              setNotice("Buyer billing details saved.");
                            } catch (e) {
                              setNotice((e as Error).message);
                            } finally {
                              setBusy(false);
                            }
                          }}
                        >
                          Save Buyer
                        </button>
                      )}
                    </section>
                    <section className="card">
                      <div className="section-title">
                        <div>
                          <FileText size={19} />
                          <h2>Invoice details</h2>
                        </div>
                      </div>
                      <label className="field">
                        PDF / print paper size
                        <select
                          value={paperSize}
                          onChange={(e) =>
                            setPaperSize(e.target.value as "a4" | "a5")
                          }
                        >
                          <option value="a5">A5</option>
                          <option value="a4">A4</option>
                        </select>
                      </label>
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
                          busy ||
                          !loaded ||
                          invoice.status === "Cancelled" ||
                          invoice.documentType === "quotation"
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
                        {invoice.documentType === "quotation"
                          ? "Save Quotation"
                          : "Save to Sales as Draft"}
                      </button>
                      <button
                        onClick={async () => {
                          if (await persist(keys.draft, invoice))
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
                      <button onClick={() => setLocalDraftsOpen(true)}>
                        Local drafts
                      </button>
                      <button
                        className="text-button muted"
                        onClick={async () => {
                          if (
                            confirm(
                              "Delete the saved draft? Your current invoice will remain.",
                            )
                          )
                            try {
                              await removeSnapshot(keys.draft);
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
                        {busy
                          ? "Preparing document…"
                          : `Download ${invoice.documentType === "quotation" ? "Quotation" : "Invoice"} PDF`}
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
                        {paperSize.toUpperCase()} preview <span>·</span>{" "}
                        download &amp; print
                      </p>
                    </div>
                    <div className="help-note">
                      <ShieldCheck size={18} />
                      <p>
                        Your{" "}
                        {invoice.documentType === "quotation"
                          ? "quotation"
                          : "invoice"}{" "}
                        is saved on this device.
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
                    Saved locally until you save business details
                  </span>
                </div>
                <section className="card profile-save">
                  <div>
                    <h2>Business profile</h2>
                    <p>
                      Save seller details, bank information, assets and QR mode
                      for every device.
                    </p>
                  </div>
                  <button
                    className="primary"
                    disabled={!profileReady || profileBusy}
                    onClick={saveProfile}
                  >
                    {profileBusy ? "Saving…" : "Save business details"}
                  </button>
                  {profileError && (
                    <p role="alert">
                      {profileError}
                      <button
                        onClick={() =>
                          businessProfileApi
                            .get()
                            .then((value) => {
                              if (value)
                                setSeller((old) => ({ ...old, ...value }));
                              setProfileReady(true);
                              setProfileError("");
                            })
                            .catch((e) => setProfileError(e.message))
                        }
                      >
                        Retry profile
                      </button>
                    </p>
                  )}
                </section>
                <section className="card">
                  <h2>Local data backup and import</h2>
                  <button
                    onClick={async () => {
                      try {
                        const usage = await storageUsage();
                        const mb = (bytes: number) =>
                          (bytes / 1024 / 1024).toFixed(2);
                        setNotice(
                          `Local storage: ${mb(usage.localBytes)} MB. Browser storage: ${usage.usage === undefined ? "unavailable" : mb(usage.usage) + " MB"}; quota: ${usage.quota === undefined ? "unavailable" : mb(usage.quota) + " MB"}.`,
                        );
                      } catch (error) {
                        setNotice(storageFailure(error));
                      }
                    }}
                  >
                    Check browser storage usage
                  </button>
                  <p>
                    Existing browser data is preserved. Import copies products
                    and saved sales into an empty database, keeping current
                    stock quantities. Working drafts stay on this device; saved
                    business and UPI settings are stored in MongoDB.
                  </p>
                  <button
                    onClick={() => {
                      const data = Object.fromEntries(
                        snapshotKeys()
                          .filter(
                            (key) =>
                              Object.values(keys).includes(key) ||
                              key.startsWith("billing-app:archived-draft:"),
                          )
                          .map((key) => [key, snapshotRaw(key)]),
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
                <BusinessAssets seller={seller} onChange={setSeller} />
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
      {localDraftsOpen && (
        <Modal title="Local drafts" onClose={() => setLocalDraftsOpen(false)}>
          {snapshotKeys()
            .filter((key) => key.startsWith("billing-app:archived-draft:"))
            .map((key) => {
              const draft = read<Invoice | null>(key, null);
              return (
                draft && (
                  <p key={key}>
                    <button
                      onClick={async () => {
                        if (
                          (invoice.items.length || invoice.buyer.name) &&
                          !(await persist(
                            `billing-app:archived-draft:${invoice.id}`,
                            invoice,
                          ))
                        )
                          return;
                        setInvoice(draft);
                        setPage("billing");
                        setLocalDraftsOpen(false);
                      }}
                    >
                      {draft.number || "Unnumbered invoice"} ·{" "}
                      {draft.buyer.name || "No buyer"} · {draft.date}
                    </button>
                  </p>
                )
              );
            })}
          <p>
            Saved server drafts remain in Sales. Use Load Draft for your
            explicitly saved local draft.
          </p>
        </Modal>
      )}
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
        <Modal
          title={`Invoice preview · ${paperSize.toUpperCase()}`}
          onClose={closePreview}
          wide
        >
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
            <Suspense fallback={<p role="status">Loading invoice preview…</p>}>
              {profileReady && paymentLoaded ? (
                <InvoicePreview
                  format={paperSize}
                  invoice={invoice}
                  seller={invoiceSeller(invoice, seller)}
                  payment={{ ...savedPayment, qrMode: savedQrMode }}
                />
              ) : (
                <div role={profileError ? "alert" : "status"}>
                  {!profileReady &&
                    (profileError ||
                      "Loading saved business logo and details…")}
                  {profileError && (
                    <button
                      onClick={() => void loadBusinessProfile().catch(() => {})}
                    >
                      Retry business details
                    </button>
                  )}
                </div>
              )}
            </Suspense>
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
    </>
  );
}
