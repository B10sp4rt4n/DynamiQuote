import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ find: vi.fn(), update: vi.fn(), lock: vi.fn() }));
vi.mock("./prisma", () => ({ prisma: { $transaction: (run: (tx: unknown) => unknown) => run({
  quote: { findFirst: m.find, updateMany: m.update }, $executeRaw: m.lock,
}) } }));
import { renameQuoteForTenant } from "./quote-name";

beforeEach(() => { vi.clearAllMocks(); m.update.mockResolvedValue({ count: 1 }); });
it("renames only the visible draft revision and retains import metadata and name history", async () => {
  m.find.mockResolvedValueOnce({ quote_group_id: "COT-1" }).mockResolvedValueOnce({ proposal_name: "Sin propuesta",
    input_metadata: { importSource: "threatdown-pdf", quoteNameHistory: [{ name: "Anterior" }] } });
  expect(await renameQuoteForTenant("tenant-a", "quote-v1", "seller-a", false, "  Renovación 2 años  "))
    .toEqual({ quoteId: "quote-v1", proposalName: "Renovación 2 años" });
  expect(m.update).toHaveBeenCalledWith({ where: { tenantId: "tenant-a", quote_id: "quote-v1", status: "draft",
    proposal_name: "Sin propuesta", OR: [{ created_by_user_id: "seller-a" }, { created_by_user_id: null }] }, data: {
      proposal_name: "Renovación 2 años", input_metadata: { importSource: "threatdown-pdf", quoteNameHistory: [
        { name: "Anterior" }, { previousName: "Sin propuesta", name: "Renovación 2 años", at: expect.any(String), by: "seller-a" },
      ] },
    } });
});
it("does not mutate another tenant or seller's unavailable quote", async () => {
  m.find.mockResolvedValueOnce(null);
  expect(await renameQuoteForTenant("tenant-b", "quote-v1", "seller-b", false, "Nombre")).toBeNull();
  expect(m.find).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: "tenant-b", quote_id: "quote-v1",
    OR: [{ created_by_user_id: "seller-b" }, { created_by_user_id: null }] } }));
  expect(m.update).not.toHaveBeenCalled(); expect(m.lock).not.toHaveBeenCalled();
});
it("rechecks draft status after acquiring the group lock", async () => {
  m.find.mockResolvedValueOnce({ quote_group_id: "COT-1" }).mockResolvedValueOnce(null);
  expect(await renameQuoteForTenant("tenant-a", "quote-v1", "owner-a", true, "Nombre")).toBeNull();
  expect(m.find).toHaveBeenLastCalledWith(expect.objectContaining({ where: { tenantId: "tenant-a", quote_id: "quote-v1", status: "draft" } }));
  expect(m.update).not.toHaveBeenCalled();
});
it("confirms a retry without duplicating its name history", async () => {
  m.find.mockResolvedValueOnce({ quote_group_id: "COT-1" }).mockResolvedValueOnce({ proposal_name: "Nombre" });
  expect(await renameQuoteForTenant("tenant-a", "quote-v1", "seller-a", false, "Nombre")).toEqual({ quoteId: "quote-v1", proposalName: "Nombre" });
  expect(m.update).not.toHaveBeenCalled();
});
it.each(["", "Sin propuesta", "Cotización sin nombre", "x".repeat(201)])("rejects a missing or invalid name: %s", async name => {
  expect(await renameQuoteForTenant("tenant-a", "quote-v1", "seller-a", false, name)).toBeNull();
  expect(m.find).not.toHaveBeenCalled();
});
