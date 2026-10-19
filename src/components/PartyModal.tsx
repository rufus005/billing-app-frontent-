import { useState, useCallback } from "react";
import type { BuyerRecord } from "../utils/invoiceTypes";
import { buyerApi } from "../services/api";
import { BuyerDetailsFields } from "./BuyerDetailsFields";
import { Modal } from "./Modal";
export function PartyModal({
  buyer,
  exists = false,
  onClose,
  onSaved,
}: {
  buyer?: BuyerRecord;
  exists?: boolean;
  onClose: () => void;
  onSaved: (buyer: BuyerRecord, keepOpen?: boolean) => void;
}) {
  const [edit, setEdit] = useState<BuyerRecord>(
    () =>
      buyer || {
        id: crypto.randomUUID(),
        name: "",
        mobile: "",
        address: "",
        gstin: "",
        email: "",
        notes: "",
        active: true,
      },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const close = useCallback(() => {
    if (!busy) onClose();
  }, [busy, onClose]);
  return (
    <Modal
      title={exists ? "Edit Party" : "Create New Party"}
      wide
      onClose={close}
    >
      <form
        autoComplete="off"
        className="buyer-editor"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!edit.name.trim()) {
            setError("Enter a party name in Basic Details.");
            return;
          }
          const keepOpen =
            (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") ===
            "new";
          setBusy(true);
          setError("");
          try {
            const saved = await buyerApi.save(edit, exists);
            onSaved(saved, keepOpen);
            if (keepOpen)
              setEdit({
                id: crypto.randomUUID(),
                name: "",
                mobile: "",
                address: "",
                gstin: "",
                email: "",
                notes: "",
                active: true,
              });
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <BuyerDetailsFields key={edit.id} buyer={edit} onChange={setEdit} />
        {error && (
          <p role="alert" className="warning">
            {error}
          </p>
        )}
        <div className="buyer-actions">
          <label className="buyer-active">
            <input
              type="checkbox"
              checked={edit.active}
              onChange={(e) => setEdit({ ...edit, active: e.target.checked })}
            />{" "}
            Active
          </label>
          <button type="button" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          {!exists && (
            <button type="submit" value="new" disabled={busy}>
              Save &amp; New
            </button>
          )}
          <button className="primary" disabled={busy}>
            {busy ? "Saving…" : "Save Buyer"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
