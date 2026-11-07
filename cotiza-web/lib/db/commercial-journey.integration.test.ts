import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const suite = process.env.COTIZA_WORKSPACE_NATIVE === "1" ? describe : describe.skip;

suite("complete commercial journey on disposable PostgreSQL", () => {
  let db: typeof import("./prisma").prisma;
  let declare: typeof import("./declare-opportunity").declareOpportunity;
  let quotes: typeof import("./quotes");
  let proposals: typeof import("./proposals");
  let kpis: typeof import("./proposal-kpis");
  let workspace: typeof import("./opportunity-workspace");
  const tenant = `journey-${randomUUID()}`, foreign = `foreign-${randomUUID()}`, clientId = randomUUID();
  const actor = { userId: `seller-${randomUUID()}`, userRole: "owner" as const, isSuperAdmin: false };
  let opportunityId: string, firstQuoteId: string, revisionId: string, alternativeId: string;
  let firstProposalId: string, revisionProposalId: string, alternativeProposalId: string;
  beforeAll(async () => {
    if (new URL(process.env.DATABASE_URL!).hostname !== "127.0.0.1") throw Error("Disposable local DB only");
    ({ prisma: db } = await import("./prisma"));
    ({ declareOpportunity: declare } = await import("./declare-opportunity"));
    quotes = await import("./quotes"); proposals = await import("./proposals");
    kpis = await import("./proposal-kpis"); workspace = await import("./opportunity-workspace");
    for (const t of [tenant, foreign]) await db.tenant.create({ data: { tenant_id: t, name: t, slug: t, created_at: new Date() } });
    await db.client.create({ data: { client_id: clientId, tenant_id: tenant, company: "Cliente sintético", active: true, created_at: new Date() } });
  });
  afterAll(async () => db?.$disconnect());

  it("declares one consecutive folio and keeps initial population in revision one", async () => {
    const input = { creationId: randomUUID(), clientId, title: "Renovación sintética" };
    const o = await declare(tenant, actor.userId, input); opportunityId = o.opportunityId;
    expect(o.opportunityNumber).toBe("OPP-0001");
    expect((await declare(tenant, actor.userId, input)).opportunityId).toBe(opportunityId);
    const q = await quotes.createQuoteForTenant(tenant, { clientId, clientName: "Cliente sintético", opportunityMode: "existing", opportunityId, creationId: randomUUID() }, actor.userId);
    firstQuoteId = q.quoteId;
    const filled = await quotes.importQuoteLinesByTenant(tenant, firstQuoteId, [{ sku: "SYN-1", description: "Licencia de prueba", quantity: 10, costUnit: 80, priceUnit: 100, lineType: "product" }]);
    expect(filled).toMatchObject({ quoteId: firstQuoteId, version: 1, versionCreated: false });
    expect(await db.opportunities.count({ where: { tenant_id: tenant } })).toBe(1);
  });

  it("creates proposals for an original, a revision and a commercial alternative without generating revenue", async () => {
    const p = await proposals.createProposalFromQuoteByTenant(tenant, { quoteId: firstQuoteId }, "Vendedor sintético", actor.userId);
    firstProposalId = p!.proposalId;
    expect((await proposals.createProposalFromQuoteByTenant(tenant, { quoteId: firstQuoteId }, "Vendedor sintético", actor.userId))!.proposalId).toBe(firstProposalId);
    const revision = await quotes.importQuoteLinesByTenant(tenant, firstQuoteId, [{ sku: "SYN-1", description: "Licencia ajustada", quantity: 10, costUnit: 88, priceUnit: 110, lineType: "product" }]);
    revisionId = revision!.quoteId; expect(revision!.version).toBe(2);
    revisionProposalId = (await proposals.createProposalFromQuoteByTenant(tenant, { quoteId: revisionId }, "Vendedor sintético", actor.userId))!.proposalId;
    const alternative = await quotes.createQuoteForTenant(tenant, { clientId, clientName: "Cliente sintético", opportunityMode: "new", proposalName: "Alternativa", creationId: randomUUID() }, actor.userId);
    alternativeId = alternative.quoteId;
    await quotes.importQuoteLinesByTenant(tenant, alternativeId, [{ sku: "SYN-2", description: "Opción ampliada", quantity: 10, costUnit: 120, priceUnit: 150, lineType: "product" }]);
    alternativeProposalId = (await proposals.createProposalFromQuoteByTenant(tenant, { quoteId: alternativeId }, "Vendedor sintético", actor.userId))!.proposalId;
    const a = await db.quote.findUniqueOrThrow({ where: { quote_id: alternativeId } });
    const root = await db.quote.findUniqueOrThrow({ where: { quote_id: firstQuoteId } });
    const set = { version: 1, id: randomUUID(), canonicalOpportunityId: opportunityId, memberOpportunityIds: [opportunityId, a.opportunity_id!], placeholderQuoteIds: [], selectedOptionId: null, options: [{ id: "base", ordinal: 1, label: "Base", quoteIds: [firstQuoteId] }, { id: "expanded", ordinal: 2, label: "Ampliada", quoteIds: [alternativeId] }], configuredBy: actor.userId, configuredAt: new Date().toISOString() };
    await db.quote.update({ where: { quote_id: firstQuoteId }, data: { input_metadata: { ...(root.input_metadata as object), commercialOptionsSet: set } } });
    expect((await kpis.getProposalKpiSummaryByTenant(tenant)).wonAmount).toBe(0);
    expect(await proposals.setProposalOutcomeByTenant(tenant, revisionProposalId, "won", actor, true)).toBe("invalid_status");
    for (const pid of [firstProposalId, revisionProposalId, alternativeProposalId]) {
      await proposals.updateProposalWorkflowByTenant(tenant, pid, { status: "in_review" }, actor);
      const approved = await proposals.registerProposalApprovalByTenant(tenant, pid, { decision: "approved" }, actor);
      expect(approved?.status).toBe("approved");
      expect(approved?.formal?.sentAt).toBeNull();
    }
    expect((await kpis.getProposalKpiSummaryByTenant(tenant)).wonAmount).toBe(0);
  });

  it("records one dated win and counts only the accepted revision across dossier and monthly KPIs", async () => {
    const { mexicoCalendarDate } = await import("@/lib/domain/commercial-close-date");
    const closedOn = mexicoCalendarDate(new Date());
    expect(await proposals.setProposalOutcomeByTenant(tenant, revisionProposalId, "won", actor, true, { closedOn })).toBe("updated");
    expect(await proposals.setProposalOutcomeByTenant(tenant, revisionProposalId, "won", actor, true, { closedOn })).toBe("updated");
    expect(await db.proposal_audit_events.count({ where: { proposal_id: revisionProposalId, event_type: "outcome_changed" } })).toBe(1);
    expect(await kpis.getProposalKpiSummaryByTenant(tenant)).toMatchObject({ wonAmount: 1100, wonProfit: 220, undatedWonCount: 0 });
    const timeline = await kpis.getProposalMarginTimelineByTenant(tenant);
    expect(timeline.reduce((n, r) => n + r.wonAmount, 0)).toBe(1100);
    const decisions = await kpis.getProposalOutcomeTimelineByTenant(tenant);
    expect(decisions.reduce((n, r) => n + r.wonCount, 0)).toBe(1);
    expect(decisions.find(r => r.wonCount === 1)?.period.slice(0, 7)).toBe(closedOn.slice(0, 7));
    const w = await workspace.getBusinessWorkspace(tenant, opportunityId, { userId: actor.userId, canSeeAll: true });
    expect(w?.opportunity).toMatchObject({ stage: "won", amount: 1100 });
    expect(w?.quotes).toHaveLength(3); expect(w?.proposals).toHaveLength(3);
    expect(await kpis.getProposalKpiSummaryByTenant(foreign)).toMatchObject({ wonAmount: 0 });
    expect(await kpis.getProposalKpiSummaryByTenant(tenant, "another-seller", false)).toMatchObject({ wonAmount: 0 });
    expect(await proposals.setProposalOutcomeByTenant(foreign, revisionProposalId, "won", actor, true, { closedOn })).toBe("not_found");
  });

  it("prevents two winning revisions or alternatives of the same business", async () => {
    expect(await proposals.setProposalOutcomeByTenant(tenant, firstProposalId, "won", actor, true)).toBe("business_already_won");
    expect(await proposals.setProposalOutcomeByTenant(tenant, alternativeProposalId, "won", actor, true)).toBe("business_already_won");
    expect((await kpis.getProposalKpiSummaryByTenant(tenant)).wonAmount).toBe(1100);
  });

  it("serializes simultaneous winners and allows an explicit correction with its audit trail", async () => {
    expect(await proposals.setProposalOutcomeByTenant(tenant, revisionProposalId, null, actor, true)).toBe("updated");
    const results = await Promise.all([firstProposalId, alternativeProposalId].map(id => proposals.setProposalOutcomeByTenant(tenant, id, "won", actor, true)));
    expect(results.sort()).toEqual(["business_already_won", "updated"]);
    const winners = await db.proposals.findMany({ where: { tenant_id: tenant, outcome: "won" } });
    expect(winners).toHaveLength(1);
    expect(await proposals.setProposalOutcomeByTenant(tenant, winners[0].proposal_id, null, actor, true)).toBe("updated");
    expect(await proposals.setProposalOutcomeByTenant(tenant, revisionProposalId, "won", actor, true)).toBe("updated");
    expect((await kpis.getProposalKpiSummaryByTenant(tenant)).wonAmount).toBe(1100);
    const audit = await db.proposal_audit_events.findMany({ where: { proposal_id: revisionProposalId, event_type: "outcome_changed" } });
    expect(audit.map(row => JSON.parse(row.payload!).toOutcome)).toEqual(["won", null, "won"]);
  });

  it("permits a separate business for the same client without mixing its revenue", async () => {
    const separate = await declare(tenant, actor.userId, { creationId: randomUUID(), clientId, title: "Otro negocio real" });
    const q = await quotes.createQuoteForTenant(tenant, { clientId, clientName: "Cliente sintético", opportunityMode: "existing", opportunityId: separate.opportunityId, creationId: randomUUID() }, actor.userId);
    await quotes.importQuoteLinesByTenant(tenant, q.quoteId, [{ sku: "OTHER", description: "Servicio independiente", quantity: 1, costUnit: 80, priceUnit: 100, lineType: "service" }]);
    const p = await proposals.createProposalFromQuoteByTenant(tenant, { quoteId: q.quoteId }, "Vendedor sintético", actor.userId);
    await proposals.updateProposalWorkflowByTenant(tenant, p!.proposalId, { status: "in_review" }, actor);
    await proposals.registerProposalApprovalByTenant(tenant, p!.proposalId, { decision: "approved" }, actor);
    expect(await proposals.setProposalOutcomeByTenant(tenant, p!.proposalId, "won", actor, true)).toBe("updated");
    expect((await kpis.getProposalKpiSummaryByTenant(tenant)).wonAmount).toBe(1200);
  });
});
