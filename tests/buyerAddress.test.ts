import { describe, it, expect, vi, afterEach } from "vitest";
import { splitBuyerAddress, joinBuyerAddress, lookupPin } from "../src/utils/buyerAddress";
afterEach(() => vi.unstubAllGlobals());
describe("compatible buyer addresses", () => {
 it("preserves legacy addresses unchanged", () => {
  const address = "Building 42\nBengaluru, Karnataka 560062";
  expect(joinBuyerAddress(splitBuyerAddress(address))).toBe(address);
 });
 it("round trips all new fields through the existing address string", () => {
  const parts = { area: "House 5\nMain Road", pin: "560062", city: "Bengaluru", state: "Karnataka" };
  expect(splitBuyerAddress(joinBuyerAddress(parts))).toEqual(parts);
 });
 it("preserves other fields while a PIN is being typed or deleted", () => {
  for (const pin of ["", "5", "56", "560", "5600", "56006", "560062"]) {
   const parts = {area:"Main Road",pin,city:"Bengaluru",state:"Karnataka"};
   expect(splitBuyerAddress(joinBuyerAddress(parts))).toEqual(parts);
  }
 });
 it("rejects malformed pins without making a request", async () => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  await expect(lookupPin("012345", new AbortController().signal)).rejects.toThrow("6-digit");
  expect(fetch).not.toHaveBeenCalled();
 });
 it("validates successful responses and handles outages", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ok:true, json: async () => ({success:true,data:{pincode:"560062",post_offices:[{district:"Bengaluru Urban",state:"Karnataka"}]}})}));
  expect(await lookupPin("560062", new AbortController().signal)).toEqual({city:"Bengaluru Urban", state:"Karnataka"});
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ok:false}));
  await expect(lookupPin("560062", new AbortController().signal)).rejects.toThrow("manually");
 });
});
