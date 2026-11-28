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
    const customerEvidenceSql = readFileSync(new URL("../../prisma/manual/20261127_customer_acceptance_files.sql", import.meta.url), "utf8");
    await pool.query(customerEvidenceSql); await pool.query(customerEvidenceSql);
    const mailSql = readFileSync(new URL("../../prisma/manual/20261113_approval_email_outbox.sql", import.meta.url), "utf8");
    await pool.query(mailSql); await pool.query(mailSql);
    const procurementSql=readFileSync(new URL("../../prisma/manual/20261117_procurement_drafts.sql",import.meta.url),"utf8");
    await pool.query(procurementSql); await pool.query(procurementSql);
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
  async function purchasingProposal(id:string,tenant="a",creator="seller",currency:string|null="USD") {
    await db.proposals.create({data:{proposal_id:id,tenant_id:tenant,status:"approved",created_by:creator,created_by_user_id:creator,created_at:new Date("2026-01-01")}});
    await db.proposal_items.create({data:{item_id:`item-${id}`,proposal_id:id,tenant_id:tenant,item_number:1,sku:"SYNTHETIC",description:"Licencia de prueba",
      quantity:2,cost_unit:10,price_unit:20,subtotal_cost:20,subtotal_price:40,status:"active",component_type:"product",origin:"vendor",created_at:new Date()}});
    await db.formal_proposals.create({data:{proposal_doc_id:`formal-${id}`,proposal_id:id,tenant_id:tenant,proposal_number:`PROP-${id}`,
      issued_date:new Date("2026-01-01"),issuer_company:"Empresa de prueba",recipient_company:"Cliente de prueba",currency,created_at:new Date()}});
    await db.proposal_integrated_node.create({data:{proposal_id:id,tenant_id:tenant,total_price:40,total_cost:20,status:"active",updated_at:new Date()}});
  }
  it("keeps procurement off by default and does not copy a previous close when enabled",async()=>{
    await purchasingProposal("purchase-manual");
    const closed=await api.actOnWin("a","purchase-manual",seller,{action:"accept",expectedRevision:0,expectedPolicyRevision:4,acceptedOn:"2026-10-01",evidence:"Aceptación de prueba"});
    expect(closed.state).toBe("consolidated");
    expect((await pool.query("SELECT count(*) FROM procurement_drafts")).rows[0].count).toBe("0");
    expect((await api.getProcurementView("a","purchase-manual",seller)).enabled).toBe(false);
    await expect(api.actOnProcurement("a","purchase-manual",seller,{action:"prepare",expectedWinRevision:1,expectedFingerprint:closed.case!.fingerprint})).rejects.toMatchObject({status:403});
    await api.saveWinPolicy("a",seller,{rules:[],procurementDraftsEnabled:true},4);
    expect((await pool.query("SELECT count(*) FROM procurement_drafts")).rows[0].count).toBe("0");
    expect((await api.getProcurementView("a","legacy",seller)).canPrepare).toBe(false);
  });
  it("prepares once under concurrent retries, preserves source and versions preparation notes",async()=>{
    const view=await api.getProcurementView("a","purchase-manual",seller);
    const input={action:"prepare" as const,expectedWinRevision:view.winRevision!,expectedFingerprint:view.fingerprint!};
    const results=await Promise.all([api.actOnProcurement("a","purchase-manual",seller,input),api.actOnProcurement("a","purchase-manual",seller,input)]);
    expect(new Set(results.map(result=>result.drafts[0].id)).size).toBe(1);
    const draft=results[0].drafts[0];expect(draft.folio).toMatch(/^REQ-\d{4}-0001$/);
    expect(draft.basis).toMatchObject({currency:"USD",proposalId:"purchase-manual",winRevision:1,items:[{quantity:2,costUnit:10,subtotalCost:20}]});
    expect(draft.current).toBe(true);
    const updated=await api.actOnProcurement("a","purchase-manual",seller,{action:"update",draftId:draft.id,expectedRevision:1,notes:"Entrega de prueba",neededOn:"2026-12-10"});
    expect(updated.drafts[0]).toMatchObject({revision:2,notes:"Entrega de prueba",neededOn:"2026-12-10",sourceHash:draft.sourceHash});
    expect(updated.drafts[0].basis).toEqual(draft.basis);
    await expect(api.actOnProcurement("a","purchase-manual",seller,{action:"update",draftId:draft.id,expectedRevision:1,notes:"Anterior",neededOn:null})).rejects.toThrow("cambió");
    expect((await pool.query("SELECT event_type FROM procurement_draft_events WHERE draft_id=$1 ORDER BY revision",[draft.id])).rows.map(r=>r.event_type)).toEqual(["prepared","updated"]);
  });
  it("automatically creates only after all pinned OKs and blocks the previous outcome shortcut",async()=>{
    await db.app_users.update({where:{user_id:"finance"},data:{active:true}});
    await api.saveWinPolicy("a",seller,{rules:[rule],procurementDraftsEnabled:true},5);
    await purchasingProposal("purchase-auto");
    expect(await proposals.setProposalOutcomeByTenant("a","purchase-auto","won",seller,true)).toBe("consolidation_required");
    const accepted=await api.actOnWin("a","purchase-auto",seller,{action:"accept",expectedRevision:0,expectedPolicyRevision:6,acceptedOn:"2026-10-01",evidence:"Aceptación de prueba"});
    expect((await api.getProcurementView("a","purchase-auto",seller)).drafts).toHaveLength(0);
    await expect(api.actOnProcurement("a","purchase-auto",seller,{action:"prepare",expectedWinRevision:1,expectedFingerprint:accepted.case!.fingerprint})).rejects.toThrow("consolidación");
    await api.actOnWin("a","purchase-auto",financial,{action:"decide",expectedRevision:1,ruleId:"finance",decision:"approved",evidence:"Anticipo de prueba"});
    expect((await api.getProcurementView("a","purchase-auto",seller)).drafts).toHaveLength(0);
    await api.actOnWin("a","purchase-auto",seller,{action:"consolidate",expectedRevision:2});
    const prepared=await api.getProcurementView("a","purchase-auto",seller);
    expect(prepared.drafts).toHaveLength(1);expect(prepared.drafts[0].basis.approvals[0]).toMatchObject({ruleId:"finance",actorId:"finance",decision:"approved"});
    expect(prepared.drafts[0].folio).toMatch(/0002$/);
  });
  it("detects direct document changes and retains the old draft when the close is withdrawn",async()=>{
    const old=(await api.getProcurementView("a","purchase-manual",seller)).drafts[0];
    await db.formal_proposals.update({where:{proposal_doc_id:"formal-purchase-manual"},data:{currency:"MXN"}});
    const stale=await api.getProcurementView("a","purchase-manual",seller);expect(stale.drafts[0]).toMatchObject({current:false,state:"review_required"});
    expect(stale.drafts[0].basis.currency).toBe("USD");
    await expect(api.actOnProcurement("a","purchase-manual",seller,{action:"update",draftId:old.id,expectedRevision:2,notes:"No guardar",neededOn:null})).rejects.toThrow("cambió");
    await db.formal_proposals.update({where:{proposal_doc_id:"formal-purchase-manual"},data:{currency:"USD"}});
    expect(await proposals.setProposalOutcomeByTenant("a","purchase-manual",null,seller,true)).toBe("updated");
    const changed=(await api.getProcurementView("a","purchase-manual",seller)).drafts[0];
    expect(changed.state).toBe("review_required");expect(changed.basis).toEqual(old.basis);
    expect((await pool.query("SELECT state FROM procurement_drafts WHERE draft_id=$1",[old.id])).rows[0].state).toBe("review_required");
  });
  it("isolates tenant and seller access, revalidates roles, and keeps source/history immutable in SQL",async()=>{
    const outsider:WinActor={userId:"intruder",userRole:"owner",isSuperAdmin:false};
    await expect(api.getProcurementView("a","purchase-auto",outsider)).rejects.toMatchObject({status:403});
    await expect(api.getProcurementView("b","purchase-auto",{...outsider,userRole:"user"})).rejects.toMatchObject({status:404});
    await expect(api.getProcurementView("a","purchase-auto",legal)).rejects.toMatchObject({status:404});
    await expect(api.getProcurementView("a","purchase-auto",{...legal,isSuperAdmin:true,userRole:"superadmin"})).rejects.toMatchObject({status:404});
    const draft=(await api.getProcurementView("a","purchase-auto",seller)).drafts[0];
    await expect(pool.query("UPDATE procurement_drafts SET basis='{}',revision=revision+1 WHERE draft_id=$1",[draft.id])).rejects.toMatchObject({code:"23514"});
    await expect(pool.query("DELETE FROM procurement_drafts WHERE draft_id=$1",[draft.id])).rejects.toMatchObject({code:"23514"});
    await expect(pool.query("UPDATE procurement_draft_events SET actor_id='changed' WHERE draft_id=$1",[draft.id])).rejects.toMatchObject({code:"23514"});
    await expect(pool.query("INSERT INTO procurement_drafts(draft_id,tenant_id,proposal_id,closure_key,source_hash,folio,basis,created_by,updated_by) VALUES('foreign-draft','b','purchase-auto',$1,$2,'REQ-FOREIGN','{}','intruder','intruder')",["c".repeat(64),"a".repeat(64)])).rejects.toMatchObject({code:"23503"});
    expect((await api.listProcurementDrafts("a",legal)).items).toHaveLength(0);
    expect((await api.listProcurementDrafts("a",seller)).items).toHaveLength(2);
  });
  it("rolls back the win when enabled preparation has an incomplete source and preserves other tenants",async()=>{
    await api.saveWinPolicy("a",seller,{rules:[],procurementDraftsEnabled:true},6);
    await purchasingProposal("purchase-incomplete","a","seller",null);
    await expect(api.actOnWin("a","purchase-incomplete",seller,{action:"accept",expectedRevision:0,expectedPolicyRevision:7,acceptedOn:"2026-10-01",evidence:"Aceptación de prueba"})).rejects.toMatchObject({status:422});
    expect((await db.proposals.findUniqueOrThrow({where:{proposal_id:"purchase-incomplete"}})).outcome).toBeNull();
    expect((await api.getWinView("a","purchase-incomplete",seller)).case).toBeNull();
    expect((await api.listProcurementDrafts("b",{userId:"intruder",userRole:"user",isSuperAdmin:false})).enabled).toBe(false);
  });
  it("numbers each tenant independently and enforces SQL row isolation for a restricted reader",async()=>{
    await db.app_users.create({data:{user_id:"buyer-b",alias:"buyer-b",first_name:"Buyer",last_name:"Synthetic",role:"owner",tenant_id:"b",password_hash:"unused",active:true,created_at:new Date()}});
    const buyer:WinActor={userId:"buyer-b",userRole:"owner",isSuperAdmin:false};
    await api.saveWinPolicy("b",buyer,{rules:[],procurementDraftsEnabled:true},0);
    await purchasingProposal("purchase-b","b","buyer-b");
    await api.actOnWin("b","purchase-b",buyer,{action:"accept",expectedRevision:0,expectedPolicyRevision:1,acceptedOn:"2026-10-01",evidence:"Aceptación de prueba"});
    const only=(await api.getProcurementView("b","purchase-b",buyer)).drafts[0];expect(only.folio).toMatch(/0001$/);
    expect((await api.listProcurementDrafts("b",buyer)).items).toHaveLength(1);
    await pool.query("CREATE ROLE procurement_reader NOLOGIN");
    await pool.query("GRANT SELECT ON procurement_drafts,procurement_draft_events,procurement_draft_counters TO procurement_reader");
    const client=await pool.connect();
    try{
      await client.query("BEGIN");await client.query("SET LOCAL ROLE procurement_reader");
      await client.query("SELECT set_config('app.tenant_id','b',true)");
      expect((await client.query("SELECT count(*) FROM procurement_drafts")).rows[0].count).toBe("1");
      expect((await client.query("SELECT count(*) FROM procurement_drafts WHERE tenant_id='a'")).rows[0].count).toBe("0");
      expect((await client.query("SELECT count(*) FROM procurement_draft_events WHERE tenant_id='a'")).rows[0].count).toBe("0");
    }finally{await client.query("ROLLBACK");client.release();}
  });
  it("keeps verbal acceptance pending, blocks direct wins and preserves its written requirement when policy changes", async () => {
    const policy = await api.getWinPolicy("a");
    const required = await api.saveWinPolicy("a", seller, { rules: [], customerEvidenceRequired: true }, policy.revision);
    await purchasingProposal("verbal-confirmation");
    expect(await proposals.setProposalOutcomeByTenant("a", "verbal-confirmation", "won", seller, true)).toBe("consolidation_required");
    await expect(api.actOnWin("a", "verbal-confirmation", seller, { action: "accept", expectedRevision: 0, expectedPolicyRevision: required.revision, acceptedOn: "2026-10-01", evidence: "Referencia sin medio ni autor" })).rejects.toMatchObject({ status: 422 });
    const confirmation = { channel: "verbal" as const, confirmedBy: "Cliente de prueba", contact: "" };
    const pending = await api.actOnWin("a", "verbal-confirmation", seller, { action: "accept", expectedRevision: 0, expectedPolicyRevision: required.revision, acceptedOn: "2026-10-01", evidence: "Confirmó por teléfono", confirmation });
    expect(pending.state).toBe("evidence_pending"); expect(pending.canRecordAcceptance).toBe(true); expect(pending.canConsolidate).toBe(false);
    expect((await db.proposals.findUniqueOrThrow({ where: { proposal_id: "verbal-confirmation" } })).outcome).toBeNull();
    await expect(api.actOnWin("a", "verbal-confirmation", seller, { action: "consolidate", expectedRevision: 1 })).rejects.toThrow();
    expect((await api.getApprovalNotices("a", seller)).some(n => n.proposalId === "verbal-confirmation")).toBe(false);
    const changed = await api.saveWinPolicy("a", seller, { rules: [{ ...rule, minimumAmount: 10, currency: "MXN" }], customerEvidenceRequired: false }, required.revision);
    const complete = await api.actOnWin("a", "verbal-confirmation", seller, { action: "accept", expectedRevision: 1, expectedPolicyRevision: changed.revision, acceptedOn: "2026-10-02", evidence: "Acepto la propuesta PROP-verbal-confirmation por 40 USD", confirmation: { ...confirmation, channel: "whatsapp" } });
    expect(complete.state).toBe("consolidated"); expect(complete.case?.policyRevision).toBe(required.revision); expect(complete.case?.customerEvidenceRequired).toBe(true);
    expect(await db.proposal_audit_events.count({ where: { proposal_id: "verbal-confirmation", event_type: "win_consolidation" } })).toBe(2);
  });
  it("stores original files atomically, deduplicates per proposal, and checks both tenant and proposal access on download", async () => {
    const current = await api.getWinPolicy("a");
    const policy = await api.saveWinPolicy("a", seller, { rules: [], customerEvidenceRequired: true }, current.revision);
    await purchasingProposal("written-file"); await purchasingProposal("file-other-proposal");
    const confirmation = { channel: "email" as const, confirmedBy: "Cliente de prueba", contact: "cliente@example.test" };
    const bytes = new Uint8Array(Buffer.from("From: cliente@example.test\r\nSubject: Acepto la propuesta\r\n\r\nAdelante con 40 USD"));
    const file = { bytes, filename: "aceptacion.eml", mimeType: "message/rfc822" };
    const input = { action: "accept" as const, expectedRevision: 0, expectedPolicyRevision: policy.revision, acceptedOn: "2026-10-01", evidence: "", confirmation };
    await expect(api.actOnWin("a", "written-file", seller, input)).rejects.toMatchObject({ status: 422 });
    const closed = await api.actOnWin("a", "written-file", seller, input, file);
    const attachment = closed.case!.customerConfirmation!.attachment!;
    expect(closed.state).toBe("consolidated");
    expect(Buffer.from((await api.getCustomerEvidenceFile("a", "written-file", attachment.id, seller))!.bytes)).toEqual(Buffer.from(bytes));
    expect(await api.getCustomerEvidenceFile("a", "file-other-proposal", attachment.id, seller)).toBeNull();
    await expect(api.getCustomerEvidenceFile("b", "written-file", attachment.id, { userId: "intruder", userRole: "user", isSuperAdmin: false })).rejects.toMatchObject({ status: 404 });
    await expect(api.getCustomerEvidenceFile("a", "written-file", attachment.id, legal)).rejects.toMatchObject({ status: 404 });
    expect(await proposals.setProposalOutcomeByTenant("a", "written-file", null, seller, true)).toBe("updated");
    const retry = await api.actOnWin("a", "written-file", seller, { ...input, expectedRevision: closed.case!.revision + 1 }, file);
    expect(retry.case!.customerConfirmation!.attachment!.id).toBe(attachment.id);
    expect((await pool.query("SELECT count(*) FROM customer_acceptance_files WHERE proposal_id='written-file'")).rows[0].count).toBe("1");
    const procurementPolicy = await api.saveWinPolicy("a", seller, { rules: [], customerEvidenceRequired: true, procurementDraftsEnabled: true }, policy.revision);
    await purchasingProposal("file-procurement");
    await api.actOnWin("a", "file-procurement", seller, { ...input, expectedPolicyRevision: procurementPolicy.revision }, file);
    const requisition = await api.getProcurementView("a", "file-procurement", seller);
    expect(requisition.drafts[0].basis.customerConfirmation).toMatchObject({ ...confirmation, attachment: { filename: "aceptacion.eml", sha256: attachment.sha256 } });
    await purchasingProposal("file-rollback", "a", "seller", null);
    await expect(api.actOnWin("a", "file-rollback", seller, { ...input, expectedPolicyRevision: procurementPolicy.revision }, file)).rejects.toMatchObject({ status: 422 });
    expect((await pool.query("SELECT count(*) FROM customer_acceptance_files WHERE proposal_id='file-rollback'")).rows[0].count).toBe("0");
    expect((await api.getWinView("a", "file-rollback", seller)).case).toBeNull();
  });
});
