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
let clientOpportunities: typeof import("@/app/api/clients/[clientId]/opportunities/route");
let interactions: typeof import("@/app/api/clients/[clientId]/interactions/route");
let interaction: typeof import("@/app/api/clients/[clientId]/interactions/[interactionId]/route");
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
    clientOpportunities = await import("@/app/api/clients/[clientId]/opportunities/route");
    interactions = await import("@/app/api/clients/[clientId]/interactions/route");
    interaction = await import("@/app/api/clients/[clientId]/interactions/[interactionId]/route");
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

  it("saves the first edited line through PUT on a newly created free-text quotation", async () => {
    asUser(a, owner, "owner");
    const created = await quotes.POST(request({ clientName: "QA issuer fixture", proposalName: "Not commercial" }));
    expect(created.status).toBe(201);
    const quoteId = (await created.json()).quote.quoteId;
    const route = await import("@/app/api/quotes/[quoteId]/lines/route");
    const context = { params: Promise.resolve({ quoteId }) };
    const initial = await route.GET(request(undefined, "GET"), context);
    expect(initial.status).toBe(200);
    const line = (await initial.json()).lines[0];
    const payload = { forceNewVersion: false, lines: [{ ...line, sku: "QA-EMISOR",
      description: "Fictional issuer verification", quantity: 1, costUnit: 60,
      priceUnit: 100, marginPct: 40, mode: "price" }] };
    const saved = await route.PUT(request(payload, "PUT"), context);
    const result = await saved.json();
    expect(result, JSON.stringify(result)).toMatchObject({ quote: { quoteId, totalRevenue: 100 },
      totals: { totalCost: 60, totalRevenue: 100 }, versionCreated: false });
    expect(saved.status).toBe(200);
    expect(await db.quote_lines.count({ where: { quote_id: quoteId } })).toBe(1);
    asUser(b, foreign, "owner");
    expect((await route.PUT(request(payload, "PUT"), context)).status).toBe(404);
    expect((await db.quote.findUniqueOrThrow({ where: { quote_id: quoteId } })).total_revenue?.toNumber()).toBe(100);
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

  it("keeps the client 360 opportunity history within the same seller scope as Pipeline", async () => {
    expect(await opportunityService.getOpportunitiesByClientForTenant(a, clientA, colleague, false)).toEqual([]);
    expect((await opportunityService.getOpportunitiesByClientForTenant(a, clientA, seller, false)).map(o => o.opportunityId)).toEqual([opportunityA]);
    expect((await opportunityService.getOpportunitiesByClientForTenant(a, clientA, owner, true)).map(o => o.opportunityId)).toEqual([opportunityA]);
    expect(await opportunityService.getOpportunitiesByClientForTenant(b, clientA, foreign, true)).toEqual([]);
  });

  it("does not disclose another seller's opportunity through the task selector API", async () => {
    for (const [tenantId, userId, role, expected] of [
      [a, colleague, "user", []], [a, seller, "user", [opportunityA]],
      [a, owner, "owner", [opportunityA]], [b, foreign, "owner", []],
    ] as const) {
      asUser(tenantId, userId, role);
      const result = await clientOpportunities.GET(request(undefined, "GET"), { params: Promise.resolve({ clientId: clientA }) });
      expect(result.status).toBe(200);
      expect((await result.json()).opportunities.map((o: { opportunityId: string }) => o.opportunityId)).toEqual(expected);
    }
    session.current.mockResolvedValue(null);
    expect((await clientOpportunities.GET(request(undefined, "GET"), { params: Promise.resolve({ clientId: clientA }) })).status).toBe(401);
  });

  it("rejects a forged task link to a colleague's opportunity without writing", async () => {
    asUser(a, colleague);
    const before = await db.tasks.count({ where: { tenant_id: a } });
    const result = await tasks.POST(request({ clientId: clientA, opportunityId: opportunityA,
      description: "Forbidden private deal", dueDate: "2026-10-23", canSeeAll: true, tenantId: b }));
    expect(result.status).toBe(404);
    expect(await db.tasks.count({ where: { tenant_id: a } })).toBe(before);
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
    await proposalService.updateProposalWorkflowByTenant(a, proposalA, { status: "approved" }, actor);
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

  it("allows owner follow-up on another seller's opportunity", async () => {
    asUser(a, owner, "owner");
    const result = await tasks.POST(request({ clientId: clientA, opportunityId: opportunityA,
      description: "Owner follow up", dueDate: "2026-10-23" }));
    expect(result.status).toBe(201);
    const taskId = (await result.json()).taskId;
    expect((await task.PATCH(request(undefined, "PATCH"), { params: Promise.resolve({ taskId }) })).status).toBe(200);
  });

  it("does not delete another tenant's search entry when quotation folios coincide", async () => {
    for (const tenantId of [a, b]) await db.quote.create({ data: {
      quote_id: `${tenantId}-cache-quote`, tenantId, quote_group_id: "COT-SHARED-CACHE",
      version: 1, status: "draft", createdAt: new Date(),
    } });
    await db.quote_search_index.create({ data: { quote_group_id: "COT-SHARED-CACHE",
      latest_quote_id: `${b}-cache-quote`, latest_version: 1, created_at: new Date(), updated_at: new Date() } });
    expect(await quoteService.deleteQuoteGroupByTenant(a, "COT-SHARED-CACHE", owner, true)).toBe("deleted");
    expect((await db.quote_search_index.findUnique({ where: { quote_group_id: "COT-SHARED-CACHE" } }))?.latest_quote_id).toBe(`${b}-cache-quote`);
  });

  it("keeps deal notes private while allowing shared client notes", async () => {
    asUser(a, seller);
    const context = { params: Promise.resolve({ clientId: clientA }) };
    expect((await interactions.POST(request({ note: "Shared client note" }), context)).status).toBe(201);
    expect((await interactions.POST(request({ note: "Private deal note", opportunityId: opportunityA }), context)).status).toBe(201);
    asUser(a, colleague);
    const visible = await interactions.GET(request(undefined, "GET"), context);
    expect((await visible.json()).interactions.map((n: { note: string }) => n.note)).toEqual(["Shared client note"]);
    const before = await db.interaction_logs.count();
    expect((await interactions.POST(request({ note: "Forged deal note", opportunityId: opportunityA, canSeeAll: true }), context)).status).toBe(404);
    expect(await db.interaction_logs.count()).toBe(before);
    asUser(a, owner, "owner");
    expect((await (await interactions.GET(request(undefined, "GET"), context)).json()).interactions).toHaveLength(2);
    expect((await interactions.POST(request({ note: "Owner deal note", opportunityId: opportunityA }), context)).status).toBe(201);
    asUser(b, foreign, "owner");
    expect((await (await interactions.GET(request(undefined, "GET"), context)).json()).interactions).toEqual([]);
  });

  it("limits note deletion to its author or owner and the addressed client", async () => {
    const note = await db.interaction_logs.findFirstOrThrow({ where: { tenant_id: a, note: "Private deal note" } });
    const context = (clientId = clientA) => ({ params: Promise.resolve({ clientId, interactionId: note.interaction_id }) });
    asUser(a, colleague);
    expect((await interaction.DELETE(request(undefined, "DELETE"), context())).status).toBe(403);
    expect(await db.interaction_logs.count({ where: { interaction_id: note.interaction_id } })).toBe(1);
    asUser(a, owner, "owner");
    expect((await interaction.DELETE(request(undefined, "DELETE"), context(clientB))).status).toBe(404);
    expect((await interaction.DELETE(request(undefined, "DELETE"), context())).status).toBe(200);
  });

  it("does not bind a global issuer profile to a new tenant proposal", async () => {
    await db.company_logos.create({ data: { logo_id: "crm-global-issuer", logo_name: "Unassigned issuer",
      logo_type: "issuer", company_name: "Private global company", logo_data: new Uint8Array([1,2,3]),
      logo_format: "png", uploaded_at: new Date(), is_default: true, tenant_id: null } });
    const created = await proposalService.createProposalFromQuoteByTenant(b, { quoteId: quoteB }, foreign, foreign);
    expect(created).not.toBeNull();
    const formal = await db.formal_proposals.findFirstOrThrow({ where: { proposal_id: created!.proposalId } });
    expect(formal.issuer_logo_id).toBeNull();
    expect(formal.issuer_company).toBe(b);
  });

  it("never renders issuer or client image bytes from unassigned global profiles", async () => {
    await db.company_logos.create({ data: { logo_id: "crm-global-client", logo_name: "Unassigned client",
      logo_type: "client", logo_data: new Uint8Array([4,5,6]), logo_format: "png", uploaded_at: new Date(), tenant_id: null } });
    const formal = await db.formal_proposals.findFirstOrThrow({ where: { proposal_id: proposalA } });
    await db.formal_proposals.update({ where: { proposal_doc_id: formal.proposal_doc_id },
      data: { issuer_logo_id: "crm-global-issuer", client_logo_id: "crm-global-client" } });
    const payload = await proposalService.getProposalWorkflowByTenant(a, proposalA, { includeLogoData: true });
    expect(payload?.formal?.issuerLogoDataUrl).toBe("");
    expect(payload?.formal?.clientLogoDataUrl).toBe("");
    await db.formal_proposals.update({ where: { proposal_doc_id: formal.proposal_doc_id }, data: { issuer_logo_id: null } });
    expect((await proposalService.getProposalWorkflowByTenant(a, proposalA, { includeLogoData: true }))?.formal?.issuerLogoDataUrl).toBe("");
  });

  it("retains tenant logos and refuses explicit logo IDs from another tenant", async () => {
    for (const [id, tenantId, type] of [["crm-own-issuer", a, "issuer"], ["crm-own-client", a, "client"],
      ["crm-foreign-issuer", b, "issuer"], ["crm-foreign-client", b, "client"]]) {
      await db.company_logos.create({ data: { logo_id: id, logo_name: id, logo_type: type,
        logo_data: new Uint8Array([7,8,9]), logo_format: "png", uploaded_at: new Date(), tenant_id: tenantId } });
    }
    const formal = await db.formal_proposals.findFirstOrThrow({ where: { proposal_id: proposalA } });
    await db.formal_proposals.update({ where: { proposal_doc_id: formal.proposal_doc_id },
      data: { issuer_logo_id: null, client_logo_id: "crm-own-client" } });
    const own = await proposalService.getProposalWorkflowByTenant(a, proposalA, { includeLogoData: true });
    expect(own?.formal?.issuerLogoDataUrl).toBe("data:image/png;base64,BwgJ");
    expect(own?.formal?.clientLogoDataUrl).toBe("data:image/png;base64,BwgJ");
    await db.formal_proposals.update({ where: { proposal_doc_id: formal.proposal_doc_id },
      data: { issuer_logo_id: "crm-foreign-issuer", client_logo_id: "crm-foreign-client" } });
    const foreign = await proposalService.getProposalWorkflowByTenant(a, proposalA, { includeLogoData: true });
    expect(foreign?.formal?.issuerLogoDataUrl).toBe("");
    expect(foreign?.formal?.clientLogoDataUrl).toBe("");
  });
  it.each([
    ["historical", true, false, false],
    ["designated", true, true, true],
    ["regular", false, false, true],
  ] as const)("selects a safe issuer for a new proposal: %s", async (label, historical, designated, selected) => {
    const tenantId = `crm-issuer-${label}`;
    const userId = `${tenantId}-owner`;
    await db.tenant.create({ data: { tenant_id: tenantId, slug: tenantId, name: tenantId, created_at: new Date() } });
    await db.app_users.create({ data: { user_id: userId, alias: userId, first_name: "Fixture", last_name: label,
      tenant_id: tenantId, role: "owner", password_hash: "unused", created_at: new Date() } });
    const logoId = historical ? `crm-legacy-logo:${tenantId}:original` : `${tenantId}-logo`;
    await db.company_logos.create({ data: { logo_id: logoId, logo_name: label, logo_type: "issuer",
      company_name: "Historical company", logo_data: new Uint8Array([7,8,9]), logo_format: "png",
      uploaded_at: new Date(), tenant_id: tenantId, is_default: designated } });
    asUser(tenantId, userId, "owner");
    const response = await quotes.POST(request({ clientName: "Issuer fixture", proposalName: label }));
    expect(response.status).toBe(201);
    const quoteId = (await response.json()).quote.quoteId;
    const created = await proposalService.createProposalFromQuoteByTenant(tenantId, { quoteId }, userId, userId);
    const formal = await db.formal_proposals.findFirstOrThrow({ where: { proposal_id: created!.proposalId } });
    expect(formal.issuer_logo_id).toBe(selected ? logoId : null);
    expect(formal.issuer_company).toBe(selected ? "Historical company" : tenantId);
    const payload = await proposalService.getProposalWorkflowByTenant(tenantId, created!.proposalId, { includeLogoData: true });
    expect(payload?.formal?.issuerLogoDataUrl).toBe(selected ? "data:image/png;base64,BwgJ" : "");
    // Explicit historical references remain valid even when automatic selection is disabled.
    await db.formal_proposals.update({ where: { proposal_doc_id: formal.proposal_doc_id }, data: { issuer_logo_id: logoId } });
    expect((await proposalService.getProposalWorkflowByTenant(tenantId, created!.proposalId, { includeLogoData: true }))?.formal?.issuerLogoDataUrl)
      .toBe("data:image/png;base64,BwgJ");
  });

  it("records dispatch separately from authorization, revision and commercial outcome", async () => {
    const service = await import("./proposal-delivery");
    const id = "delivery-semantics-proof"; const updated = new Date("2026-10-20T12:00:00.000Z");
    await db.proposals.create({ data: { proposal_id: id, tenant_id: a, status: "approved", created_at: new Date(), created_by: seller, created_by_user_id: seller } });
    await db.formal_proposals.create({ data: { proposal_doc_id: id, proposal_id: id, tenant_id: a,
      proposal_number: "SYNTHETIC-DELIVERY", issued_date: new Date(), issuer_company: "Synthetic", recipient_company: "Synthetic", status: "approved", created_at: updated, updated_at: updated } });
    const input = { tenantId: a, proposalId: id, documentId: id, expectedUpdatedAt: updated.toISOString(),
      actorUserId: seller, providerId: "synthetic-provider-only", pdfSha256: "a".repeat(64) };
    expect(await service.isProposalDeliveryAuthorizedByTenant(input)).toBe(true);
    expect((await service.recordProposalDeliveryByTenant(input)).recordedForCurrentRevision).toBe(true);
    expect((await db.proposals.findUniqueOrThrow({ where: { proposal_id: id } })).status).toBe("approved");
    expect((await db.formal_proposals.findUniqueOrThrow({ where: { proposal_doc_id: id } })).sent_at).not.toBeNull();
    expect((await proposalService.getProposalSummariesByTenant(a)).find(row => row.proposalId === id)?.formal?.sentAt).toBeTruthy();
    await expect(service.recordProposalDeliveryByTenant({ ...input, tenantId: b })).rejects.toThrow("no encontrada");
    await db.formal_proposals.update({ where: { proposal_doc_id: id }, data: { updated_at: new Date("2026-10-21T12:00:00Z"), sent_at: null } });
    expect(await service.isProposalDeliveryAuthorizedByTenant(input)).toBe(false);
    expect((await service.recordProposalDeliveryByTenant(input)).recordedForCurrentRevision).toBe(false);
    expect((await db.formal_proposals.findUniqueOrThrow({ where: { proposal_doc_id: id } })).sent_at).toBeNull();
    await db.proposals.update({ where: { proposal_id: id }, data: { status: "sent" } });
    expect(await proposalService.setProposalOutcomeByTenant(a, id, "won", { isSuperAdmin: false, userId: owner, userRole: "owner" }, true)).toBe("invalid_status");
    expect((await db.proposals.findUniqueOrThrow({ where: { proposal_id: id } })).status).toBe("sent");
    expect(await db.proposal_approvals.count({ where: { proposal_id: id } })).toBe(0);
  });

});
