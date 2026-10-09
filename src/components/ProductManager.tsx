import { useState } from "react";
import { Pencil, Plus, Trash2, Search } from "lucide-react";
import type { Product } from "../utils/invoiceTypes";
import { Field } from "./Forms";
import { stockTotal, productPrice } from "../utils/products";
import { money, numeric } from "../utils/calculations";
export function ProductEditor({
  product,
  products,
  onSave,
  onCancel,
}: {
  product?: Product;
  products: Product[];
  onSave: (p: Product) => void;
  onCancel: () => void;
}) {
  const [p, setP] = useState<Product>(
    product || {
      id: crypto.randomUUID(),
      name: "",
      code: "",
      barcode: "",
      hsn: "940320",
      category: "Shoe racks",
      price: 0,
      stock: 0,
    },
  );
  const [error, setError] = useState("");
  return (
    <form
      className="product-editor"
      onSubmit={(e) => {
        e.preventDefault();
        if (!p.name.trim() || !p.code.trim()) {
          setError("Product name and item code are required.");
          return;
        }
        const identifiers = [p.code, p.barcode]
          .filter(Boolean)
          .map((x) => x.trim().toLowerCase());
        if (
          products.some(
            (x) =>
              x.id !== p.id &&
              [x.code, x.barcode].some(
                (c) => c && identifiers.includes(c.toLowerCase()),
              ),
          )
        ) {
          setError("This item code or barcode is already in use.");
          return;
        }
        onSave({
          ...p,
          name: p.name.trim(),
          code: p.code.trim(),
          barcode: p.barcode.trim(),
        });
      }}
    >
      <div className="form-grid">
        {(
          Object.entries({
            name: "Product name",
            code: "Item code / SKU",
            barcode: "Barcode",
            hsn: "HSN code",
            category: "Category",
          }) as [keyof Product, string][]
        ).map(([k, label]) => (
          <Field
            key={k}
            label={label}
            value={String(p[k])}
            onChange={(v) => setP({ ...p, [k]: v })}
            maxLength={k === "name" ? 180 : 50}
          />
        ))}
        {(["price", "stock", "gstPercent"] as const).map((k) => (
          <Field
            key={k}
            label={
              k === "price"
                ? "Normal price (GST inclusive)"
                : k === "stock"
                  ? "Stock"
                  : "GST Percent"
            }
            type="number"
            value={String(p[k] ?? 18)}
            onChange={(v) => setP({ ...p, [k]: numeric(v) })}
          />
        ))}
      </div>
      <fieldset className="variant-editor">
        <legend>Color variants</legend>
        {(p.variants || []).map((variant, index) => (
          <div key={variant.id} className="card">
            <div className="form-grid">
              {(
                ["color", "hex", "code", "barcode", "price", "stock"] as const
              ).map((k) => (
                <Field
                  key={k}
                  label={`Variant ${index + 1} ${k}`}
                  type={
                    k === "price" || k === "stock"
                      ? "number"
                      : k === "hex"
                        ? "color"
                        : "text"
                  }
                  value={String(variant[k])}
                  onChange={(value) =>
                    setP({
                      ...p,
                      variants: p.variants?.map((v) =>
                        v.id === variant.id
                          ? {
                              ...v,
                              [k]:
                                k === "price" || k === "stock"
                                  ? numeric(value)
                                  : value,
                            }
                          : v,
                      ),
                    })
                  }
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() =>
                setP({
                  ...p,
                  variants: p.variants?.filter((v) => v.id !== variant.id),
                })
              }
            >
              Remove variant
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            setP({
              ...p,
              variants: [
                ...(p.variants || []),
                {
                  id: crypto.randomUUID(),
                  color: "",
                  hex: "#808080",
                  code: "",
                  barcode: "",
                  price: p.price,
                  stock: 0,
                },
              ],
            })
          }
        >
          Add color variant
        </button>
      </fieldset>
      {error && (
        <p role="alert" className="warning">
          {error}
        </p>
      )}
      <div className="editor-actions">
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button className="primary" type="submit">
          Save product
        </button>
      </div>
    </form>
  );
}
export function ProductManager({
  products,
  onChange,
}: {
  products: Product[];
  onChange: (p: Product[]) => void;
}) {
  const [edit, setEdit] = useState<Product | null | undefined>(undefined);
  const [search, setSearch] = useState("");
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR INVENTORY</div>
          <h1>Product catalogue</h1>
          <p>Keep your products ready for the next sale.</p>
        </div>
        <button className="primary" onClick={() => setEdit(null)}>
          <Plus size={17} />
          Create product
        </button>
      </div>
      <section className="card">
        {edit !== undefined ? (
          <>
            <div className="section-title">
              <h2>{edit ? "Edit product" : "New product"}</h2>
            </div>
            <ProductEditor
              key={edit?.id || "new"}
              product={edit || undefined}
              products={products}
              onCancel={() => setEdit(undefined)}
              onSave={(p) => {
                onChange(
                  products.some((x) => x.id === p.id)
                    ? products.map((x) => (x.id === p.id ? p : x))
                    : [...products, p],
                );
                setEdit(undefined);
              }}
            />
          </>
        ) : (
          <>
            <div className="catalogue-toolbar">
              <div className="search-box">
                <Search size={17} />
                <input
                  aria-label="Search catalogue"
                  placeholder="Search your products…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <span className="muted">{products.length} products</span>
            </div>
            <div className="table-scroll">
              <table className="catalogue-table">
                <thead>
                  <tr>
                    <th>PRODUCT NAME</th>
                    <th>ITEM CODE</th>
                    <th>CATEGORY</th>
                    <th>STOCK</th>
                    <th>NORMAL PRICE</th>
                    <th>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {products
                    .filter((p) =>
                      Object.values(p)
                        .join(" ")
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                    )
                    .map((p) => (
                      <tr key={p.id}>
                        <td>
                          <strong>{p.name}</strong>
                          <small>
                            HSN {p.hsn} · {p.barcode || "No barcode"}
                          </small>
                        </td>
                        <td>{p.code}</td>
                        <td>{p.category}</td>
                        <td>{stockTotal(p)} PCS</td>
                        <td>{money(productPrice(p))}</td>
                        <td>
                          <button
                            className="icon-button"
                            aria-label={`Edit ${p.name}`}
                            onClick={() => setEdit(p)}
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            className="icon-button danger"
                            aria-label={`Delete ${p.name}`}
                            onClick={() => {
                              if (
                                confirm(
                                  `Delete ${p.name} from the catalogue? Existing invoice rows are kept.`,
                                )
                              )
                                onChange(products.filter((x) => x.id !== p.id));
                            }}
                          >
                            <Trash2 size={16} />
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
