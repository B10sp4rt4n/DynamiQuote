import { randomUUID } from "crypto";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { TenantContext } from "@/lib/auth/tenant-context";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ tenant: vi.fn() }));
vi.mock("@/lib/auth/tenant-context", () => ({ getCurrentTenantContext: m.tenant }));
vi.mock("next/navigation", () => ({ notFound: () => { throw Error("404"); }, useRouter: () => ({ refresh() {} }) }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }));
const suite = process.env.COTIZA_CRM_INTEGRATION === "1" ? describe : describe.skip;
suite("CRM pilot with real readers and APIs on a disposable local database", () => {
  let db: typeof import("./prisma").prisma;
  let page: typeof import("@/app/(dashboard)/crm/page").default;
  let postQuote: typeof import("@/app/api/quotes/route").POST;
  let getQuoteIntake: typeof import("@/app/api/quotes/[quoteId]/opportunity/route").GET;
  let patchIntake: typeof import("@/app/api/opportunities/[opportunityId]/intake/route").PATCH;
  let readers: typeof import("./opportunities");
  let tasks: typeof import("./tasks");
  const a = `crm-a-${randomUUID()}`, b = `crm-b-${randomUUID()}`;
  const seller = `seller-${randomUUID()}`, colleague = `colleague-${randomUUID()}`, root = `root-${randomUUID()}`;
  const client = randomUUID(), foreignClient = randomUUID();
  let ownQuote: string, ownOpportunity: string, otherQuote: string, otherOpportunity: string, foreignQuote: string;
  let history: unknown, approval: unknown;
  const context = (id = a, userId = seller, superadmin = false): TenantContext => ({ id, name: "Synthetic CRM", slug: id, userId,
    authMode: "clerk", isSuperAdmin: superadmin, userRole: superadmin ? "superadmin" : "user", accessScope: "subtenant", subtenantKey: `${id}:${userId}`, userDisplayName: "Synthetic seller" });
  const select = (id = a, userId = seller, superadmin = false) => m.tenant.mockResolvedValue(context(id, userId, superadmin));
  const get = (quoteId: string) => getQuoteIntake(new Request("http://localhost"), { params: Promise.resolve({ quoteId }) });
  const patch = (opportunityId: string, fields: object) => patchIntake(new Request("http://localhost", { method: "PATCH", body: JSON.stringify(fields) }), { params: Promise.resolve({ opportunityId }) });
  beforeAll(async () => {
    if (!["127.0.0.1", "localhost"].includes(new URL(process.env.DATABASE_URL!).hostname)) throw Error("Disposable loopback database required");
    ({ prisma: db } = await import("./prisma")); ({ default: page } = await import("@/app/(dashboard)/crm/page"));
    ({ POST: postQuote } = await import("@/app/api/quotes/route")); ({ GET: getQuoteIntake } = await import("@/app/api/quotes/[quoteId]/opportunity/route"));
    ({ PATCH: patchIntake } = await import("@/app/api/opportunities/[opportunityId]/intake/route")); readers = await import("./opportunities"); tasks = await import("./tasks");
    for (const id of [a,b]) await db.tenant.create({ data: { tenant_id: id, name: id, slug: id, created_at: new Date() } });
    for (const [userId, role, tenantId] of [[seller,"user",a],[colleague,"user",a],[root,"superadmin",b]]) {
      await db.app_users.create({ data: { user_id: userId, alias: userId, first_name: "Synthetic", last_name: "User", role, tenant_id: tenantId, password_hash: "unused", created_at: new Date() } });
    }
    await db.tenantCapability.create({ data: { tenant_id: a, capability_key: "crm_workspace_pilot", enabled: true, updated_by: root } });
    await db.client.create({ data: { client_id: client, tenant_id: a, company: "Synthetic catalog A" } });
    await db.client.create({ data: { client_id: foreignClient, tenant_id: b, company: "Foreign catalog secret" } });
    for (const [tenantId, actor, clientId, name] of [[a,seller,client,"Own business"],[a,colleague,client,"Colleague secret"],[b,seller,foreignClient,"Foreign business secret"]]) {
      select(tenantId,actor);
      const response = await postQuote(new Request("http://localhost/api/quotes", { method: "POST", body: JSON.stringify({ clientId, clientName: name, opportunityMode: "new", creationId: randomUUID() }) }));
      expect(response.status).toBe(201); const quoteId = (await response.json()).quote.quoteId;
      const opportunityId = (await db.quote.findUniqueOrThrow({ where: { quote_id: quoteId } })).opportunity_id!;
      if (name === "Own business") { ownQuote = quoteId; ownOpportunity = opportunityId; }
      else if (name === "Colleague secret") { otherQuote = quoteId; otherOpportunity = opportunityId; }
      else foreignQuote = quoteId;
    }
    await db.opportunities.create({ data: { opportunity_id: `orphan-${a}`, opportunity_number: "OPP-ORPHAN", tenant_id: a, title: "Unassigned secret", created_at: new Date() } });
    for (const [actor, description, tenantId, clientId] of [[seller,"Own task",a,client],[colleague,"Colleague task secret",a,client],[null,"Unassigned task secret",a,client],[seller,"Foreign task secret",b,foreignClient]]) {
      await db.tasks.create({ data: { task_id: randomUUID(), tenant_id: tenantId!, client_id: clientId!, created_by_user_id: actor, description: description!, due_date: new Date(), created_at: new Date() } });
    }
    await db.proposals.create({ data: { proposal_id: `history-${a}`, tenant_id: a, opportunity_id: otherOpportunity, status: "approved", created_by: colleague, created_at: new Date(), invoice_status: "draft", invoice_draft_id: "synthetic-invoice" } });
    await db.proposal_approvals.create({ data: { approval_id: `approval-${a}`, tenant_id: a, proposal_id: `history-${a}`, approver_user_id: root, approver_role: "owner", decision: "approved" } });
    history = await db.proposals.findUnique({ where: { proposal_id: `history-${a}` } }); approval = await db.proposal_approvals.findUnique({ where: { approval_id: `approval-${a}` } });
    select();
  }, 30000);
  afterAll(async () => { await db?.$disconnect(); });
  it("loads only the seller's opportunities and pending tasks without catalog, roster or unassigned records", async () => {
    select(); const view = await page();
    expect(view.props.canSeeAll).toBe(false); expect(view.props.opportunities.map((o: { opportunityId: string }) => o.opportunityId)).toEqual([ownOpportunity]);
    expect(view.props.opportunities[0]).toMatchObject({ intakePending: true, intakeQuoteId: ownQuote });
    expect(view.props.tasks.map((t: { description: string }) => t.description)).toEqual(["Own task"]);
    expect(view.props.clients).toEqual([]); expect(view.props.vendors).toEqual([]); expect(view.props.clientLogos).toEqual([]);
    const html = renderToStaticMarkup(view); expect(html).toContain("Ver mis oportunidades");
    for (const secret of ["Colleague secret","Foreign business secret","Unassigned secret","Colleague task secret","Foreign task secret","Unassigned task secret","Clientes y seguimiento"]) expect(html).not.toContain(secret);
  });
  it("retains legacy unassigned visibility outside the CRM while the strict reader fails closed without an actor", async () => {
    expect((await readers.getOpportunityPipelineByTenant(a,seller,false)).map(o => o.title)).toContain("Unassigned secret");
    expect((await tasks.getPendingTasksByTenant(a,seller,false)).map(t => t.description)).toContain("Unassigned task secret");
    expect(await readers.getOpportunityPipelineByTenant(a,null,false,false)).toEqual([]); expect(await tasks.getPendingTasksByTenant(a,null,false,false)).toEqual([]);
  });
  it("returns the linked intake and persists partial progress before completing it from the existing API", async () => {
    select(); expect((await get(ownQuote)).status).toBe(200);
    const partial = { title: "Synthetic renewal", need: "", source: "", nextStep: "", revision: 0 };
    expect((await patch(ownOpportunity,partial)).status).toBe(200);
    expect((await (await get(ownQuote)).json()).opportunity).toMatchObject({ title: partial.title, revision: 1, missingFields: ["Necesidad","Origen"] });
    expect((await page()).props.opportunities[0].intakePending).toBe(true);
    expect((await patch(ownOpportunity,{ ...partial, need: "Synthetic protection", source: "Synthetic request", revision: 1 })).status).toBe(200);
    expect((await page()).props.opportunities[0].intakePending).toBe(false);
    expect((await patch(ownOpportunity,partial)).status).toBe(409);
    expect(await db.proposals.findUnique({ where: { proposal_id: `history-${a}` } })).toEqual(history);
    expect(await db.proposal_approvals.findUnique({ where: { approval_id: `approval-${a}` } })).toEqual(approval);
  });
  it("rejects same-tenant colleagues and foreign-tenant opportunities on read and write", async () => {
    select(); expect((await get(otherQuote)).status).toBe(404); expect((await get(foreignQuote)).status).toBe(404);
    const fields = { title: "Forbidden", need: "x", source: "x", nextStep: "", revision: 0 };
    expect((await patch(otherOpportunity,fields)).status).toBe(404);
    select(b); expect((await get(ownQuote)).status).toBe(404); expect((await patch(ownOpportunity,fields)).status).toBe(404);
  });
  it("keeps superadmin within the selected tenant and denies disabled tenants, inactive users and mismatched sessions", async () => {
    select(a,root,true); const view = await page();
    expect(view.props.canSeeAll).toBe(true); expect(view.props.opportunities).toHaveLength(3); expect(view.props.tasks).toHaveLength(3);
    select(b,root,true); await expect(page()).rejects.toThrow("404");
    select(b,seller); await expect(page()).rejects.toThrow("404");
    select(); await db.app_users.update({ where: { user_id: seller }, data: { active: false } });
    await expect(page()).rejects.toThrow("404"); await db.app_users.update({ where: { user_id: seller }, data: { active: true } });
    await db.tenantCapability.update({ where: { tenant_id_capability_key: { tenant_id: a, capability_key: "crm_workspace_pilot" } }, data: { enabled: false } });
    await expect(page()).rejects.toThrow("404");
  });
});
