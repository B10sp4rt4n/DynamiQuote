import { beforeEach, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ find: vi.fn(), create: vi.fn(), update: vi.fn(), line: vi.fn(), read: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { $transaction: (fn: (tx: unknown) => unknown) => fn({
  $executeRaw: async () => 0,
  quote: { findFirst: m.find, count: async () => 1, create: m.create, update: m.update },
  quote_lines: { findMany: m.read, deleteMany: async () => 0, create: m.line },
  proposals: { findFirst: async () => null },
}) } }));
import { updateQuoteLinesByTenant } from "./quote-editor";

beforeEach(() => {
  vi.clearAllMocks();
  m.read.mockResolvedValue([]);
  m.line.mockImplementation(async ({ data }) => {
    m.read.mockResolvedValue([{ ...data, quantity: new Prisma.Decimal(data.quantity),
      cost_unit: new Prisma.Decimal(data.cost_unit), final_price_unit: new Prisma.Decimal(data.final_price_unit),
      margin_pct: new Prisma.Decimal(data.margin_pct) }]);
  });
});

it.each([false, true])("preserves USD costs and currency when saving a margin; new version=%s", async newVersion => {
  m.find.mockImplementation(async args => args.orderBy ? { version: 1 } : {
    quote_id: "q1", quote_group_id: "g1", version: 1, status: "draft", client_name: "Synthetic client",
    input_metadata: { pricingCurrency: "USD", operationId: "old-import-operation", source: { kind: "threatdown-pdf" } },
  });
  const result = await updateQuoteLinesByTenant("t1", "q1", [{ lineId: "l1", sku: "TEST", description: "Test",
    quantity: 2, costUnit: 80, priceUnit: 0, marginPct: 35, mode: "margin", classification1: "product", classification2: "" }], newVersion);
  expect(result!.quote.currency).toBe("USD");
  expect(result!.lines[0]).toMatchObject({ costUnit: 80, priceUnit: 123.08, marginPct: 35 });
  expect(result!.totals.totalCost).toBe(160);
  if (newVersion) {
    expect(m.create.mock.calls[0][0].data.input_metadata).toEqual({ pricingCurrency: "USD" });
    expect(m.update).not.toHaveBeenCalled();
  } else {
    expect(m.update.mock.calls[0][0].data).not.toHaveProperty("input_metadata");
    expect(m.create).not.toHaveBeenCalled();
  }
});
