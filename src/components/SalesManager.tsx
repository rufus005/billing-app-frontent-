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
            if (active) setSales(v);
          })
          .catch((e) => {
            if (active) notify(e.message);
          }),
      200,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [search, from, to, revision]);
  return (
    <>
      <div className="page-heading">
        <h1>Sales</h1>
      </div>
      <section className="card">
        <div className="form-grid">
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
                {["Invoice", "Buyer", "Date", "Status", "Total", "Actions"].map(
                  (h) => (
                    <th key={h}>{h}</th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {sales.map((i) => (
                <tr key={i.id}>
                  <td>{i.number}</td>
                  <td>
                    {i.buyer.name}
                    <small>{i.buyer.mobile}</small>
                  </td>
                  <td>{i.date}</td>
                  <td>{i.status}</td>
                  <td>{money(calculate(i).grand)}</td>
                  <td>
                    <button onClick={() => open(i)}>Open</button>
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
      </section>
    </>
  );
}
