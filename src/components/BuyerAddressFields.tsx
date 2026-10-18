import { useEffect, useId, useRef, useState } from "react";
import {
  joinBuyerAddress,
  splitBuyerAddress,
  lookupPin,
  type AddressParts,
} from "../utils/buyerAddress";

export function BuyerAddressFields({
  address,
  onChange,
}: {
  address: string;
  onChange: (address: string, parts: AddressParts) => void;
}) {
  const statusId = useId();
  const parts = splitBuyerAddress(address);
  const [lookup, setLookup] = useState("");
  const [requestedPin, setRequestedPin] = useState("");
  const latest = useRef({ address, onChange, parts });
  latest.current = { address, onChange, parts };
  const edits = useRef({ city: 0, state: 0 });
  function update(key: keyof AddressParts, value: string) {
    if (key === "city" || key === "state") edits.current[key]++;
    const next = { ...parts, [key]: value };
    onChange(joinBuyerAddress(next), next);
    if (key === "pin") {
      setRequestedPin(value);
      setLookup("");
    }
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
        if (current.parts.pin !== requestedPin) return;
        const next = {
          ...current.parts,
          city:
            edits.current.city === revision.city
              ? place.city
              : current.parts.city,
          state:
            edits.current.state === revision.state
              ? place.state
              : current.parts.state,
        };
        current.onChange(joinBuyerAddress(next), next);
        setLookup("Location found. You can edit City / District and State.");
      } catch (e) {
        if (active)
          setLookup(
            controller.signal.aborted
              ? "PIN lookup timed out. Enter City / District and State manually."
              : (e as Error).message,
          );
      } finally {
        clearTimeout(timeout);
      }
    }, 450);
    return () => {
      active = false;
      clearTimeout(timer);
      clearTimeout(timeout);
      controller.abort();
    };
  }, [requestedPin]);
  return (
    <>
      <label className="field buyer-wide">
        Address / Street / Area
        <textarea
          autoComplete="street-address"
          rows={3}
          value={parts.area}
          onChange={(e) => update("area", e.target.value)}
          placeholder="Building, street and area"
        />
      </label>
      <label className="field">
        PIN Code
        <input
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={6}
          value={parts.pin}
          onChange={(e) => update("pin", e.target.value.replace(/\D/g, ""))}
          placeholder="560062"
          aria-describedby={statusId}
        />
      </label>
      <label className="field">
        City / District
        <input
          autoComplete="address-level2"
          value={parts.city}
          onChange={(e) => update("city", e.target.value)}
        />
      </label>
      <label className="field buyer-wide">
        State
        <input
          autoComplete="address-level1"
          value={parts.state}
          onChange={(e) => update("state", e.target.value)}
        />
      </label>
      <p className="buyer-wide buyer-pin-status" id={statusId} role="status">
        {lookup ||
          "Enter a 6-digit PIN Code to look up City / District and State. You can correct either field."}
      </p>
    </>
  );
}
