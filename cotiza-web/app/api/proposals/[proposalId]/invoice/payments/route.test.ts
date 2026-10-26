import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
const m = vi.hoisted(() => ({ auth: vi.fn(), list: vi.fn(), register: vi.fn(), receipt: vi.fn(), prepare: vi.fn(), stamp: vi.fn() }));
vi.mock("@/lib/integrations/proposal-payments", () => ({ authorizeProposalPayments: m.auth, paymentFailure: () => NextResponse.json({ error: "Uncertain result" }, { status: 502 }) }));
vi.mock("@/lib/integrations/digestor-fiscal", () => ({ getBillingPayments: m.list, registerBillingPayment: m.register, getPaymentReceipt: m.receipt, preparePaymentReceipt: m.prepare, stampPaymentReceipt: m.stamp }));
import { GET, POST } from "./route";
import { GET as readReceipt } from "./[paymentId]/receipt/route";
import { POST as prepareReceipt } from "./[paymentId]/receipt/prepare/route";
import { POST as stampReceipt } from "./[paymentId]/receipt/stamp/route";
const ctx = { params: Promise.resolve({ proposalId: "p1", paymentId: "payment-one" }) };
const payload = { amount: "58.01", reference: "BANK-001", payment_form: "03", paid_at: "2026-10-20T12:00:00-06:00", idempotency_key: "11111111-2222-4333-8444-555555555555" };
const request = (overrides = {}) => new Request("https://cotiza.test/api/proposals/p1/invoice/payments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, ...overrides }) });

describe("payment proxy boundaries", () => {
  beforeEach(() => { vi.resetAllMocks(); m.auth.mockResolvedValue({ draftId: "server-resolved-draft" }); m.register.mockResolvedValue({ id: "payment-one" }); });
  it("preserves decimal strings, idempotency and server resolved invoice", async () => {
    expect((await POST(request(), ctx)).status).toBe(201);
    expect(m.register).toHaveBeenCalledWith("server-resolved-draft", payload);
  });
  it.each([{ amount: "0" }, { amount: "1.001" }, { amount: "1e6" }, { paid_at: "2026-10-20T12:00:00" }, { payment_form: "99" }, { tenant_id: "foreign" }, { draftId: "injected" }])("rejects invalid or injected data %j", async overrides => {
    expect((await POST(request(overrides), ctx)).status).toBe(422); expect(m.register).not.toHaveBeenCalled();
  });
  it.each([GET, POST, readReceipt, prepareReceipt, stampReceipt])("returns access rejection before fiscal operations", async handler => {
    m.auth.mockResolvedValue({ error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) });
    expect((await handler(request(), ctx)).status).toBe(403);
    for (const mock of [m.list, m.register, m.receipt, m.prepare, m.stamp]) expect(mock).not.toHaveBeenCalled();
  });
  it("queries receipt status without requesting another stamp", async () => {
    m.receipt.mockResolvedValue({ receipt_status: "unknown" });
    expect((await readReceipt(request(), ctx)).status).toBe(200);
    expect(m.receipt).toHaveBeenCalledWith("server-resolved-draft", "payment-one"); expect(m.stamp).not.toHaveBeenCalled();
  });
  it("serves only an issued XML as a download", async () => {
    const req = new Request("https://cotiza.test/receipt?download=1");
    m.receipt.mockResolvedValue({ receipt_status: "unknown", xml_base64: null });
    expect((await readReceipt(req, ctx)).status).toBe(409);
    m.receipt.mockResolvedValue({ receipt_status: "stamped", xml_base64: Buffer.from("<synthetic-rep/>").toString("base64") });
    const response = await readReceipt(req, ctx);
    expect(await response.text()).toBe("<synthetic-rep/>"); expect(response.headers.get("cache-control")).toBe("no-store");
    expect(m.stamp).not.toHaveBeenCalled();
  });
  it("prepares preliminary XML without calling stamp", async () => {
    m.prepare.mockResolvedValue({ preliminary: true, xml_base64: "fixture" });
    expect((await prepareReceipt(request(), ctx)).status).toBe(200); expect(m.stamp).not.toHaveBeenCalled();
  });
  it("does not automatically retry an uncertain stamp", async () => {
    m.stamp.mockRejectedValue(new Error("synthetic timeout"));
    expect((await stampReceipt(request(), ctx)).status).toBe(502); expect(m.stamp).toHaveBeenCalledTimes(1);
  });
});
