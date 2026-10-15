import { useEffect, useRef, useState } from "react";
import type { BuyerRecord } from "../utils/invoiceTypes";
import { joinBuyerAddress, splitBuyerAddress, lookupPin, type AddressParts } from "../utils/buyerAddress";
export function BuyerDetailsFields({ buyer, onChange }: { buyer: BuyerRecord; onChange: (b: BuyerRecord) => void }) {
  const [parts, setParts] = useState(() => splitBuyerAddress(buyer.address));
  const [lookup, setLookup] = useState("");
  const [requestedPin, setRequestedPin] = useState("");
  const latest = useRef({ buyer, onChange, parts });
  latest.current = { buyer, onChange, parts };
  const edits = useRef({ city: 0, state: 0 });
  function update(key: keyof AddressParts, value: string) {
    if (key === "city" || key === "state") edits.current[key]++;
    const next = { ...parts, [key]: value };
    setParts(next);
    onChange({ ...buyer, address: joinBuyerAddress(next) });
    if (key === "pin") { setRequestedPin(value); setLookup(""); }
  }
  useEffect(() => {
    if (!/^[1-9]\d{5}$/.test(requestedPin)) return;
    const controller = new AbortController();
    const revision = { ...edits.current };
    let active = true;
    let timeout: ReturnType<typeof setTimeout>;
    const timer = setTimeout(async () => {
      setLookup("Looking up PIN Code…");
      timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const place = await lookupPin(requestedPin, controller.signal);
        if (!active) return;
        const current = latest.current;
        const next = { ...current.parts,
          city: edits.current.city === revision.city ? place.city : current.parts.city,
          state: edits.current.state === revision.state ? place.state : current.parts.state };
        setParts(next);
        current.onChange({ ...current.buyer, address: joinBuyerAddress(next) });
        setLookup("Location found. You can edit City / District and State.");
      } catch (e) {
        if (active) setLookup(controller.signal.aborted ? "PIN lookup timed out. Enter City / District and State manually." : (e as Error).message);
      } finally { clearTimeout(timeout); }
    }, 450);
    return () => { active = false; clearTimeout(timer); clearTimeout(timeout); controller.abort(); };
  }, [requestedPin]);
  return <div className="buyer-details-grid">
    <label className="buyer-wide">Buyer Name<input required autoComplete="organization" value={buyer.name} onChange={e => onChange({ ...buyer, name: e.target.value })} placeholder="Customer or company name" /></label>
    <label className="buyer-wide">Mobile Number<input type="tel" autoComplete="tel" value={buyer.mobile} onChange={e => onChange({ ...buyer, mobile: e.target.value })} placeholder="Mobile number" /></label>
    <label className="buyer-wide">Address / Area<textarea autoComplete="street-address" rows={3} value={parts.area} onChange={e => update("area", e.target.value)} placeholder="Building, street and area" /></label>
    <label>PIN Code<input inputMode="numeric" autoComplete="postal-code" maxLength={6} pattern="[1-9][0-9]{5}" value={parts.pin} onChange={e => update("pin", e.target.value.replace(/\D/g, ""))} placeholder="560062" aria-describedby="buyer-pin-status" /></label>
    <label>City / District<input autoComplete="address-level2" value={parts.city} onChange={e => update("city", e.target.value)} placeholder="Enter city or district" /></label>
    <label className="buyer-wide">State<input autoComplete="address-level1" value={parts.state} onChange={e => update("state", e.target.value)} placeholder="Enter state" /></label>
    <p className="buyer-wide buyer-pin-status" id="buyer-pin-status" role="status">{lookup || "Enter a 6-digit PIN Code to look up City / District and State."}</p>
    <label className="buyer-wide">GSTIN (optional)<input value={buyer.gstin} maxLength={15} onChange={e => onChange({ ...buyer, gstin: e.target.value.toUpperCase() })} placeholder="GST registration number" /></label>
  </div>;
}
