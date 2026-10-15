import { BuyerDetailsFields } from "./BuyerDetailsFields";
import { useState } from "react";
import type { BuyerRecord, BuyerPrice, Product } from "../utils/invoiceTypes";
import { buyerApi, buyerPriceApi } from "../services/api";
import { Field } from "./Forms";
import { money } from "../utils/calculations";
export function BuyerSelector({
  buyers,
  value,
  onChange,
}: {
  buyers: BuyerRecord[];
  value?: string;
  onChange: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  return (
    <div className="form-grid">
      <Field label="Search buyers" value={search} onChange={setSearch} />
      <label>
        Buyer
        <select
          aria-label="Buyer"
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Walk-in / no saved buyer</option>
          {buyers
            .filter(
              (b) =>
                b.id === value ||
                (b.active &&
                  [b.name, b.mobile, b.gstin]
                    .join(" ")
                    .toLowerCase()
                    .includes(search.toLowerCase())),
            )
            .map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} · {b.mobile}
              </option>
            ))}
        </select>
      </label>
    </div>
  );
}
export function BuyerManager({
  buyers,
  reload,
  notify,
}: {
  buyers: BuyerRecord[];
  reload: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const [edit, setEdit] = useState<BuyerRecord | null>(null),
    [search, setSearch] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <>
      <div className="page-heading">
        <h1>Buyers</h1>
        <button
          className="primary"
          onClick={() =>
            setEdit({
              id: crypto.randomUUID(),
              name: "",
              mobile: "",
              address: "",
              gstin: "",
              email: "",
              notes: "",
              active: true,
            })
          }
        >
          Create Buyer
        </button>
      </div>
      <section className="card">
        {edit ? (
          <form
            className="buyer-editor"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await buyerApi.save(
                  edit,
                  buyers.some((b) => b.id === edit.id),
                );
                await reload();
                setEdit(null);
              } catch (e) {
                notify((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <h2>Buyer Details</h2>
            <BuyerDetailsFields key={edit.id} buyer={edit} onChange={setEdit} />
            <div className="form-grid buyer-extra-fields">
              {(
                [
                  "email",
                  "notes",
                ] as const
              ).map((k) => (
                <Field
                  key={k}
                  label={k === "email" ? "Email (optional)" : "Notes (optional)"}
                  value={edit[k]}
                  onChange={(v) => setEdit({ ...edit, [k]: v })}
                />
              ))}
              <label className="buyer-active">
                <input
                  type="checkbox"
                  checked={edit.active}
                  onChange={(e) =>
                    setEdit({ ...edit, active: e.target.checked })
                  }
                />{" "}
                Active
              </label>
            </div>
            <div className="buyer-actions">
              <button type="button" onClick={() => setEdit(null)}>Cancel</button>
              <button className="primary" disabled={busy}>Save Buyer</button>
            </div>
          </form>
        ) : (
          <>
            <Field
              label="Search buyers by name, mobile or GSTIN"
              value={search}
              onChange={setSearch}
            />
            <div className="table-scroll">
              <table className="catalogue-table">
                <thead>
                  <tr>
                    <th>Buyer</th>
                    <th>Mobile</th>
                    <th>GSTIN</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {buyers
                    .filter((b) =>
                      [b.name, b.mobile, b.gstin]
                        .join(" ")
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                    )
                    .map((b) => (
                      <tr key={b.id}>
                        <td>
                          <strong>{b.name}</strong>
                          <small>{b.address}</small>
                        </td>
                        <td>{b.mobile}</td>
                        <td>{b.gstin}</td>
                        <td>{b.active ? "Active" : "Inactive"}</td>
                        <td>
                          <button onClick={() => setEdit(b)}>
                            View / Edit
                          </button>
                          <button
                            onClick={async () => {
                              if (
                                !confirm(
                                  `Delete ${b.name}? Saved invoices are preserved.`,
                                )
                              )
                                return;
                              try {
                                await buyerApi.remove(b);
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
          </>
        )}
      </section>
    </>
  );
}
function PriceRow({
  product,
  variant,
  buyer,
  rates,
  reload,
  notify,
}: {
  product: Product;
  variant?: NonNullable<Product["variants"]>[number];
  buyer: string;
  rates: BuyerPrice[];
  reload: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const rate = rates.find(
    (r) =>
      r.buyer === buyer &&
      r.product === product.id &&
      r.variant === (variant?.id || ""),
  );
  const normal = variant?.price ?? product.price;
  const [value, setValue] = useState(rate ? String(rate.price) : ""),
    [busy, setBusy] = useState(false);
  const run = async (remove = false) => {
    if (!buyer) return;
    setBusy(true);
    try {
      if (remove && rate) await buyerPriceApi.remove(rate);
      else {
        if (
          value === "" ||
          !Number.isFinite(Number(value)) ||
          Number(value) < 0
        )
          throw Error("Enter a valid buyer price.");
        await buyerPriceApi.save(
          {
            id: rate?.id || crypto.randomUUID(),
            buyer,
            product: product.id,
            variant: variant?.id || "",
            price: Number(value),
            active: true,
            updatedAt: rate?.updatedAt,
          },
          !!rate,
        );
      }
      await reload();
      notify("Buyer price list saved.");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <tr>
      <td>
        {product.name}
        {variant ? " · " + variant.color : ""}
      </td>
      <td>{product.hsn}</td>
      <td>{money(normal)}</td>
      <td>
        <input
          aria-label={`Buyer price ${product.name}${variant ? " " + variant.color : ""}`}
          type="number"
          min="0"
          step="0.01"
          value={value}
          placeholder="Normal price"
          onChange={(e) => setValue(e.target.value)}
        />
      </td>
      <td>{money(normal - (rate?.price ?? normal))}</td>
      <td>
        <button disabled={busy} onClick={() => run()}>
          Save price
        </button>
        {rate && (
          <button disabled={busy} onClick={() => run(true)}>
            Reset
          </button>
        )}
      </td>
    </tr>
  );
}
export function PriceManager({
  buyers,
  products,
  rates,
  reload,
  notify,
}: {
  buyers: BuyerRecord[];
  products: Product[];
  rates: BuyerPrice[];
  reload: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const [buyer, setBuyer] = useState(""),
    [search, setSearch] = useState("");
  return (
    <>
      <div className="page-heading">
        <h1>Buyer Price List</h1>
      </div>
      <section className="card">
        <BuyerSelector buyers={buyers} value={buyer} onChange={setBuyer} />
        <Field label="Search products" value={search} onChange={setSearch} />
        {buyer && (
          <div className="table-scroll">
            <table className="catalogue-table">
              <thead>
                <tr>
                  {[
                    "Product",
                    "HSN",
                    "Normal Price",
                    "Buyer Price",
                    "Difference",
                    "Actions",
                  ].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {products
                  .filter((p) =>
                    [p.name, p.code, p.hsn]
                      .join(" ")
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                  )
                  .flatMap((p) =>
                    (p.variants?.length ? p.variants : [undefined]).map((v) => (
                      <PriceRow
                        key={
                          buyer + p.id + (v?.id || "") + JSON.stringify(rates)
                        }
                        product={p}
                        variant={v}
                        buyer={buyer}
                        rates={rates}
                        reload={reload}
                        notify={notify}
                      />
                    )),
                  )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
