import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const capability = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/tenant-capabilities", () => ({ isTenantCapabilityEnabled: capability }));
import { mercadoLibreEnabled } from "./availability";
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("MERCADOLIBRE_ENABLED", "true"); capability.mockResolvedValue(false); });
afterEach(() => vi.unstubAllEnvs());
it("requires an explicit tenant grant even with the global service on and an old allowlist", async () => {
  vi.stubEnv("MERCADOLIBRE_TENANT_IDS", "a,b");
  expect(await mercadoLibreEnabled("a")).toBe(false);
  expect(capability).toHaveBeenCalledWith("a", "mercadolibre_channel");
});
it("keeps enabled and disabled tenants isolated and rechecks revocation without caching", async () => {
  capability.mockImplementation(async tenant => tenant === "a");
  expect(await mercadoLibreEnabled("a")).toBe(true); expect(await mercadoLibreEnabled("b")).toBe(false);
  capability.mockResolvedValue(false); expect(await mercadoLibreEnabled("a")).toBe(false);
});
it("honors the global service stop even when a tenant is entitled", async () => {
  capability.mockResolvedValue(true); vi.stubEnv("MERCADOLIBRE_ENABLED", "false");
  expect(await mercadoLibreEnabled("a")).toBe(false); expect(capability).not.toHaveBeenCalled();
});
