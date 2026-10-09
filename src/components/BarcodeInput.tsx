import { ScanLine, CornerDownLeft } from "lucide-react";
import { useState } from "react";
export function BarcodeInput({ onScan }: { onScan: (code: string) => void }) {
  const [code, setCode] = useState("");
  return (
    <form
      className="barcode"
      onSubmit={(e) => {
        e.preventDefault();
        if (code.trim()) {
          onScan(code.trim());
          setCode("");
        }
      }}
    >
      <ScanLine size={19} />
      <input
        aria-label="Scan barcode or enter item code"
        placeholder="Scan barcode or enter item code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      <button type="submit" title="Add scanned item">
        <CornerDownLeft size={16} />
      </button>
    </form>
  );
}
