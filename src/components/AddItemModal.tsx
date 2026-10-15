import { useState, useCallback } from "react";
import { Search, ScanLine, Plus, Check } from "lucide-react";
import type { Product } from "../utils/invoiceTypes";
import { money, numeric } from "../utils/calculations";
import { Modal } from "./Modal";
import type { Selection } from "../utils/products";
import { ProductEditor } from "./ProductManager";
export function AddItemModal({
  products: catalogue,
  onProducts,
  onAdd,
  onClose,
}: {
  products: Product[];
  onProducts: (p: Product[]) => void;
  onAdd: (selection: Selection[]) => void;
  onClose: () => void;
}) {
  const products = catalogue.flatMap((p) =>
    p.variants?.length
      ? p.variants.map((v) => ({
          ...p,
          id: JSON.stringify([p.id, v.id]),
          name: p.name + " - " + v.color,
          code: v.code,
          barcode: v.barcode,
          price: v.price,
          stock: v.stock,
        }))
      : [p],
  );
  const [search, setSearch] = useState(""),
    [category, setCategory] = useState(""),
    [selected, setSelected] = useState<Record<string, number>>({}),
    [creating, setCreating] = useState(false);
  const close = useCallback(onClose, [onClose]);
  const filtered = products.filter(
    (p) =>
      (!category || p.category === category) &&
      [p.name, p.code, p.barcode, p.hsn, p.category]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const chosen = products.filter((p) => selected[p.id] > 0);
  const submit = () => {
    if (chosen.length)
      onAdd(
        chosen.map((row) => {
          const product = catalogue.find(
            (p) =>
              p.id === row.id ||
              p.variants?.some((v) => JSON.stringify([p.id, v.id]) === row.id),
          )!;
          return {
            product,
            variant: product.variants?.find(
              (v) => JSON.stringify([product.id, v.id]) === row.id,
            ),
            qty: selected[row.id],
          };
        }),
      );
  };
  return (
    <Modal
      title={creating ? "Create New Item" : "Add Items to Bill"}
      onClose={close}
      wide
    >
      {creating ? (
        <ProductEditor
          products={catalogue}
          onSave={(p) => {
            onProducts([...catalogue, p]);
            setCreating(false);
            setSelected({ ...selected, [p.id]: 1 });
          }}
          onCancel={() => setCreating(false)}
        />
      ) : (
        <div
          className="picker-content"
          onKeyDown={(e) => {
            if (e.key === "F7") {
              e.preventDefault();
              submit();
            }
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              const rows = Array.from(
                e.currentTarget.querySelectorAll<HTMLElement>("[data-row]"),
              );
              const index = rows.indexOf(document.activeElement as HTMLElement);
              if (index >= 0) {
                e.preventDefault();
                rows[
                  Math.max(
                    0,
                    Math.min(
                      rows.length - 1,
                      index + (e.key === "ArrowDown" ? 1 : -1),
                    ),
                  )
                ]?.focus();
              }
            }
          }}
        >
          <div className="picker-toolbar">
            <div className="search-box">
              <Search size={17} />
              <input
                aria-label="Search products"
                placeholder="Search by item name / Item code / HSN / SKU"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <ScanLine size={17} />
            </div>
            <select
              aria-label="Select category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">All categories</option>
              {[...new Set(products.map((p) => p.category))].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <button className="primary" onClick={() => setCreating(true)}>
              <Plus size={16} />
              Create New Item
            </button>
          </div>
          <div className="picker-table table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Item Name</th>
                  <th>Item Code</th>
                  <th>Stock</th>
                  <th>Normal Price</th>
                  <th>Quantity / Add</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr
                    key={p.id}
                    className={selected[p.id] > 0 ? "selected" : ""}
                  >
                    <td>
                      <strong>{p.name}</strong>
                      <small>
                        HSN {p.hsn} · {p.category}
                      </small>
                    </td>
                    <td>{p.code}</td>
                    <td>
                      {p.stock} PCS
                      {p.stock <= 5 && (
                        <small className="stock-warning">
                          {p.stock <= 0 ? "Out of stock" : "Low stock (≤ 5)"}
                        </small>
                      )}
                    </td>
                    <td>{money(p.price)}</td>
                    <td>
                      {selected[p.id] > 0 ? (
                        <div className="quantity-stepper">
                          <button
                            aria-label={`Remove one ${p.name}`}
                            onClick={() =>
                              setSelected({
                                ...selected,
                                [p.id]: Math.max(0, selected[p.id] - 1),
                              })
                            }
                          >
                            −
                          </button>
                          <input
                            data-row
                            aria-label={`Quantity ${p.name}`}
                            type="number"
                            min="0"
                            step="0.01"
                            value={selected[p.id]}
                            onChange={(e) =>
                              setSelected({
                                ...selected,
                                [p.id]: numeric(e.target.value),
                              })
                            }
                          />
                          <button
                            aria-label={`Add one ${p.name}`}
                            onClick={() =>
                              setSelected({
                                ...selected,
                                [p.id]: selected[p.id] + 1,
                              })
                            }
                          >
                            +
                          </button>
                        </div>
                      ) : (
                        <button
                          data-row
                          className="add-product"
                          onClick={() =>
                            setSelected({ ...selected, [p.id]: 1 })
                          }
                        >
                          + Add
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filtered.length && (
              <div className="empty">
                <Search size={26} />
                <h3>No products found</h3>
                <p>Try another code or create a new item.</p>
              </div>
            )}
          </div>
          <div className="selection-bar">
            <span>
              <Check size={15} />
              {chosen.length} item{chosen.length === 1 ? "" : "s"} selected
            </span>
            <strong>
              {money(chosen.reduce((s, p) => s + p.price * selected[p.id], 0))}
            </strong>
            <span>{chosen.reduce((s, p) => s + selected[p.id], 0)} units</span>
          </div>
          <footer>
            <span className="keyboard-help">
              Navigate <kbd>↑</kbd> <kbd>↓</kbd> · Select <kbd>Enter</kbd>
            </span>
            <div>
              <button onClick={onClose}>
                Cancel <span className="shortcut">[Esc]</span>
              </button>
              <button
                className="primary"
                disabled={!chosen.length}
                onClick={submit}
              >
                Add to Bill <span className="shortcut">[F7]</span>
              </button>
            </div>
          </footer>
        </div>
      )}
    </Modal>
  );
}
