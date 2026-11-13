import { afterAll, beforeAll, expect, it, describe, vi } from "vitest";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { WinActor, WinRule } from "@/lib/domain/won-consolidation";
vi.mock("server-only", () => ({}));
const email = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("@/lib/email/resend", () => ({ resolveResendConfig: async () => ({ from: "Cotiza <avisos@example.test>", client: { emails: { send: email.send } }, error: null }) }));
const url = process.env.COTIZA_WIN_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
suite("consolidation with actual PostgreSQL transactions", () => {
  let pool: Pool, db: typeof import("./prisma").prisma, api: typeof import("./won-consolidation"), proposals: typeof import("./proposals");
  let kpis: typeof import("./proposal-kpis");
  const seller: WinActor = { userId: "seller", userRole: "owner", isSuperAdmin: false };
  const financial: WinActor = { userId: "finance", userRole: "admin", isSuperAdmin: false };
  const legal: WinActor = { userId: "legal", userRole: "user", isSuperAdmin: false };
  const rule: WinRule = { id: "finance", label: "Autorización financiera", approverRoles: ["admin"], approverUserIds: [],
    allowSelfApproval: false, evidenceRequired: true, allowWaiver: false, dependsOn: [], minimumAmount: null, currency: null };
  beforeAll(async () => {
    const parsed = new URL(url!);
    if (parsed.hostname !== "127.0.0.1" || parsed.pathname !== "/cotiza_win_synthetic") throw Error("An isolated local cotiza_win_synthetic database is required");
    vi.stubEnv("DATABASE_URL", url!);
    pool = new Pool({ connectionString: url! });
    const globals = globalThis as unknown as { pool: Pool; prisma?: typeof db }; globals.pool = pool; delete globals.prisma;
    const { execFileSync } = await import("node:child_process");
    const cli = join(dirname(createRequire(import.meta.url).resolve("prisma/package.json")), "build/index.js");
    const schema = execFileSync(process.execPath, [cli, "migrate", "diff", "--from-empty", "--to-schema", "prisma/schema.prisma", "--script"], { encoding: "utf8" });
    await pool.query(schema);
    const sql = readFileSync(new URL("../../prisma/manual/20261113_won_consolidation.sql", import.meta.url), "utf8");
    await pool.query(sql); await pool.query(sql);
    const mailSql = readFileSync(new URL("../../prisma/manual/20261113_approval_email_outbox.sql", import.meta.url), "utf8");
    await pool.query(mailSql); await pool.query(mailSql);
    ({ prisma: db } = await import("./prisma")); api = await import("./won-consolidation"); proposals = await import("./proposals"); kpis = await import("./proposal-kpis");
    for (const t of ["a", "b"]) await db.tenant.create({ data: { tenant_id: t, name: t, slug: t, created_at: new Date() } });
    for (const [id, role, tenant] of [["seller", "owner", "a"], ["finance", "admin", "a"], ["legal", "user", "a"], ["other-owner", "owner", "a"], ["intruder", "user", "b"]]) await db.app_users.create({ data: {
      user_id: id!, role: role!, tenant_id: tenant!, alias: id!, first_name: id!, last_name: "Synthetic", password_hash: "unused", created_at: new Date(), active: true } });
    await db.opportunities.create({ data: { opportunity_id: "opp", tenant_id: "a", opportunity_number: "OPP-SYNTHETIC", title: "Synthetic", created_at: new Date("2026-01-01") } });
    for (const id of ["p", "alternative", "minimal", "threshold", "legacy"]) {
      await db.proposals.create({ data: { proposal_id: id, tenant_id: "a", opportunity_id: ["p", "alternative"].includes(id) ? "opp" : null,
        status: "approved", created_by: "seller", created_by_user_id: "seller", created_at: new Date("2026-01-01"), ...(id === "legacy" ? { outcome: "won", outcome_at: new Date("2026-02-01") } : {}) } });
      await db.proposal_items.create({ data: { item_id: "item-" + id, proposal_id: id, tenant_id: "a", item_number: 1, quantity: 1, cost_unit: 60, price_unit: 100,
        subtotal_cost: 60, subtotal_price: 100, status: "active", created_at: new Date() } });
      await db.proposal_integrated_node.create({ data: { proposal_id: id, tenant_id: "a", total_price: 100, total_cost: 60, status: "active", updated_at: new Date() } });
      await db.formal_proposals.create({ data: { proposal_doc_id: "formal-" + id, proposal_id: id, tenant_id: "a", proposal_number: "PROP-" + id,
        issued_date: new Date("2026-01-01"), issuer_company: "Synthetic seller", recipient_company: "Synthetic customer", currency: "MXN", created_at: new Date() } });
    }
    for (const id of ["review-needed", "reviewed"]) await db.proposals.create({ data: { proposal_id: id, tenant_id: "a", status: "in_review", created_by: "seller", created_by_user_id: "seller", created_at: new Date("2026-01-01") } });
    await db.proposal_approvals.create({ data: { approval_id: "existing-owner-ok", proposal_id: "reviewed", tenant_id: "a", approver_role: "owner", approver_user_id: "seller", decision: "approved", created_at: new Date() } });
  }, 30_000);
  afterAll(async () => { await db?.$disconnect(); await pool?.end(); vi.unstubAllEnvs(); });
  it("keeps existing wins and defaults to commercial acceptance for an unconfigured tenant", async () => {
    expect((await api.getWinView("a", "legacy", seller)).state).toBe("legacy");
    const v = await api.actOnWin("a", "minimal", seller, { action: "accept", expectedPolicyRevision: 0, expectedRevision: 0, acceptedOn: "2026-10-01", evidence: "Cliente aceptó por escrito" });
    expect(v.state).toBe("consolidated"); expect((await db.proposals.findUniqueOrThrow({ where: { proposal_id: "minimal" } })).outcome_at?.toISOString()).toBe("2026-10-01T06:00:00.000Z");
  });
  it("requires the configured checks, binds them to a snapshot and blocks direct PATCH bypass", async () => {
    await api.saveWinPolicy("a", seller, { reviewNoticeUserIds: ["seller"], rules: [rule, { ...rule, id: "legal", label: "Contrato", approverRoles: [], approverUserIds: ["legal"], dependsOn: ["finance"] }] }, 0);
    expect(await proposals.setProposalOutcomeByTenant("a", "p", "won", seller, true)).toBe("consolidation_required");
    await api.actOnWin("a", "p", seller, { action: "accept", expectedRevision: 0, expectedPolicyRevision: 1, acceptedOn: "2026-10-01", evidence: "Orden de compra sintética" });
    expect((await db.proposals.findUniqueOrThrow({ where: { proposal_id: "p" } })).outcome).toBeNull();
    expect((await kpis.getProposalKpiSummaryByTenant("a")).wonAmount).toBe(200);
    await expect(api.actOnWin("a", "p", seller, { action: "consolidate", expectedRevision: 1 })).rejects.toThrow("Faltan");
    await expect(api.actOnWin("a", "p", legal, { action: "decide", expectedRevision: 1, ruleId: "legal", decision: "approved", evidence: "Contrato firmado" })).rejects.toThrow("previas");
    await expect(api.actOnWin("a", "p", seller, { action: "decide", expectedRevision: 1, ruleId: "finance", decision: "approved", evidence: "No permitido" })).rejects.toMatchObject({ status: 403 });
  });
  it("notifies the designated owner of current internal reviews and only the ready consolidation approver", async () => {
    expect((await api.getApprovalNotices("a", seller)).map(n => n.proposalId)).toEqual(["review-needed"]);
    expect(await api.getApprovalNotices("a", { userId: "other-owner", userRole: "owner", isSuperAdmin: false })).toEqual([]);
    expect((await api.getApprovalNotices("a", financial)).map(n => ({ id: n.proposalId, kind: n.kind }))).toEqual([{ id: "p", kind: "consolidation" }]);
    expect(await api.getApprovalNotices("a", legal)).toEqual([]);
    await expect(api.getApprovalNotices("a", { userId: "intruder", userRole: "owner", isSuperAdmin: false })).rejects.toMatchObject({ status: 403 });
  });
  it("isolates companies and preserves pending policies despite a new minimum configuration", async () => {
    await expect(api.getWinView("b", "p", { userId: "intruder", userRole: "user", isSuperAdmin: false })).rejects.toMatchObject({ status: 404 });
    await expect(api.getWinView("a", "p", { userId: "intruder", userRole: "owner", isSuperAdmin: false })).rejects.toMatchObject({ status: 403 });
    await expect(pool.query("INSERT INTO win_cases VALUES('b','p',1,'{}')")).rejects.toMatchObject({ code: "23503" });
    await api.saveWinPolicy("a", seller, { rules: [] }, 1);
    expect(await proposals.setProposalOutcomeByTenant("a", "p", "won", seller, true)).toBe("consolidation_required");
    const view = await api.getWinView("a", "p", legal);
    expect(view.case?.policyRevision).toBe(1); expect(view.requirements).toHaveLength(2);
    expect(view.canConsolidate).toBe(false); expect(view.canRecordAcceptance).toBe(false);
  });
  it("serializes decisions, records rejection without losing the deal and clears downstream OKs", async () => {
    const input = { action: "decide" as const, expectedRevision: 1, ruleId: "finance", decision: "approved" as const, evidence: "Crédito aprobado" };
    const concurrent = await Promise.allSettled([api.actOnWin("a", "p", financial, input), api.actOnWin("a", "p", financial, input)]);
    expect(concurrent.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect((await api.getApprovalNotices("a", legal)).map(n => n.proposalId)).toEqual(["p"]);
    expect(await api.getApprovalNotices("a", financial)).toEqual([]);
    await api.actOnWin("a", "p", legal, { action: "decide", expectedRevision: 2, ruleId: "legal", decision: "approved", evidence: "Contrato firmado" });
    const rejected = await api.actOnWin("a", "p", financial, { action: "decide", expectedRevision: 3, ruleId: "finance", decision: "rejected", evidence: "Crédito suspendido" });
    expect(rejected.state).toBe("blocked"); expect(rejected.requirements.find(r => r.id === "legal")?.decision).toBeNull();
    expect((await db.proposals.findUniqueOrThrow({ where: { proposal_id: "p" } })).outcome).toBeNull();
  });
  it("detects document changes and requires an explicit fresh acceptance", async () => {
    await db.formal_proposals.update({ where: { proposal_doc_id: "formal-p" }, data: { currency: "USD" } });
    expect((await api.getWinView("a", "p", seller)).state).toBe("stale");
    await expect(api.actOnWin("a", "p", financial, { action: "decide", expectedRevision: 4, ruleId: "finance", decision: "approved", evidence: "Anterior" })).rejects.toThrow("cambió");
    await db.formal_proposals.update({ where: { proposal_doc_id: "formal-p" }, data: { currency: "MXN" } });
  });
  it("consolidates only after every OK and cannot close a second alternative", async () => {
    await api.actOnWin("a", "p", financial, { action: "decide", expectedRevision: 4, ruleId: "finance", decision: "approved", evidence: "Crédito restablecido" });
    await api.actOnWin("a", "p", legal, { action: "decide", expectedRevision: 5, ruleId: "legal", decision: "approved", evidence: "Contrato revisado" });
    const concurrent = await Promise.allSettled([1, 2].map(() => api.actOnWin("a", "p", seller, { action: "consolidate", expectedRevision: 6 })));
    expect(concurrent.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const row = await db.proposals.findUniqueOrThrow({ where: { proposal_id: "p" } }); expect(row.outcome).toBe("won");
    expect(await api.getApprovalNotices("a", legal)).toEqual([]);
    expect((await kpis.getProposalKpiSummaryByTenant("a")).wonAmount).toBe(300);
    expect(await db.proposal_audit_events.count({ where: { proposal_id: "p", event_type: "outcome_changed" } })).toBe(1);
    await expect(api.actOnWin("a", "alternative", seller, { action: "accept", expectedRevision: 0, expectedPolicyRevision: 2, acceptedOn: "2026-10-01", evidence: "Otra opción" })).rejects.toThrow("ya tiene");
    await expect(api.invalidateWinCase(db, "a", "p", seller.userId, "document_changed")).rejects.toThrow("Retira primero");
  });
  it("requires actual actor membership, respects thresholds and rejects invalid foreign approvers", async () => {
    await expect(api.saveWinPolicy("a", seller, { rules: [{ ...rule, approverUserIds: ["intruder"] }] }, 2)).rejects.toMatchObject({ status: 422 });
    await api.saveWinPolicy("a", seller, { rules: [{ ...rule, minimumAmount: 100, currency: "USD" }] }, 2);
    await expect(api.actOnWin("a", "threshold", seller, { action: "accept", expectedRevision: 0, expectedPolicyRevision: 3, acceptedOn: "2026-10-01", evidence: "Umbral" })).rejects.toThrow("moneda");
    await pool.query("UPDATE app_users SET active=false WHERE user_id='finance'");
    await expect(api.getWinView("a", "p", financial)).rejects.toMatchObject({ status: 403 });
    await expect(api.saveWinPolicy("a", seller, { rules: [] }, 2)).rejects.toThrow("cambió");
  });
  it("sends one email for a concurrent request and persists an uncertain result without resending", async () => {
    vi.stubEnv("VERCEL_ENV", "production"); vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://cotiza.example.test");
    await db.app_users.create({ data: { user_id: "user_notice_owner", alias: "notice-owner", first_name: "Owner", last_name: "Synthetic", email: "owner@example.test", role: "owner", tenant_id: "a", password_hash: "unused", created_at: new Date(), active: true } });
    await api.saveWinPolicy("a", seller, { rules: [], reviewNoticeUserIds: ["user_notice_owner"], approvalEmailEnabled: true }, 3);
    email.send.mockResolvedValue({ data: { id: "synthetic-provider-id" }, error: null });
    const { sendApprovalNotices } = await import("@/lib/email/approval-notice");
    const results = await Promise.all([sendApprovalNotices("a", "review-needed"), sendApprovalNotices("a", "review-needed")]);
    expect(results.reduce((n, r) => n + r.sent, 0)).toBe(1); expect(email.send).toHaveBeenCalledTimes(1);
    expect(email.send.mock.calls[0]![0]).toMatchObject({ to: ["owner@example.test"] });
    expect(email.send.mock.calls[0]![0].text).toContain("/propuestas?proposalId=review-needed");
    expect((await pool.query("SELECT state,provider_id FROM approval_email_outbox")).rows).toEqual([{ state: "sent", provider_id: "synthetic-provider-id" }]);
    await db.proposal_audit_events.create({ data: { event_id: "new-review-cycle", event_hash: "synthetic", tenant_id: "a", proposal_id: "review-needed", event_type: "status_change_requested", payload: JSON.stringify({ ok: true, resultStatus: "in_review" }), created_at: new Date() } });
    email.send.mockRejectedValue(new Error("Synthetic lost provider response"));
    expect((await sendApprovalNotices("a", "review-needed")).issues).toBe(1);
    await sendApprovalNotices("a", "review-needed"); expect(email.send).toHaveBeenCalledTimes(2);
    expect((await pool.query("SELECT state FROM approval_email_outbox ORDER BY created_at")).rows.map(r => r.state)).toEqual(["sent", "unknown"]);
  });
});
