import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ client: vi.fn(), opportunity: vi.fn(), task: vi.fn(), contact: vi.fn(), interaction: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {
  client: { findFirst: m.client }, opportunities: { findFirst: m.opportunity },
  tasks: { create: m.task }, client_contacts: { create: m.contact }, interaction_logs: { create: m.interaction },
} }));
import { assertClientOpportunityForTenant, TenantRelationError } from "./tenant-relations";
import { createTaskForTenant } from "./tasks";
import { createClientContactForTenant } from "./client-contacts";
import { createInteractionLogForTenant } from "./interaction-logs";
const clients = [{ client_id: "client-a", tenant_id: "a" }, { client_id: "client-b", tenant_id: "b" }];
const opportunities = [
  { opportunity_id: "opp-a", client_id: "client-a", tenant_id: "a" },
  { opportunity_id: "opp-b", client_id: "client-b", tenant_id: "b" },
  { opportunity_id: "opp-other", client_id: "other-client", tenant_id: "a" },
];
describe("CRM references across two tenants", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    m.client.mockImplementation(async ({ where }) => clients.find((c) => c.client_id === where.client_id && c.tenant_id === where.tenant_id) ?? null);
    m.opportunity.mockImplementation(async ({ where }) => opportunities.find((o) => o.opportunity_id === where.opportunity_id && o.tenant_id === where.tenant_id && o.client_id === where.client_id) ?? null);
  });
  it("accepts parents belonging to current tenant", async () => { await expect(assertClientOpportunityForTenant("a", "client-a", "opp-a")).resolves.toBeUndefined(); });
  it.each([["client-b", "opp-b"], ["client-a", "opp-b"], ["client-a", "opp-other"], ["missing", null]])("rejects inconsistent references %s %s", async (client, opp) => {
    await expect(assertClientOpportunityForTenant("a", client, opp)).rejects.toBeInstanceOf(TenantRelationError);
  });
  it("blocks foreign task before insert", async () => {
    await expect(createTaskForTenant("a", { clientId: "client-a", createdByUserId: "u", opportunityId: "opp-b", description: "Task", dueDate: "2026-10-22" })).rejects.toBeInstanceOf(TenantRelationError); expect(m.task).not.toHaveBeenCalled();
  });
  it("blocks foreign contact through internal call", async () => {
    await expect(createClientContactForTenant("a", "client-b", { firstName: "Test" })).rejects.toBeInstanceOf(TenantRelationError); expect(m.contact).not.toHaveBeenCalled();
  });
  it("blocks notes on another client's opportunity", async () => {
    await expect(createInteractionLogForTenant("a", "client-a", { createdByUserId: "u", opportunityId: "opp-other", note: "Note" })).rejects.toBeInstanceOf(TenantRelationError); expect(m.interaction).not.toHaveBeenCalled();
  });
  it("allows task without opportunity", async () => {
    m.task.mockResolvedValue({}); await expect(createTaskForTenant("a", { clientId: "client-a", createdByUserId: "u", description: "Task", dueDate: "2026-10-22" })).resolves.toEqual(expect.any(String));
    expect(m.task).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ tenant_id: "a", client_id: "client-a", opportunity_id: null }) }));
  });
});
