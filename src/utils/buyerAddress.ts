export interface AddressParts { area: string; pin: string; city: string; state: string }
// Keep the existing address API contract; only parse the explicit suffix we write.
export function splitBuyerAddress(address: string): AddressParts {
  const match = /^(.*?)\nCity \/ District: ([^\n]*)\nState: ([^\n]*)\nPIN Code: (\d{6}|)$/s.exec(address);
  return match ? { area: match[1], city: match[2], state: match[3], pin: match[4] } : { area: address, city: "", state: "", pin: "" };
}
export function joinBuyerAddress(a: AddressParts) {
  if (!a.pin && !a.city && !a.state) return a.area;
  return `${a.area}\nCity / District: ${a.city}\nState: ${a.state}\nPIN Code: ${a.pin}`;
}
export async function lookupPin(pin: string, signal: AbortSignal) {
  if (!/^[1-9]\d{5}$/.test(pin)) throw Error("Enter a valid 6-digit PIN Code.");
  const response = await fetch(`https://api.pincodeapi.in/api/v1/pincode/${pin}`, { signal, credentials: "omit" });
  if (!response.ok) throw Error("PIN lookup unavailable. Enter City / District and State manually.");
  const result = await response.json();
  const offices = result?.data?.post_offices;
  if (!result.success || result.data.pincode !== pin || !Array.isArray(offices) || !offices.length)
    throw Error("PIN Code not found. Check it or enter address details manually.");
  const places = offices.filter((p: { district?: unknown; state?: unknown }) => typeof p.district === "string" && typeof p.state === "string");
  if (!places.length || places.some(p => p.district !== places[0].district || p.state !== places[0].state))
    throw Error("Multiple locations found. Enter City / District and State manually.");
  return { city: places[0].district as string, state: places[0].state as string };
}
