import { describe, expect, it } from "vitest";
import { normalizeQuoteInput } from "./quote-input";

const line = { sku: "TD", description: "Licencia", quantity: 21, costUnit: 10, priceUnit: 20 };
describe("quote input contract v1", () => {
  it("calculates extended totals and margin from prices, including fixed services", () => {
    const result = normalizeQuoteInput([line, { description: "Implementación", quantity: 1, costUnit: 30, priceUnit: 50, lineType: "service" }]);
    expect(result.totals).toEqual({ totalCost: 240, totalRevenue: 470, grossProfit: 230, avgMargin: 48.94 });
    expect(result.lines.map((l) => l.quantity)).toEqual([21, 1]);
  });
  it.each([0, -1, 1.5, NaN, Infinity])("rejects invalid quantity %s without rounding", (quantity) => {
    expect(() => normalizeQuoteInput([{ ...line, quantity }])).toThrow();
  });
  it("rejects missing descriptions and overflow before writing", () => {
    expect(() => normalizeQuoteInput([{ ...line, description: " " }])).toThrow();
    expect(() => normalizeQuoteInput([{ ...line, quantity: 99999999, priceUnit: 99999999 }])).toThrow("totales");
  });
  it("normalizes cents before deriving margin and supports zero-priced draft lines", () => {
    const result = normalizeQuoteInput([{ ...line, quantity: 1, costUnit: 10.005, priceUnit: 20.005 }]);
    expect(result.lines[0]).toMatchObject({ costUnit: 10.01, priceUnit: 20.01, marginPct: 49.98 });
    expect(normalizeQuoteInput([{ ...line, priceUnit: 0 }]).totals.avgMargin).toBe(0);
  });
});
