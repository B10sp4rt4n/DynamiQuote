import { describe, expect, it } from "vitest";
import { parseThreatDownQuote, threatDownItemInput } from "./threatdown-quote";

export const vendorText = `ThreatDown Limited
Quotation - Preliminary
Quote #: Q-123456
Expires On: 11/19/2026
BILL TO:                  LICENSE TO: (If Applicable)
Partner                   Cliente de prueba
Subscription Start Date: 10/23/2026       Auto Renew: No
Subscription End Date: 10/22/2027         Subscription Term: 12
PURCHASE SUMMARY
PRODUCT NUMBER PRODUCT NAME QTY Standard MSRP ITEM DISC CUSTOMER TOTAL PARTNER DISC NET UNIT NET TOTAL
TDADV12B1 ThreatDown Advanced EDR 5 USD 79.00 55.50 USD 175.80 10.00 USD 10.25 USD 51.25
(Endpoint Detection & Response)
TDEMS12B100 ThreatDown Email Security 245 USD 38.58 30.00 USD 6,617.45 10.00 USD 2.10 USD 514.50
MPSNC12S01 ThreatDown Standard Support 1 USD 0.00 0.00 USD 0.00 20.00 USD 0.00 USD 0.00
Subtotal USD 565.75
Terms and Conditions`;

describe("ThreatDown quote adapter", () => {
  it("takes NET UNIT PRICE as cost, preserves zero support, quantities and subscription fields", () => {
    const q = parseThreatDownQuote(vendorText);
    expect(q).toMatchObject({ quoteNumber: "Q-123456", licenseTo: "Cliente de prueba", currency: "USD", termMonths: 12, startsOn: "2026-10-23", endsOn: "2027-10-22", netTotal: 565.75, preliminary: true });
    expect(q.lines.map((l) => l.costUnit)).toEqual([10.25, 2.10, 0]);
    expect(q.lines.map((l) => l.quantity)).toEqual([5, 245, 1]);
  });
  it("imports only product data and leaves all commercial values to Cotiza", () => {
    const q = parseThreatDownQuote(vendorText);
    const items = threatDownItemInput(q);
    expect(items.lines.map(({ sku, description, quantity }) => ({ sku, description, quantity })))
      .toEqual(q.lines.map(({ sku, description, quantity }) => ({ sku, description, quantity })));
    expect(items.lines.every(l => l.costUnit === 0 && l.priceUnit === 0 && l.marginPct === 0)).toBe(true);
    expect(items.lines[2].lineType).toBe("service");
    expect(items.totals).toEqual({ totalCost: 0, totalRevenue: 0, grossProfit: 0, avgMargin: 0 });
  });
  it.each([
    vendorText.replace("Subtotal USD 565.75", "Subtotal USD 566.75"),
    vendorText.replace("USD 10.25 USD 51.25", "USD 12.25 USD 51.25"),
    vendorText.replace("245 USD", "2.45 USD"),
    vendorText.replace("TDEMS12B100", "TDADV12B1"),
    vendorText.replace("10/22/2027", "02/30/2027"),
    vendorText.replaceAll("USD", "EUR"),
    vendorText.replace("ThreatDown Limited", "Other Vendor"),
  ])("fails closed for incomplete rows, currency, dates or arithmetic", (text) => {
    expect(() => parseThreatDownQuote(text)).toThrow();
  });
});
