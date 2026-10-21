import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@react-pdf/renderer", () => ({ renderToBuffer: vi.fn().mockResolvedValue(Buffer.from("%PDF-1.7\nreport")) }));
vi.mock("@/lib/auth/tenant-context", () => ({ getCurrentTenantContext: vi.fn() }));
vi.mock("@/lib/reports/proposal-kpis", () => ({ getProposalKpiReportData: vi.fn().mockResolvedValue({ tenantName: "Selected" }) }));
vi.mock("@/lib/pdf/proposal-kpi-document", () => ({ ProposalKpiPdfDocument: vi.fn() }));
vi.mock("@/lib/utils/rate-limit", () => ({ enforceRateLimit: vi.fn() }));
import { GET } from "./route";
import { getCurrentTenantContext, type TenantContext } from "@/lib/auth/tenant-context";
import { getProposalKpiReportData } from "@/lib/reports/proposal-kpis";
import { enforceRateLimit } from "@/lib/utils/rate-limit";
const tenant = { id: "selected", name: "Empresa Á / prueba", userId: "actor" } as TenantContext;
describe("KPI PDF download", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(getCurrentTenantContext).mockResolvedValue(tenant); vi.mocked(enforceRateLimit).mockReturnValue({ allowed: true, remaining: 9, resetAt: Date.now() + 60000 }); });
  it("rejects unauthenticated requests before fetching report data", async () => {
    vi.mocked(getCurrentTenantContext).mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect(getProposalKpiReportData).not.toHaveBeenCalled();
  });
  it("returns a private PDF for the authenticated context", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-disposition")).toMatch(/attachment; filename="KPIs_Empresa_A___prueba_.+\.pdf"/);
    expect(await response.text()).toMatch(/^%PDF/);
    expect(getProposalKpiReportData).toHaveBeenCalledExactlyOnceWith(tenant);
  });
  it("limits repeated generation without fetching report data", async () => {
    vi.mocked(enforceRateLimit).mockReturnValue({ allowed: false, remaining: 0, resetAt: Date.now() + 60000 });
    const response = await GET();
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(getProposalKpiReportData).not.toHaveBeenCalled();
  });
});
