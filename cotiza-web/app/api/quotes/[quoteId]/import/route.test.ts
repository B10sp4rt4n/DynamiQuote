import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ tenant: vi.fn(), visible: vi.fn(), write: vi.fn(), rows: vi.fn() }));
vi.mock("@/lib/auth/tenant-context", () => ({ getCurrentTenantContext: m.tenant }));
vi.mock("@/lib/db/quotes", () => ({ importQuoteLinesByTenant: m.write, isQuoteVisibleToViewer: m.visible }));
vi.mock("@/lib/utils/rate-limit", () => ({ enforceRateLimit: () => ({ allowed: true }), getRequestIdentity: () => "user" }));
vi.mock("xlsx", () => ({ read: () => ({ SheetNames: ["Partidas"], Sheets: { Partidas: {} } }), utils: { sheet_to_json: m.rows } }));
import { POST } from "./route";
const op = "8f71c0f5-5cc5-4de4-beb3-7da4c8f3e5ca";
const context = () => ({ params: Promise.resolve({ quoteId: "q-v2-abcd" }) });
function request() {
  const form = new FormData(); form.append("file", new File(["fixture"], "fixture.xlsx")); form.append("operationId", op);
  return new Request("http://localhost/api/quotes/q-v2-abcd/import", { method: "POST", body: form });
}
describe("Excel adapter to shared quote input", () => {
  beforeEach(() => { vi.resetAllMocks(); m.tenant.mockResolvedValue({ id: "tenant-1", userId: "seller-1", userRole: "user" }); m.visible.mockResolvedValue(true); });
  it("forwards the retry key and versioned target under the server tenant", async () => {
    m.rows.mockReturnValue([{ sku: "TD", description: "Licencia", quantity: 21, costUnit: 10, priceUnit: 20 }]);
    m.write.mockResolvedValue({ quoteId: "q-v3", importedCount: 1, replayed: true });
    const response = await POST(request(), context());
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ quoteId: "q-v3", replayed: true });
    expect(m.write).toHaveBeenCalledWith("tenant-1", "q-v2-abcd", [expect.objectContaining({ quantity: 21, costUnit: 10, priceUnit: 20 })], op);
  });
  it.each([0, -1, 1.5])("does not silently turn invalid quantity %s into one", async (quantity) => {
    m.rows.mockReturnValue([{ description: "Licencia", quantity, costUnit: 10, priceUnit: 20 }]);
    expect((await POST(request(), context())).status).toBe(400); expect(m.write).not.toHaveBeenCalled();
  });
  it("checks quotation ownership before reading or importing the file", async () => {
    m.visible.mockResolvedValue(false);
    expect((await POST(request(), context())).status).toBe(404);
    expect(m.rows).not.toHaveBeenCalled(); expect(m.write).not.toHaveBeenCalled();
  });
});
