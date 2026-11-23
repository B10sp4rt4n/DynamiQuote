import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ tenant: vi.fn(), capability: vi.fn(), visibility: vi.fn(), list: vi.fn(), file: vi.fn() }));
vi.mock("@/lib/auth/tenant-context", () => ({ getCurrentTenantContext: m.tenant }));
vi.mock("@/lib/db/tenant-capabilities", () => ({ isTenantCapabilityEnabled: m.capability }));
vi.mock("@/lib/db/quotes", () => ({ isQuoteVisibleToViewer: m.visibility }));
vi.mock("@/lib/db/commercial-evidence", () => ({ listCommercialEvidence: m.list, getCommercialEvidenceFile: m.file }));
import { GET } from "./route";

const evidenceId = "9ea42e51-b657-400f-b157-596fbdaa8921";
const quoteId = "Q2";
const params = { params: Promise.resolve({ quoteId }) };
const download = () => new Request(`http://localhost/evidence?evidenceId=${evidenceId}`);

beforeEach(() => {
  vi.resetAllMocks();
  m.tenant.mockResolvedValue({ id: "tenant-b", userId: "seller", userRole: "user", isSuperAdmin: false });
  m.capability.mockResolvedValue(true);
  m.visibility.mockResolvedValue(true);
});

it("requires the capability and the quote's existing access rules before reading a PDF", async () => {
  m.capability.mockResolvedValueOnce(false);
  expect((await GET(download(), params)).status).toBe(403);
  m.visibility.mockResolvedValueOnce(false);
  expect((await GET(download(), params)).status).toBe(404);
  expect(m.visibility).toHaveBeenCalledExactlyOnceWith("tenant-b", quoteId, "seller", false);
  expect(m.file).not.toHaveBeenCalled();
});

it("limits downloads to the exact tenant, quote and document and forces an attachment", async () => {
  m.file.mockResolvedValueOnce(null).mockResolvedValueOnce({ filename: "Cotización.pdf", bytes: new TextEncoder().encode("%PDF-test") });
  expect((await GET(download(), params)).status).toBe(404);
  const response = await GET(download(), params);
  expect(m.file).toHaveBeenLastCalledWith("tenant-b", quoteId, evidenceId);
  expect(response.headers.get("content-disposition")).toContain("attachment;");
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(await response.text()).toBe("%PDF-test");
});
