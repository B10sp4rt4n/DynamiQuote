import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const enabled = vi.hoisted(() => vi.fn());
vi.mock("@/lib/integrations/digestor-fiscal", () => ({ isDigestorFiscalEnabledForTenant: enabled }));
import { getFiscalWorkspaceAccess } from "./fiscal-workspace";
beforeEach(() => { enabled.mockReturnValue(false); vi.stubEnv("VERCEL_ENV", "preview"); vi.stubEnv("CDC_FISCAL_PREVIEW_TENANT_ID", "company-a"); });
afterEach(() => vi.unstubAllEnvs());
it("makes the assigned preview workspace visible without enabling fiscal operations", () => {
  expect(getFiscalWorkspaceAccess("company-a")).toEqual({ visible: true, operationsEnabled: false, previewOnly: true });
});
it("does not expose the preview workspace to a different or missing company", () => {
  for (const tenant of ["company-b", "", "company-a-extra"]) {
    expect(getFiscalWorkspaceAccess(tenant).visible).toBe(false);
  }
});
it("does not activate the override in production or development", () => {
  for (const environment of ["production", "development", ""]) {
    vi.stubEnv("VERCEL_ENV", environment);
    expect(getFiscalWorkspaceAccess("company-a").visible).toBe(false);
  }
});
it("defaults to hidden when no preview company is explicitly configured", () => {
  vi.stubEnv("CDC_FISCAL_PREVIEW_TENANT_ID", "");
  expect(getFiscalWorkspaceAccess("company-a").visible).toBe(false);
});
it("preserves the existing operational integration independently of preview access", () => {
  enabled.mockReturnValue(true);
  vi.stubEnv("VERCEL_ENV", "production");
  expect(getFiscalWorkspaceAccess("company-b")).toEqual({ visible: true, operationsEnabled: true, previewOnly: false });
});
