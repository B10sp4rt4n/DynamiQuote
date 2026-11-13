import { afterEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ document: vi.fn(), destroy: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("unpdf", () => ({ getDocumentProxy: mock.document }));
import { readThreatDownPdf } from "./threatdown-pdf";

type Item = { str: string; transform: number[]; width: number };
const item = (str: string, x: number, y: number, width = 100): Item => ({ str, transform: [1, 0, 0, 1, x, y], width });

// Synthetic cells with the vendor's right-aligned layout, never customer PDFs.
function cells() {
  return [
    ...["ThreatDown Limited", "Quote #: Q-123456", "Expires On: 11/30/2026",
      "BILL TO:   LICENSE TO: (If Applicable)", "Partner   Cliente de prueba",
      "Subscription Start Date: 11/01/2026", "Subscription End Date: 10/31/2029",
      "Subscription Term: 36", "PURCHASE SUMMARY", "PRODUCT NUMBER PRODUCT NAME QTY Standard MSRP ITEM DISC CUSTOMER TOTAL PARTNER DISC NET UNIT NET TOTAL"]
      .map((text, i) => item(text, 39.5, 600 - i * 12)),
    item("TDADVS36B1", 39.5, 450, 51.13), item("ThreatDown Advanced EDR Server", 118.7, 450, 126.26),
    item("2", 386.95, 450, 8.90), item("USD 300.00", 433.32, 450, 43.58),
    item("10.00", 489.39, 450, 20.02), item("USD 540.00", 527.45, 450, 50.25),
    item("35.00", 600.99, 450, 20.02), item("USD", 668.81, 450, 16.89),
    item("USD 246.90", 700.25, 450, 50.25),
    item("(Endpoint Detection & Response for Server, Patch Management,", 118.7, 440, 229.44),
    item("123.45", 661.24, 440, 24.46),
    item("Ransomware Rollback and more)", 118.7, 430, 140),
    item("MPSNC36S01 ThreatDown Standard Support 1 USD 0.00 0.00 USD 0.00 20.00 USD 0.00 USD 0.00", 39.5, 420),
    item("Subtotal USD 246.90", 39.5, 410), item("Terms and Conditions", 39.5, 390),
  ];
}

async function read(items: Item[]) {
  mock.document.mockResolvedValue({ numPages: 1, getPage: async () => ({ getTextContent: async () => ({ items }) }),
    loadingTask: { destroy: mock.destroy } });
  return readThreatDownPdf(new TextEncoder().encode("%PDF-synthetic"));
}

afterEach(() => vi.clearAllMocks());

describe("ThreatDown monetary cells that wrap onto a second line", () => {
  it("joins the NET UNIT amount in its own column, preserving description, quantity and free support", async () => {
    const quote = await read(cells());
    expect(quote.lines[0]).toMatchObject({ quantity: 2, costUnit: 123.45, netTotal: 246.90,
      description: "ThreatDown Advanced EDR Server (Endpoint Detection & Response for Server, Patch Management, Ransomware Rollback and more)" });
    expect(quote.lines[1]).toMatchObject({ quantity: 1, costUnit: 0, netTotal: 0 });
    expect(quote.netTotal).toBe(246.90);
    expect(mock.destroy).toHaveBeenCalledOnce();
  });

  it("keeps NET UNIT distinct from a wrapped MSRP in the same row", async () => {
    const rows = cells();
    const msrp = rows.find(cell => cell.str === "USD 300.00")!;
    const right = msrp.transform[4] + msrp.width;
    msrp.str = "USD"; msrp.transform[4] = right - 16.89; msrp.width = 16.89;
    rows.push(item("300.00", right - 24.46, 440, 24.46));
    expect((await read(rows)).lines[0].costUnit).toBe(123.45);
  });

  it("preserves the original one-line price format", async () => {
    const rows = cells().filter(cell => cell.str !== "123.45");
    rows.find(cell => cell.str === "USD")!.str = "USD 123.45";
    expect((await read(rows)).lines[0].costUnit).toBe(123.45);
  });

  it("rejects a number from another column instead of guessing the unit cost", async () => {
    const rows = cells(); rows.find(cell => cell.str === "123.45")!.transform[4] = 540;
    await expect(read(rows)).rejects.toThrow("partida completa");
    expect(mock.destroy).toHaveBeenCalledOnce();
  });

  it("rejects ambiguous amounts and does not derive a missing unit price from the total", async () => {
    await expect(read([...cells(), item("99.99", 661.24, 435, 24.46)])).rejects.toThrow("partida completa");
    await expect(read(cells().filter(cell => cell.str !== "123.45"))).rejects.toThrow("partida completa");
  });

  it("never takes a wrapped amount from the next SKU", async () => {
    const rows = cells(); rows.find(cell => cell.str === "123.45")!.transform[5] = 415;
    await expect(read(rows)).rejects.toThrow("partida completa");
  });

  it("still rejects unit costs that do not reconcile with the line total", async () => {
    const rows = cells(); rows.find(cell => cell.str === "123.45")!.str = "999.99";
    await expect(read(rows)).rejects.toThrow("costo unitario");
  });
});
