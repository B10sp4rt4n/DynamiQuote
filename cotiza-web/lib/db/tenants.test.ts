import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), findFirst: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { tenant: mocks } }));
import { getBootstrapTenant } from "@/lib/db/tenants";
beforeEach(() => vi.resetAllMocks());
afterEach(() => vi.unstubAllEnvs());
it("requires the configured default tenant to be active", async () => {
  vi.stubEnv("DEFAULT_TENANT_SLUG", "inactive-tenant");
  mocks.findUnique.mockResolvedValue(null);
  expect(await getBootstrapTenant()).toBeNull();
  expect(mocks.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { slug: "inactive-tenant", active: true } }));
  expect(mocks.findFirst).not.toHaveBeenCalled();
});
it("selects only active tenants when no default is configured", async () => {
  vi.stubEnv("DEFAULT_TENANT_SLUG", "");
  mocks.findFirst.mockResolvedValue({ tenant_id: "tenant_a", name: "A", slug: "a" });
  expect(await getBootstrapTenant()).toEqual({ id: "tenant_a", name: "A", slug: "a" });
  expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { active: true } }));
});
