import { beforeEach, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ quote: vi.fn(), transaction: vi.fn(), create: vi.fn(), formal: vi.fn(), items: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {
  proposals: { findFirst: async () => null },
  quote: { findFirst: m.quote },
  tenant: { findUnique: async () => ({ name: "Synthetic tenant" }) },
  company_logos: { findFirst: async () => ({ logo_id: "test-logo", company_name: "Synthetic tenant", tenant_id: "t1" }) },
  formal_proposals: { findMany: async () => [] },
  $transaction: m.transaction,
} }));
import { createProposalFromQuoteByTenant } from "./proposals";

function quote(currency?: "USD" | "MXN", price = 15) {
  return { quote_id: "q1", quote_group_id: null, status: "draft", client_id: null, client_name: "Synthetic client",
    proposal_name: "Synthetic quote", opportunity_id: null, quoted_by: "Vendedor",
    input_metadata: currency ? { pricingCurrency: currency } : null,
    quote_lines: [
      { quantity: new Prisma.Decimal(2), cost_unit: new Prisma.Decimal(10), final_price_unit: new Prisma.Decimal(price), sku: "TEST", description_final: "Test product", line_type: "product" },
      { quantity: new Prisma.Decimal(1), cost_unit: new Prisma.Decimal(0), final_price_unit: new Prisma.Decimal(0), sku: "SUPPORT", description_final: "Free support", line_type: "service" },
    ] };
}
beforeEach(() => {
  vi.clearAllMocks();
  m.transaction.mockImplementation(fn => fn({
    $executeRaw: async () => 0, quote: { findFirst: async () => ({ status: "draft" }) },
    proposals: { create: m.create }, formal_proposals: { create: m.formal }, proposal_items: { createMany: m.items },
  }));
});

it.each(["USD", "MXN"] as const)("creates a proposal in the imported quote's %s with unchanged commercial amounts", async currency => {
  m.quote.mockResolvedValue(quote(currency));
  const result = await createProposalFromQuoteByTenant("t1", { quoteId: "q1" }, "Vendedor", "u1");
  expect(result?.formal?.currency).toBe(currency);
  expect(m.formal.mock.calls[0][0].data.currency).toBe(currency);
  expect(m.items.mock.calls[0][0].data).toEqual(expect.arrayContaining([
    expect.objectContaining({ cost_unit: 10, price_unit: 15, subtotal_cost: 20, subtotal_price: 30 }),
    expect.objectContaining({ sku: "SUPPORT", cost_unit: 0, price_unit: 0 }),
  ]));
  expect(m.quote).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: "t1", quote_id: "q1" } }));
});

it("requires a selling price for imported positive costs before creating any proposal", async () => {
  m.quote.mockResolvedValue(quote("USD", 0));
  await expect(createProposalFromQuoteByTenant("t1", { quoteId: "q1" }, "Vendedor")).rejects.toThrow("Define el margen o precio de venta");
  expect(m.transaction).not.toHaveBeenCalled();
});

it("keeps the existing currency-selection behavior for a legacy quote without currency metadata", async () => {
  m.quote.mockResolvedValue(quote());
  const result = await createProposalFromQuoteByTenant("t1", { quoteId: "q1" }, "Vendedor");
  expect(result?.formal?.currency).toBeNull();
  expect(m.formal.mock.calls[0][0].data).not.toHaveProperty("currency");
});
