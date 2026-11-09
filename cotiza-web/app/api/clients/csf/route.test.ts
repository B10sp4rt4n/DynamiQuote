import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ tenant: vi.fn(), enabled: vi.fn(), upload: vi.fn(), job: vi.fn(), csf: vi.fn(), validate: vi.fn(), limit: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/tenant-context", () => ({ getCurrentTenantContext: mocks.tenant }));
vi.mock("@/lib/utils/rate-limit", () => ({ enforceRateLimit: mocks.limit }));
vi.mock("@/lib/integrations/digestor-fiscal", () => ({
  isDigestorFiscalEnabledForTenant: mocks.enabled, uploadCsfDocument: mocks.upload,
  getDocumentJobStatus: mocks.job, getCsf: mocks.csf, validateReceptorFiscalData: mocks.validate,
}));
import { GET, POST } from "./route";
import { signCsfJob, verifyCsfJob } from "@/lib/integrations/csf-access";
const tenant = { id: "tenant-a", userId: "user-a" };
const values = { company: "EMPRESA DEMO", rfc: "AAA010101AAA", fiscalRegime: "601", zipCode: "01234", address: "REFORMA 123" };
const review = { revision: "a".repeat(64), values, suggestions: [], issues: {}, regimeText: "General de Ley Personas Morales", cifId: "123", validationScope: "local_format_and_catalog" };
function uploadRequest(content = "%PDF-1.7 synthetic", name = "csf.pdf") {
  const body = new FormData(); body.append("file", new File([content], name, { type: "application/pdf" }));
  return new Request("http://localhost/api/clients/csf", { body, method: "POST" });
}
function confirmRequest(change = {}) {
  return new Request("http://localhost/api/clients/csf", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: signCsfJob("job-a", tenant), expectedRevision: review.revision, confirm: true, values, ...change }) });
}
describe("CSF upload, ownership and explicit confirmation", () => {
  beforeEach(() => {
    vi.clearAllMocks(); vi.stubEnv("DIGESTOR_FISCAL_PASSWORD", "synthetic-test-secret");
    mocks.tenant.mockResolvedValue(tenant); mocks.enabled.mockReturnValue(true); mocks.limit.mockReturnValue({ allowed: true });
    mocks.upload.mockResolvedValue({ jobId: "job-a", status: "queued" });
    mocks.job.mockResolvedValue({ jobId: "job-a", status: "done", documentId: "document-a" });
    mocks.csf.mockResolvedValue({ id: "document-a", review }); mocks.validate.mockResolvedValue({ valid: true, summary: "Formato válido" });
  });
  it("requires a logged-in enabled tenant for uploads and reads", async () => {
    mocks.tenant.mockResolvedValueOnce(null); expect((await POST(uploadRequest())).status).toBe(401);
    mocks.enabled.mockReturnValue(false); expect((await POST(uploadRequest())).status).toBe(403);
    expect((await GET(new Request("http://localhost/api/clients/csf"))).status).toBe(403);
    expect(mocks.upload).not.toHaveBeenCalled(); expect(mocks.job).not.toHaveBeenCalled();
  });
  it("accepts a PDF and returns only a scoped job token", async () => {
    const response = await POST(uploadRequest()); expect(response.status).toBe(202);
    const data = await response.json(); expect(verifyCsfJob(data.token, tenant)).toBe("job-a");
    expect(mocks.upload).toHaveBeenCalledWith(expect.any(Buffer), "csf.pdf");
    expect(mocks.validate).not.toHaveBeenCalled();
  });
  it.each([["not PDF", "csf.pdf"], ["%PDF-1.7", "csf.txt"], ["", "csf.pdf"]])("rejects spoofed or empty input", async (text, name) => {
    expect((await POST(uploadRequest(text, name))).status).toBe(400); expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("bounds uploads including a missing or false Content-Length", async () => {
    for (const size of [4 * 1024 * 1024, 4 * 1024 * 1024 + 65536]) {
      const source = uploadRequest("%PDF-" + "x".repeat(size));
      const request = new Request(source.url, { method: "POST", headers: source.headers, body: await source.arrayBuffer() });
      expect((await POST(request)).status).toBe(413);
    }
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("does not expose jobs to another tenant, actor, forged or expired tokens", async () => {
    for (const scope of [{ id: "other", userId: "user-a" }, { id: "tenant-a", userId: "other" }]) {
      const token = signCsfJob("job-a", scope);
      expect((await GET(new Request("http://localhost/api/clients/csf", { headers: { "X-CSF-Review": token } }))).status).toBe(403);
    }
    const token = signCsfJob("job-a", tenant); expect(verifyCsfJob(token + "bad", tenant)).toBeNull();
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 31 * 60_000);
    expect(verifyCsfJob(token, tenant)).toBeNull(); vi.restoreAllMocks();
    expect(mocks.job).not.toHaveBeenCalled();
  });
  it("returns extracted data for review without approving or saving", async () => {
    const response = await GET(new Request("http://localhost/api/clients/csf", { headers: { "X-CSF-Review": signCsfJob("job-a", tenant) } }));
    expect(await response.json()).toEqual({ status: "done", review, documentId: "document-a" });
    expect(response.headers.get("Cache-Control")).toBe("no-store"); expect(mocks.validate).not.toHaveBeenCalled();
  });
  it("requires explicit confirmation, valid values, and the unchanged revision", async () => {
    expect((await POST(confirmRequest({ confirm: false }))).status).toBe(422);
    expect((await POST(confirmRequest({ values: { ...values, company: "SIN NOMBRE" } }))).status).toBe(422);
    expect((await POST(confirmRequest({ expectedRevision: "b".repeat(64) }))).status).toBe(409);
    expect(mocks.validate).not.toHaveBeenCalled();
  });
  it("returns reviewed values after local catalog validation without using PAC", async () => {
    const response = await POST(confirmRequest()); expect(response.status).toBe(200);
    expect((await response.json()).values).toEqual(values);
    expect(mocks.validate).toHaveBeenCalledWith({ cp: "01234", nombre: values.company, regimen: "601", rfc: values.rfc }, { pacCheck: false });
  });
  it("keeps failed validation and unconfigured backend blocked", async () => {
    mocks.validate.mockResolvedValue({ valid: false, summary: "Régimen incompatible" });
    expect((await POST(confirmRequest())).status).toBe(422);
    mocks.csf.mockResolvedValue({ id: "document-a", review: null });
    expect((await POST(confirmRequest())).status).toBe(409);
  });
  it("allows polling retries after transport errors without reuploading", async () => {
    mocks.job.mockRejectedValueOnce(new Error("timeout"));
    const read = () => GET(new Request("http://localhost/api/clients/csf", { headers: { "X-CSF-Review": signCsfJob("job-a", tenant) } }));
    expect((await read()).status).toBe(502); expect((await read()).status).toBe(200);
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it.each(["OCR_UNAVAILABLE", "OCR_TIMEOUT", "OCR_UNREADABLE", "PDF_LIMIT", "PDF_ENCRYPTED", "PDF_INVALID"])("provides an actionable scan failure without exposing internal errors: %s", async (code) => {
    mocks.job.mockResolvedValue({ status: "failed", error: code + ": private engine details" });
    const response = await GET(new Request("http://localhost/api/clients/csf", { headers: { "X-CSF-Review": signCsfJob("job-a", tenant) } }));
    const body = await response.json();
    expect(body.status).toBe("failed");
    expect(body.error).not.toContain("private engine details");
    expect(body.error).not.toContain("requieren OCR");
  });
});
