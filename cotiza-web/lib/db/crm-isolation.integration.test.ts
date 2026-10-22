import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { TenantContext } from "@/lib/auth/tenant-context";

vi.mock("server-only", () => ({}));
const session = vi.hoisted(() => ({ current: vi.fn() }));
// Only the authenticated context is supplied by the harness. API handlers,
// application services, Prisma, transactions and PostgreSQL remain real.
vi.mock("@/lib/auth/tenant-context", () => ({ getCurrentTenantContext: session.current }));

const testUrl = process.env.COTIZA_TEST_DATABASE_URL;
const suite = testUrl ? describe : describe.skip;
const a = "crm-fixture-a", b = "crm-fixture-b";
const seller = "crm-seller-a", colleague = "crm-colleague-a", owner = "crm-owner-a", foreign = "crm-owner-b";
let db: typeof import("./prisma").prisma;
let clients: typeof import("@/app/api/clients/route");
let quotes: typeof import("@/app/api/quotes/route");
let proposals: typeof import("@/app/api/proposals/route");
let proposal: typeof import("@/app/api/proposals/[proposalId]/route");
let tasks: typeof import("@/app/api/tasks/route");
let task: typeof import("@/app/api/tasks/[taskId]/route");
let clientService: typeof import("./clients");
let taskService: typeof import("./tasks");
let quoteService: typeof import("./quotes");
let opportunityService: typeof import("./opportunities");
let proposalService: typeof import("./proposals");
let kpis: typeof import("./proposal-kpis");
let clientA: string, clientB: string, quoteA: string, quoteB: string;
let proposalA: string, opportunityA: string, taskA: string;

function asUser(tenantId: string, userId: string, role: "owner" | "user" = "user") {
  const context: TenantContext = {
    id: tenantId, slug: tenantId, name: tenantId, userId, userRole: role,
    userDisplayName: userId, authMode: "clerk", isSuperAdmin: false,
    accessScope: "subtenant", subtenantKey: `${tenantId}:${userId}`,
  };
  session.current.mockResolvedValue(context);
}
function request(body?: unknown, method = "POST") {
  return new Request("http://localhost/api/test", {
    method, ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }),
  });
}
const proposalContext = () => ({ params: Promise.resolve({ proposalId: proposalA }) });

