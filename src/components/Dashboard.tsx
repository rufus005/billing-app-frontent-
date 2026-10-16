import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  IndianRupee,
  ReceiptText,
  Wallet,
  Clock,
  Plus,
} from "lucide-react";
import type { Invoice, Product } from "../utils/invoiceTypes";
import { invoiceApi } from "../services/api";
import { calculate, money } from "../utils/calculations";
import { paymentSummary } from "../utils/invoicePresentation";
export function Dashboard({
  products,
  navigate,
  open,
}: {
  products: Product[];
  navigate: (page: string) => void;
  open: (i: Invoice) => void;
}) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [period, setPeriod] = useState("Daily");
  useEffect(() => {
    let active = true;
    setLoading(true);
    invoiceApi
      .list()
      .then((rows) => {
        if (active) {
          setInvoices(rows);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refresh]);
  const completed = invoices.filter(
    (i) =>
      i.status === "Completed" &&
      (!from || i.date >= from) &&
      (!to || i.date <= to),
  );
  const total = completed.reduce(
    (sum, i) => sum + (i.totals?.grand ?? calculate(i).grand),
    0,
  );
  const received = completed.reduce(
    (sum, i) => sum + (paymentSummary(i).received ?? 0),
    0,
  );
  const outstanding = completed.reduce(
    (sum, i) => sum + (paymentSummary(i).balance ?? 0),
    0,
  );
  const unknown = completed.filter(
    (i) => paymentSummary(i).balance === null,
  ).length;
  const groups = new Map<string, number>();
  for (const i of completed) {
    let key = i.date.slice(0, 10);
    if (period === "Monthly") key = key.slice(0, 7);
    if (period === "Weekly") {
      const d = new Date(key + "T12:00:00Z");
      if (!Number.isNaN(d.getTime())) {
        d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
        key = d.toISOString().slice(0, 10);
      }
    }
    groups.set(
      key,
      (groups.get(key) || 0) + (i.totals?.grand ?? calculate(i).grand),
    );
  }
  const bars = [...groups].sort(([a], [b]) => a.localeCompare(b));
  const max = Math.max(1, ...bars.map(([, value]) => value));
  const low = products
    .flatMap((p) =>
      p.variants?.length
        ? p.variants.map((v) => ({
            id: v.id,
            name: `${p.name} · ${v.color}`,
            stock: v.stock,
          }))
        : [p],
    )
    .filter((p) => p.stock <= 5);
  const payments = invoices
    .flatMap((i) =>
      (i.payments || []).map((p) => ({
        ...p,
        number: i.number,
        buyer: i.buyer.name,
      })),
    )
    .filter((p) => (!from || p.date >= from) && (!to || p.date <= to))
    .sort((a, b) => b.date.localeCompare(a.date));
  const tax = completed.reduce(
    (sum, i) => sum + (i.totals?.tax ?? calculate(i).tax),
    0,
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR BUSINESS AT A GLANCE</div>
          <h1>Business overview</h1>
          <p>Sales, collections and inventory in one place.</p>
        </div>
        <button className="primary" onClick={() => navigate("billing")}>
          <Plus size={17} /> Create invoice
        </button>
      </div>
      <div className="dashboard-banner">
        <div>
          <span className="tag">BUSINESS WORKSPACE</span>
          <h2>More clarity. Better business.</h2>
          <p>Keep track of every invoice and every rupee collected.</p>
        </div>
        <button onClick={() => navigate("sales")}>
          View sales <ArrowUpRight size={16} />
        </button>
      </div>
      <div className="dashboard-filters">
        <label>
          From date
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          To date
          <input
            type="date"
            min={from}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <button
          onClick={() => {
            setFrom("");
            setTo("");
          }}
        >
          All time
        </button>
        <button onClick={() => setRefresh((v) => v + 1)}>Refresh</button>
      </div>
      {error ? (
        <p role="alert" className="warning">
          {error}
        </p>
      ) : loading ? (
        <p role="status">Loading business overview…</p>
      ) : (
        <>
          {unknown > 0 && (
            <p className="warning">
              {unknown} historical invoice(s) have unknown receipts. Collections
              and balances below include confirmed amounts only.
            </p>
          )}
          <div className="metric-grid">
            {[
              {
                label: "Total sales",
                value: money(total),
                icon: IndianRupee,
                tone: "purple",
                hint: "Completed invoices",
              },
              {
                label: "Amount received",
                value: money(received),
                icon: Wallet,
                tone: "green",
                hint: "Confirmed collections",
              },
              {
                label: "To collect",
                value: money(outstanding),
                icon: Clock,
                tone: "orange",
                hint: "Known outstanding balance",
              },
              {
                label: "Total invoices",
                value: String(completed.length),
                icon: ReceiptText,
                tone: "blue",
                hint: "In selected date range",
              },
            ].map(({ label, value, icon: Icon, tone, hint }) => (
              <section className={`metric-card ${tone}`} key={label}>
                <span className="metric-icon">
                  <Icon size={20} />
                </span>
                <p>{label}</p>
                <strong>{value}</strong>
                <small>{hint}</small>
              </section>
            ))}
          </div>
          <div className="dashboard-grid">
            <section className="card">
              <div className="section-title">
                <div>
                  <h2>Sales performance</h2>
                  <p>{money(total)} in selected period</p>
                </div>
                <label>
                  Group by
                  <select
                    value={period}
                    onChange={(e) => setPeriod(e.target.value)}
                  >
                    {["Daily", "Weekly", "Monthly"].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="sales-chart" aria-label={`${period} sales chart`}>
                {bars.map(([date, value]) => (
                  <div className="chart-column" key={date}>
                    <small>{money(value)}</small>
                    <div
                      style={{
                        height: `${Math.max(3, (value / max) * 165)}px`,
                      }}
                      title={`${date}: ${money(value)}`}
                    />
                    <span>{date}</span>
                  </div>
                ))}
                {!bars.length && <p>No completed sales in this period.</p>}
              </div>
            </section>
            <section className="card">
              <div className="section-title">
                <h2>Stock watch</h2>
                <span className="stock-badge">{low.length} low</span>
              </div>
              <p>Products with 5 units or fewer</p>
              <div className="dashboard-list">
                {low.slice(0, 6).map((p) => (
                  <div key={p.id}>
                    <span>{p.name}</span>
                    <strong className="stock-badge">{p.stock} left</strong>
                  </div>
                ))}
                {!low.length && <p>Your stock levels look healthy.</p>}
              </div>
              <button
                className="text-button"
                onClick={() => navigate("products")}
              >
                Manage inventory <ArrowUpRight size={15} />
              </button>
            </section>
          </div>
          <section className="card">
            <div className="section-title">
              <h2>Latest transactions</h2>
              <button className="text-button" onClick={() => navigate("sales")}>
                All sales <ArrowUpRight size={15} />
              </button>
            </div>
            <div className="table-scroll">
              <table className="catalogue-table">
                <thead>
                  <tr>
                    {[
                      "Date",
                      "Invoice",
                      "Party",
                      "Payment status",
                      "Amount",
                      "",
                    ].map((h, n) => (
                      <th key={n}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {completed
                    .slice()
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .slice(0, 7)
                    .map((i) => (
                      <tr key={i.id}>
                        <td>{i.date}</td>
                        <td>
                          <strong>{i.number}</strong>
                        </td>
                        <td>{i.buyer.name || "Walk-in customer"}</td>
                        <td>
                          <span
                            className={`payment-pill ${paymentSummary(i).status.toLowerCase()}`}
                          >
                            {paymentSummary(i).status}
                          </span>
                        </td>
                        <td>{money(i.totals?.grand ?? calculate(i).grand)}</td>
                        <td>
                          <button onClick={() => open(i)}>Open</button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {!completed.length && (
              <p className="empty-dashboard">
                Your completed invoices will appear here.
              </p>
            )}
          </section>
          <div className="dashboard-grid">
            <section className="card">
              <div className="section-title">
                <h2>Recent payments</h2>
                <span className="tag">By payment date</span>
              </div>
              <div className="dashboard-list">
                {payments.slice(0, 8).map((p) => (
                  <div key={p.id}>
                    <span>
                      <strong>{p.buyer || p.number}</strong>
                      <small>
                        {p.date} · {p.method} · {p.reference || p.number}
                      </small>
                    </span>
                    <strong>{money(p.amount)}</strong>
                  </div>
                ))}
                {!payments.length && (
                  <p>
                    No dated payments recorded in this range. Earlier received
                    totals remain included in collections.
                  </p>
                )}
              </div>
            </section>
            <section className="card">
              <h2>GST summary</h2>
              <div className="total-line">
                <span>Tax on completed invoices</span>
                <strong>{money(tax)}</strong>
              </div>
              <p>Based on saved invoice totals in the selected range.</p>
              <button className="text-button" onClick={() => navigate("sales")}>
                Buyer outstanding report <ArrowUpRight size={15} />
              </button>
            </section>
          </div>
        </>
      )}
    </>
  );
}
