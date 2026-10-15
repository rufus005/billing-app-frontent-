import { paymentSummary } from "../utils/invoicePresentation";
import { useEffect, useState } from "react";
import type { Invoice } from "../utils/invoiceTypes";
import { invoiceApi } from "../services/api";
import { calculate, money } from "../utils/calculations";
export function SalesManager({
  open,
  reload,
  notify,
}: {
  open: (i: Invoice) => void;
  reload: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const [status, setStatus] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [error, setError] = useState("");
  const [sales, setSales] = useState<Invoice[]>([]),
    [search, setSearch] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(
      () =>
        invoiceApi
          .list(
            "?" +
              new URLSearchParams({
                search,
                ...(from ? { from } : {}),
                ...(to ? { to } : {}),
              }),
          )
          .then((v) => {
            if (active) {
              setSales(v);
              setError("");
            }
          })
          .catch((e) => {
            if (active) {
              setError(e.message);
              setSales([]);
            }
          }),
      200,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [search, from, to, revision]);
  const filtered = sales.filter(
    (i) =>
      (!status || i.status === status) &&
      (!paymentStatus || paymentSummary(i).status === paymentStatus),
  );
  const balances = new Map<
    string,
    { name: string; balance: number; unknown: number }
  >();
  for (const i of sales.filter((i) => i.status === "Completed")) {
    const key = i.buyerId || `${i.buyer.name}:${i.buyer.mobile}`;
    const b = balances.get(key) || {
      name: i.buyer.name,
      balance: 0,
      unknown: 0,
    };
    const p = paymentSummary(i);
    if (p.balance === null) b.unknown++;
    else b.balance += p.balance;
    balances.set(key, b);
  }
  return (
    <>
      <div className="page-heading">
        <h1>Sales</h1>
      </div>
      <section className="card">
        {error && (
          <p role="alert">
            {error}
            <button onClick={() => setRevision((v) => v + 1)}>
              Retry sales
            </button>
          </p>
        )}
        <div className="form-grid">
          <label>
            Sale status
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              {["Draft", "Completed", "Cancelled"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            Payment status
            <select
              value={paymentStatus}
              onChange={(e) => setPaymentStatus(e.target.value)}
            >
              <option value="">All</option>
              {["Paid", "Partial", "Unpaid", "Unknown"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <button
            onClick={() => {
              setSearch("");
              setFrom("");
              setTo("");
              setStatus("");
              setPaymentStatus("");
            }}
          >
            Clear filters
          </button>
          <label>
            Invoice / buyer / mobile
            <input value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <label>
            From Date
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            To Date
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
        </div>
        <div className="table-scroll">
          <table className="catalogue-table">
            <thead>
              <tr>
                {[
                  "Invoice",
                  "Buyer",
                  "Date",
                  "Status",
                  "Payment / balance",
                  "Total",
                  "Actions",
                ].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => (
                <tr key={i.id}>
                  <td>{i.number}</td>
                  <td>
                    {i.buyer.name}
                    <small>{i.buyer.mobile}</small>
                  </td>
                  <td>{i.date}</td>
                  <td>{i.status}</td>
                  <td>
                    {paymentSummary(i).status}
                    <small>
                      {paymentSummary(i).balance === null
                        ? "Received amount unavailable"
                        : money(paymentSummary(i).balance!)}
                    </small>
                  </td>
                  <td>{money(calculate(i).grand)}</td>
                  <td>
                    <button onClick={() => open(i)}>Preview / edit</button>
                    <button
                      onClick={async () => {
                        if (
                          !confirm("Cancel this invoice and restore its stock?")
                        )
                          return;
                        try {
                          await invoiceApi.save(
                            { ...i, status: "Cancelled" },
                            true,
                          );
                          setRevision((v) => v + 1);
                          await reload();
                        } catch (e) {
                          notify((e as Error).message);
                        }
                      }}
                    >
                      Cancel sale
                    </button>
                    <button
                      onClick={async () => {
                        if (
                          !confirm("Delete this invoice and restore its stock?")
                        )
                          return;
                        try {
                          await invoiceApi.remove(i);
                          setRevision((v) => v + 1);
                          await reload();
                        } catch (e) {
                          notify((e as Error).message);
                        }
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!error && !filtered.length && <p>No invoices match these filters.</p>}
      </section>
      <section className="card">
        <h2>Buyer outstanding balances</h2>
        <p>
          Completed invoices in the current search and date range. Unknown
          payments are excluded from known balances.
        </p>
        {[...balances.entries()].map(([key, b]) => (
          <p key={key}>
            <strong>{b.name || "Unnamed buyer"}</strong>: {money(b.balance)}
            {b.unknown > 0 &&
              ` · ${b.unknown} invoice(s) with payment data unavailable`}
          </p>
        ))}
        {!balances.size && <p>No completed invoices in this view.</p>}
      </section>
    </>
  );
}