suite("CRM workflow and authorization against disposable PostgreSQL", () => {
  beforeAll(async () => {
    const url = new URL(testUrl!);
    if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) throw new Error("Disposable localhost database required");
    process.env.DATABASE_URL = testUrl;
    ({ prisma: db } = await import("./prisma"));
    clients = await import("@/app/api/clients/route");
    quotes = await import("@/app/api/quotes/route");
    proposals = await import("@/app/api/proposals/route");
    proposal = await import("@/app/api/proposals/[proposalId]/route");
    tasks = await import("@/app/api/tasks/route");
    task = await import("@/app/api/tasks/[taskId]/route");
    clientService = await import("./clients"); taskService = await import("./tasks");
    quoteService = await import("./quotes"); opportunityService = await import("./opportunities");
    proposalService = await import("./proposals"); kpis = await import("./proposal-kpis");
    for (const id of [a, b]) await db.tenant.create({ data: { tenant_id: id, slug: id, name: id, created_at: new Date() } });
    for (const [id, tenantId, role] of [[seller, a, "user"], [colleague, a, "user"], [owner, a, "owner"], [foreign, b, "owner"]]) {
      await db.app_users.create({ data: { user_id: id, alias: id, first_name: "Fixture", last_name: id,
        tenant_id: tenantId, role, password_hash: "unused", created_at: new Date() } });
    }
  }, 30_000);
  afterAll(async () => { if (db) await db.$disconnect(); });

  it("creates each client under its authenticated company, ignoring a supplied tenant", async () => {
    asUser(a, seller);
    const first = await clients.POST(request({ company: "CRM Client A", tenantId: b }));
    expect(first.status).toBe(201); clientA = (await first.json()).client.clientId;
    asUser(b, foreign, "owner");
    const second = await clients.POST(request({ company: "CRM Client B" }));
    expect(second.status).toBe(201); clientB = (await second.json()).client.clientId;
    expect((await clientService.getClientByIdForTenant(clientA, a))?.tenantId).toBe(a);
    expect(await clientService.getClientByIdForTenant(clientA, b)).toBeNull();
    const visible = await clients.GET(request(undefined, "GET"));
    expect((await visible.json()).clients.map((c: { clientId: string }) => c.clientId)).toEqual([clientB]);
  });

  it("creates a quotation and opportunity in each company", async () => {
    for (const [tenantId, userId, clientId] of [[a, seller, clientA], [b, foreign, clientB]]) {
      asUser(tenantId, userId);
      const result = await quotes.POST(request({ clientId, clientName: `Client ${tenantId}`, proposalName: "CRM workflow" }));
      expect(result.status).toBe(201);
      const created = (await result.json()).quote;
      const row = await db.quote.findUniqueOrThrow({ where: { quote_id: created.quoteId } });
      expect(row.tenantId).toBe(tenantId); expect(row.client_id).toBe(clientId);
      expect(row.created_by_user_id).toBe(userId); expect(row.opportunity_id).toBeTruthy();
      if (tenantId === a) { quoteA = created.quoteId; opportunityA = row.opportunity_id!; }
      else quoteB = created.quoteId;
    }
  }, 15_000);

  it("rejects a foreign client before saving a quotation or opportunity", async () => {
    asUser(a, seller);
    const before = await db.quote.count({ where: { tenantId: a } });
    const oppBefore = await db.opportunities.count({ where: { tenant_id: a } });
    const result = await quotes.POST(request({ clientId: clientB, clientName: "Forged client" }));
    expect(result.status).toBe(404);
    expect(await db.quote.count({ where: { tenantId: a } })).toBe(before);
    expect(await db.opportunities.count({ where: { tenant_id: a } })).toBe(oppBefore);
  });

  it("rejects generating a proposal from another seller's quotation without writes", async () => {
    asUser(a, colleague);
    const before = await db.proposals.count({ where: { tenant_id: a } });
    const result = await proposals.POST(request({ quoteId: quoteA }));
    expect(result.status).toBe(404);
    expect(await db.proposals.count({ where: { tenant_id: a } })).toBe(before);
  });

  it("preserves the opportunity across quote version and proposal, and replays proposal creation", async () => {
    asUser(a, seller);
    const version = await quoteService.importQuoteLinesByTenant(a, quoteA, [{
      sku: "CRM-TEST", description: "Fixture service", quantity: 2, costUnit: 60, priceUnit: 100, lineType: "service",
    }]);
    expect(version).not.toBeNull();
    expect((await db.quote.findUniqueOrThrow({ where: { quote_id: version!.quoteId } })).opportunity_id).toBe(opportunityA);
    const response = await proposals.POST(request({ quoteId: version!.quoteId }));
    expect(response.status).toBe(201); proposalA = (await response.json()).proposal.proposalId;
    expect((await db.proposals.findUniqueOrThrow({ where: { proposal_id: proposalA } })).opportunity_id).toBe(opportunityA);
    const repeat = await proposals.POST(request({ quoteId: version!.quoteId }));
    expect((await repeat.json()).proposal.proposalId).toBe(proposalA);
    expect(await db.proposals.count({ where: { tenant_id: a, origin: version!.quoteId } })).toBe(1);
  });

  it("denies a foreign tenant and another seller, while allowing the seller and owner", async () => {
    for (const [tenantId, userId, role, status] of [
      [b, foreign, "owner", 404], [a, colleague, "user", 404], [a, seller, "user", 200], [a, owner, "owner", 200],
    ] as const) {
      asUser(tenantId, userId, role);
      expect((await proposal.GET(request(undefined, "GET"), proposalContext())).status).toBe(status);
    }
    expect(await quoteService.getQuoteGroupsByClientForTenant(b, clientA, foreign, true)).toEqual([]);
    expect(await proposalService.getProposalWorkflowByTenant(b, proposalA)).toBeNull();
  });

  it("rejects proposals from a foreign company and context forgery", async () => {
    asUser(a, seller);
    expect((await proposals.POST(request({ quoteId: quoteB, tenantId: b, isSuperAdmin: true }))).status).toBe(404);
    expect(await opportunityService.getOpportunityPipelineByTenant(b, seller, false)).toEqual([]);
  });

  it("creates follow-up for the same client and opportunity, rejecting crossed parents", async () => {
    asUser(a, seller);
    const response = await tasks.POST(request({ clientId: clientA, opportunityId: opportunityA,
      description: "Follow up proposal", dueDate: "2026-10-23" }));
    expect(response.status).toBe(201); taskA = (await response.json()).taskId;
    const foreignOpp = (await db.quote.findUniqueOrThrow({ where: { quote_id: quoteB } })).opportunity_id;
    expect((await tasks.POST(request({ clientId: clientA, opportunityId: foreignOpp,
      description: "Crossed task", dueDate: "2026-10-23" }))).status).toBe(404);
    expect(await db.tasks.count({ where: { tenant_id: a } })).toBe(1);
    expect((await taskService.getPendingTasksByClientForTenant(a, clientA, seller, false))[0].opportunityId).toBe(opportunityA);
    expect(await taskService.getPendingTasksByTenant(b)).toEqual([]);
    expect(await taskService.getPendingTasksByTenant(a, colleague, false)).toEqual([]);
  });

  it("blocks unauthorized task completion without modifying it, then lets its creator complete it", async () => {
    for (const [tenantId, userId, role, status] of [[b, foreign, "owner", 404], [a, colleague, "user", 403]] as const) {
      asUser(tenantId, userId, role);
      expect((await task.PATCH(request(undefined, "PATCH"), { params: Promise.resolve({ taskId: taskA }) })).status).toBe(status);
      expect((await db.tasks.findUniqueOrThrow({ where: { task_id: taskA } })).completed_at).toBeNull();
    }
    asUser(a, seller);
    expect((await task.PATCH(request(undefined, "PATCH"), { params: Promise.resolve({ taskId: taskA }) })).status).toBe(200);
    expect(await taskService.getPendingTasksByClientForTenant(a, clientA, seller, false)).toEqual([]);
  });

  it("closes and reopens the proposal without resetting the opportunity or mixing KPIs", async () => {
    const actor = { isSuperAdmin: false, userId: owner, userRole: "owner" as const };
    await proposalService.updateProposalWorkflowByTenant(a, proposalA, { status: "sent" }, actor);
    asUser(a, seller);
    const result = await proposal.PATCH(request({ outcome: "won", closedOn: new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date()) }, "PATCH"), proposalContext());
    expect(result.status).toBe(200);
    expect(await kpis.getProposalKpiSummaryByTenant(a, seller, false)).toMatchObject({ wonAmount: 200, wonProfit: 80 });
    expect(await kpis.getProposalKpiSummaryByTenant(b)).toMatchObject({ wonAmount: 0 });
    expect(await kpis.getProposalKpiSummaryByTenant(a, colleague, false)).toMatchObject({ wonAmount: 0 });
    const before = await db.opportunities.findUniqueOrThrow({ where: { opportunity_id: opportunityA } });
    expect((await opportunityService.getOpportunityPipelineByTenant(a)).find(row => row.opportunityId === opportunityA)?.stage).toBe("won");
    await proposalService.updateProposalWorkflowByTenant(a, proposalA, { status: "draft" }, actor);
    expect((await db.opportunities.findUniqueOrThrow({ where: { opportunity_id: opportunityA } })).created_at).toEqual(before.created_at);
    expect((await opportunityService.getOpportunityPipelineByTenant(a)).find(row => row.opportunityId === opportunityA)?.stage).toBe("open");
    expect(await db.proposal_audit_events.count({ where: { tenant_id: a, proposal_id: proposalA, event_type: "outcome_changed" } })).toBe(2);
  });

  it("lets an owner generate a proposal but does not expose that existing proposal to another seller through replay", async () => {
    asUser(a, owner, "owner");
    const created = await proposals.POST(request({ quoteId: quoteA }));
    expect(created.status).toBe(201);
    const ownerProposal = (await created.json()).proposal.proposalId;
    const before = await db.proposals.count({ where: { tenant_id: a } });
    asUser(a, seller);
    expect((await proposals.POST(request({ quoteId: quoteA }))).status).toBe(404);
    expect(await db.proposals.count({ where: { tenant_id: a } })).toBe(before);
    asUser(a, owner, "owner");
    expect((await (await proposals.POST(request({ quoteId: quoteA }))).json()).proposal.proposalId).toBe(ownerProposal);
  });

  it("rejects API access with no authenticated context", async () => {
    session.current.mockResolvedValue(null);
    expect((await clients.GET(request(undefined, "GET"))).status).toBe(401);
    expect((await proposals.POST(request({ quoteId: quoteA }))).status).toBe(401);
    expect((await tasks.POST(request({}))).status).toBe(401);
  });
});
