import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ policy: vi.fn(), users: vi.fn(), notices: vi.fn(), resend: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { tenant: { findUnique: async () => ({ name: "Synthetic tenant" }) }, app_users: { findMany: m.users } } }));
vi.mock("@/lib/db/won-consolidation", () => ({ getWinPolicy: m.policy, getApprovalNotices: m.notices }));
vi.mock("./resend", () => ({ resolveResendConfig: m.resend }));
import { approvalMessage, sendApprovalNotices } from "./approval-notice";
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("VERCEL_ENV", "preview"); m.policy.mockResolvedValue({ rules: [], approvalEmailEnabled: false }); });
afterEach(() => vi.unstubAllEnvs());
it("never sends from a preview or a tenant without explicit email activation", async () => {
  expect(await sendApprovalNotices("a", "p")).toEqual({ sent: 0, issues: 0 }); expect(m.policy).not.toHaveBeenCalled();
  vi.stubEnv("VERCEL_ENV", "production"); await sendApprovalNotices("a", "p"); expect(m.resend).not.toHaveBeenCalled(); expect(m.users).not.toHaveBeenCalled();
});
it("contains the exact pending request and canonical link without claiming authorization", () => {
  const result = approvalMessage({ name: "Owner sintético", tenantName: "Empresa sintética", appUrl: "https://cotiza.example.test", notice: {
    key: "consolidation:p", requestKey: "r1", kind: "consolidation", proposalId: "p", proposalNumber: "PROP-TEST", recipientCompany: "Cliente de prueba", requirements: ["Crédito"], href: "/autorizaciones/p" } });
  expect(result.subject).toBe("Cotiza: aprobación pendiente · PROP-TEST"); expect(result.body).toContain("https://cotiza.example.test/autorizaciones/p");
  expect(result.body).toContain("Este correo no registra una aprobación");
});
