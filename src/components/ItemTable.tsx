import { Trash2, PackageOpen } from "lucide-react";
import type { LineItem } from "../utils/invoiceTypes";
import { money, numeric, round } from "../utils/calculations";
export function ItemTable({
  items,
  onChange,
}: {
  items: LineItem[];
  onChange: (r: LineItem[]) => void;
}) {
  const edit = (id: string, patch: Partial<LineItem>) =>
    onChange(items.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  return (
    <div className="table-scroll">
      <table className="items-table">
        <thead>
          <tr>
            <th className="serial">#</th>
            <th>ITEM DESCRIPTION</th>
            <th>HSN CODE</th>
            <th>BILL QTY</th>
            <th>PRICE (₹)</th>
            <th className="right">AMOUNT</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((r, n) => (
            <tr key={r.id}>
              <td className="muted">{String(n + 1).padStart(2, "0")}</td>
              <td>
                <input
                  aria-label={`Item ${n + 1} description`}
                  value={r.name}
                  onChange={(e) => edit(r.id, { name: e.target.value })}
                  maxLength={180}
                />
                {r.productId && <small>Catalogue item</small>}
              </td>
              <td>
                <input
                  aria-label={`Item ${n + 1} HSN`}
                  value={r.hsn}
                  onChange={(e) => edit(r.id, { hsn: e.target.value })}
                  maxLength={12}
                />
              </td>
              <td>
                <input
                  aria-label={`Item ${n + 1} quantity`}
                  type="number"
                  min="0"
                  step="0.01"
                  value={r.qty}
                  onChange={(e) => edit(r.id, { qty: numeric(e.target.value) })}
                />
              </td>
              <td>
                <input
                  aria-label={`Item ${n + 1} price`}
                  type="number"
                  min="0"
                  step="0.01"
                  value={r.finalPrice ?? r.price}
                  onChange={(e) =>
                    edit(r.id, {
                      price: numeric(e.target.value),
                      finalPrice: numeric(e.target.value),
                    })
                  }
                />
              </td>
              <td className="right amount">
                {money(round(r.qty * (r.finalPrice ?? r.price)))}
              </td>
              <td>
                <button
                  className="icon-button danger"
                  aria-label={`Delete item ${n + 1}`}
                  onClick={() => onChange(items.filter((x) => x.id !== r.id))}
                >
                  <Trash2 size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!items.length && (
        <div className="empty">
          <div className="empty-icon">
            <PackageOpen size={30} />
          </div>
          <h3>Your invoice starts here</h3>
          <p>Add products from your catalogue or scan an item code.</p>
        </div>
      )}
    </div>
  );
}
