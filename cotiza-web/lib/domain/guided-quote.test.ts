import { describe, it, expect } from "vitest";
import { previewGuidedQuote } from "./guided-quote";
const input = () => ({ currency: "MXN", term: "Anual", source: "Fixture histórico COT-0066; no tarifario vigente", validUntil: "2026-10-30", asOf: "2026-10-26", minMarginPct: 19,
  fixed: [{ sku: "TDADV12N250", quantity: 480, costUnit: 395, priceUnit: 470 }, { sku: "TDADVS12N1", quantity: 20, costUnit: 1290, priceUnit: 1900 }],
  alternatives: [{ name: "100 buzones", sku: "TDEMS12N100", quantity: 100, costUnit: 310, priceUnit: 390 }, { name: "250 buzones", sku: "TDEMS12N250", quantity: 250, costUnit: 295, priceUnit: 370 }, { name: "500 buzones", sku: "TDEMS12N500", quantity: 500, costUnit: 280, priceUnit: 350 }] });
describe("guided quote preview", () => {
  it("reproduces historical HL alternatives from explicit prices without changing input", () => {
    const data = input(), before = structuredClone(data), result = previewGuidedQuote(data);
    expect(result.map(r => r.totalRevenue)).toEqual([302600,356100,438600]);
    expect(result.map(r => r.totalCost)).toEqual([246400,289150,355400]);
    expect(result.every(r => r.belowMinimum)).toBe(true);
    expect(result[2].marginPct.toFixed(1)).toBe("19.0");
    expect(data).toEqual(before);
  });
  it("compares the margin before display rounding", () => {
    const data = { ...input(), fixed: [], alternatives: [{ name: "Borde", sku: "X", quantity: 1, costUnit: 810000000.01, priceUnit: 1000000000 }] };
    const [r] = previewGuidedQuote(data);
    expect(r.marginPct.toFixed(4)).toBe("19.0000");
    expect(r.belowMinimum).toBe(true);
    data.alternatives[0].costUnit = 810000000;
    expect(previewGuidedQuote(data)[0].belowMinimum).toBe(false);
  });
  it.each(["", "2026-10-25", "2026-02-31"])("rejects missing, expired or impossible source date %s", validUntil => {
    expect(() => previewGuidedQuote({ ...input(), validUntil })).toThrow();
  });
  it("requires a source and a duration, without inferring either", () => {
    expect(() => previewGuidedQuote({ ...input(), source: "" })).toThrow();
    expect(() => previewGuidedQuote({ ...input(), term: "" })).toThrow();
  });
  it.each([NaN, Infinity, -1, 0.001])("rejects invalid monetary value %s", costUnit => {
    const data = input(); data.alternatives[0].costUnit = costUnit;
    expect(() => previewGuidedQuote(data)).toThrow();
  });
  it("requires explicit variant SKU and price, and whole positive quantities", () => {
    for (const patch of [{ sku: "" }, { priceUnit: undefined }, { quantity: 1.5 }, { quantity: 0 }]) {
      const data = input(); Object.assign(data.alternatives[0], patch);
      expect(() => previewGuidedQuote(data)).toThrow();
    }
  });
  it("rejects other currencies instead of silently converting", () => {
    expect(() => previewGuidedQuote({ ...input(), currency: "USD" })).toThrow();
  });
  it("rejects unsafe totals", () => {
    const item = { sku: "X", quantity: 1000000, costUnit: 1e9, priceUnit: 1e9 };
    expect(() => previewGuidedQuote({ ...input(), fixed: Array(100).fill(item) })).toThrow("rango");
  });
});
