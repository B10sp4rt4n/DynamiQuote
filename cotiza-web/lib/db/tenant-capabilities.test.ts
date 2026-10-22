import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ find: vi.fn(), upsert: vi.fn(), event: vi.fn(), tenant: vi.fn(), lock: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { tenantCapability: { findUnique: m.find }, $transaction: m.transaction } }));
import { isTenantCapabilityEnabled, setTenantCapability, THREATDOWN_PDF_IMPORT } from "./tenant-capabilities";
const input: Parameters<typeof setTenantCapability>[0] = { tenantId: "sys", capabilityKey: THREATDOWN_PDF_IMPORT, enabled: true, actor: { userId: "super-1", isSuperAdmin: true } };
describe("tenant capabilities", () => {
  beforeEach(() => { vi.clearAllMocks(); m.find.mockResolvedValue(null); m.tenant.mockResolvedValue({ active: true });
    m.transaction.mockImplementation((fn) => fn({ $queryRaw: m.lock, tenant: { findUnique: m.tenant }, tenantCapability: { findUnique: m.find, upsert: m.upsert }, tenantCapabilityEvent: { create: m.event } }));
  });
  it("defaults to disabled and scopes each lookup by tenant and capability", async () => {
    expect(await isTenantCapabilityEnabled("other", THREATDOWN_PDF_IMPORT)).toBe(false);
    expect(m.find).toHaveBeenCalledWith({ where: { tenant_id_capability_key: { tenant_id: "other", capability_key: THREATDOWN_PDF_IMPORT } }, select: { enabled: true } });
    m.find.mockResolvedValue({ enabled: true }); expect(await isTenantCapabilityEnabled("sys", THREATDOWN_PDF_IMPORT)).toBe(true);
    m.find.mockResolvedValue({ enabled: false }); expect(await isTenantCapabilityEnabled("sys", THREATDOWN_PDF_IMPORT)).toBe(false);
  });
  it("rejects non-superadmin before any write", async () => { await expect(setTenantCapability({ ...input, actor: { userId: "owner", isSuperAdmin: false } })).rejects.toThrow("superadmin"); expect(m.transaction).not.toHaveBeenCalled(); });
  it("records activation with previous state and authenticated actor", async () => {
    expect(await setTenantCapability(input)).toBe(true); expect(m.lock).toHaveBeenCalled();
    expect(m.event).toHaveBeenCalledWith({ data: { tenant_id: "sys", capability_key: THREATDOWN_PDF_IMPORT, previous_enabled: null, enabled: true, changed_by: "super-1" } });
    expect(m.upsert).toHaveBeenCalledOnce();
  });
  it("records deactivation", async () => { m.find.mockResolvedValue({ enabled: true }); expect(await setTenantCapability({ ...input, enabled: false })).toBe(false); expect(m.event.mock.calls[0][0].data).toMatchObject({ previous_enabled: true, enabled: false }); });
  it("does not duplicate audit on repeated save", async () => { m.find.mockResolvedValue({ enabled: true }); expect(await setTenantCapability(input)).toBe(true); expect(m.upsert).not.toHaveBeenCalled(); expect(m.event).not.toHaveBeenCalled(); });
  it("does not write defaults or inactive tenants", async () => { expect(await setTenantCapability({ ...input, enabled: false })).toBe(false); m.tenant.mockResolvedValue({ active: false }); expect(await setTenantCapability(input)).toBeNull(); expect(m.upsert).not.toHaveBeenCalled(); });
});
