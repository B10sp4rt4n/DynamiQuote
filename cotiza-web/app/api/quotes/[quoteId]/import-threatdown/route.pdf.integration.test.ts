import { createHash } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
import { syntheticThreatDownPdf } from "@/lib/import/__fixtures__/threatdown-pdf";

const mocks = vi.hoisted(() => ({ write: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/tenant-context", () => ({ getCurrentTenantContext: async () => ({
  id: "test-tenant", userId: "test-user", userRole: "seller", isSuperAdmin: false,
}) }));
vi.mock("@/lib/db/tenant-capabilities", () => ({
  isTenantCapabilityEnabled: async () => true, THREATDOWN_PDF_IMPORT: "threatdown_pdf_import",
}));
vi.mock("@/lib/db/quotes", () => ({ isQuoteVisibleToViewer: async () => true }));
vi.mock("@/lib/db/quote-input", () => ({ createDraftFromQuoteInput: mocks.write }));
vi.mock("@/lib/utils/rate-limit", () => ({
  enforceRateLimit: () => ({ allowed: true }), getRequestIdentity: () => "test-user",
}));
import { POST } from "./route";

const context = { params: Promise.resolve({ quoteId: "test-quote" }) };
const operationId = "48bc6a1e-c041-490b-92ae-aa0347c69a2e";

beforeEach(() => { mocks.write.mockReset(); });

it.each([
  { saveEvidence: false, currency: undefined, rate: 1 },
  { saveEvidence: true, currency: undefined, rate: 1 },
  { saveEvidence: false, currency: "USD", rate: 1 },
  { saveEvidence: true, currency: "MXN", rate: 20 },
])("previews and applies an actual digital PDF: %j", async ({ saveEvidence, currency, rate }) => {
  const original = syntheticThreatDownPdf();
  const hash = createHash("sha256").update(original).digest("hex");
  function request(action: "preview" | "apply") {
    const body = new FormData();
    body.set("file", new File([original], "synthetic.pdf", { type: "application/pdf" }));
    body.set("action", action);
    if (action === "apply") {
      body.set("operationId", operationId); body.set("confirmed", "yes"); body.set("expectedHash", hash);
      if (saveEvidence) body.set("saveCommercialEvidence", "yes");
      if (currency) {
        body.set("includeCosts", "yes"); body.set("costCurrency", currency); body.set("exchangeRate", String(rate));
      }
    }
    return new Request("http://localhost/api/quotes/test-quote/import-threatdown", { method: "POST", body });
  }
  const preview = await POST(request("preview"), context);
  expect(preview.status).toBe(200);
  expect(await preview.json()).toMatchObject({ fileHash: hash, source: { quoteNumber: "Q-123456" } });
  expect(mocks.write).not.toHaveBeenCalled();
  mocks.write.mockImplementation(async input => {
    expect(input.lines.map((line: { quantity: number }) => line.quantity)).toEqual([2, 1]);
    expect(input.lines.map((line: { costUnit: number }) => line.costUnit)).toEqual(currency ? [123.45 * rate, 0] : [0, 0]);
    expect(input.lines.every((line: { priceUnit: number }) => line.priceUnit === 0)).toBe(true);
    if (currency) expect(input.source.pricing).toEqual({ sourceCurrency: "USD", currency, exchangeRate: rate });
    expect(input.source.revision).toBe(hash);
    if (saveEvidence) {
      // This exact conversion used by PostgreSQL threw a TypeError before the fix.
      const bytes = input.evidence.bytes as Uint8Array;
      expect(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)).toEqual(Buffer.from(original));
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(hash);
      expect(input.evidence.filename).toBe("synthetic.pdf");
    } else expect(input).not.toHaveProperty("evidence");
    return { quote: { quoteId: "test-imported" }, replayed: false };
  });
  const applied = await POST(request("apply"), context);
  expect(applied.status).toBe(200);
  expect(await applied.json()).toMatchObject({ quote: { quoteId: "test-imported" } });
  expect(mocks.write).toHaveBeenCalledOnce();
});
