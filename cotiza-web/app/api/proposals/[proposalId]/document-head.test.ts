import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  tenant: vi.fn(),
  proposal: vi.fn(),
  excel: vi.fn(),
  audit: vi.fn(),
  consume: vi.fn(),
  gate: vi.fn(),
  render: vi.fn(),
  workbook: vi.fn(),
  profile: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock("@/lib/auth/tenant-context", () => ({ getCurrentTenantContext: mocks.tenant }));
vi.mock("@/lib/db/proposals", () => ({
  getProposalWorkflowByTenant: mocks.proposal,
  getProposalExcelPayloadByTenant: mocks.excel,
  consumeProposalIssuanceForce: mocks.consume,
  importProposalItemsByTenant: vi.fn(),
}));
vi.mock("@/lib/db/proposal-audit", () => ({ recordProposalAuditEvent: mocks.audit }));
vi.mock("@/lib/db/tenants", () => ({ getTenantProfileByTenant: mocks.profile }));
vi.mock("@/lib/domain/proposal-issuance-gate", () => ({ resolveProposalIssuanceGate: mocks.gate }));
vi.mock("@react-pdf/renderer", () => ({ renderToBuffer: mocks.render }));
vi.mock("@/lib/pdf/proposal-document", () => ({ ProposalPdfDocument: vi.fn() }));
vi.mock("@/lib/utils/rate-limit", () => ({ enforceRateLimit: mocks.rateLimit, getRequestIdentity: vi.fn() }));
vi.mock("xlsx", () => ({
  utils: { book_new: mocks.workbook, aoa_to_sheet: vi.fn(), json_to_sheet: vi.fn(), book_append_sheet: vi.fn() },
  write: vi.fn(() => new ArrayBuffer(3)),
}));

import * as pdf from "./pdf/route";
import * as xlsx from "./xlsx/route";

const context = () => ({ params: Promise.resolve({ proposalId: "proposal-1" }) });
const request = (method: string) => new Request("http://localhost/api/proposals/proposal-1/pdf", { method });

describe.each([["PDF", pdf], ["Excel", xlsx]] as const)("%s metadata vs download", (_format, route) => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.tenant.mockResolvedValue({ id: "tenant-1", name: "Empresa", userId: "user-1" });
    const proposal = {
      proposalId: "proposal-1", status: "approved", formal: { proposalNumber: "PROP-1" },
      issuanceStatus: "authorized", marginEvaluation: { canAuthorizeFinal: true }, items: [],
    };
    mocks.proposal.mockResolvedValue(proposal);
    mocks.excel.mockResolvedValue(proposal);
    mocks.gate.mockReturnValue({ kind: "allowed", forced: false, watermark: false });
    mocks.rateLimit.mockReturnValue({ allowed: true });
    mocks.render.mockResolvedValue(Buffer.from("%PDF-1.7"));
  });

  it("HEAD then GET creates one audit event and consumes a forced authorization only on GET", async () => {
    mocks.gate.mockReturnValue({ kind: "allowed", forced: true, watermark: false });
    const head = await route.HEAD(request("HEAD"), context());
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
    expect(head.headers.get("content-disposition")).toContain("PROP-1");
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(mocks.render).not.toHaveBeenCalled();
    expect(mocks.workbook).not.toHaveBeenCalled();

    const download = await route.GET(request("GET"), context());
    expect(download.status).toBe(200);
    expect(mocks.consume).toHaveBeenCalledTimes(1);
    expect(mocks.audit).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      tenantId: "tenant-1", proposalId: "proposal-1", eventType: "document_issued",
      payload: expect.objectContaining({ httpMethod: "GET" }),
    }));
  });

  it("blocked HEAD neither audits a download attempt nor consumes authorization", async () => {
    mocks.gate.mockReturnValue({ kind: "blocked", reason: "Sin autorizacion" });
    const result = await route.HEAD(request("HEAD"), context());
    expect(result.status).toBe(403);
    expect(await result.text()).toBe("");
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(mocks.render).not.toHaveBeenCalled();
    expect(mocks.workbook).not.toHaveBeenCalled();
  });

  it("keeps the normal blocked GET audit", async () => {
    mocks.gate.mockReturnValue({ kind: "blocked", reason: "Sin autorizacion" });
    expect((await route.GET(request("GET"), context())).status).toBe(403);
    expect(mocks.audit).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ eventType: "document_blocked" }));
    expect(mocks.consume).not.toHaveBeenCalled();
  });

  it("does not read proposals without authentication", async () => {
    mocks.tenant.mockResolvedValue(null);
    expect((await route.HEAD(request("HEAD"), context())).status).toBe(401);
    expect(mocks.proposal).not.toHaveBeenCalled();
    expect(mocks.excel).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("returns 404 within the selected tenant for missing proposals", async () => {
    mocks.proposal.mockResolvedValue(null);
    mocks.excel.mockResolvedValue(null);
    expect((await route.HEAD(request("HEAD"), context())).status).toBe(404);
    const reader = _format === "PDF" ? mocks.proposal : mocks.excel;
    expect(reader.mock.calls[0]?.slice(0, 2)).toEqual(["tenant-1", "proposal-1"]);
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("preserves distinct real GET downloads instead of collapsing nearby timestamps", async () => {
    await route.GET(request("GET"), context());
    await route.GET(request("GET"), context());
    expect(mocks.audit).toHaveBeenCalledTimes(2);
  });
});
