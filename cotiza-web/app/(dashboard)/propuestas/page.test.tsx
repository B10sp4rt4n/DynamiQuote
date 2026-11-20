import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const m = vi.hoisted(() => ({ tenant: vi.fn(), page: vi.fn(), counts: vi.fn(), requested: vi.fn() }));
vi.mock("@/lib/auth/tenant-context", () => ({ getCurrentTenantContext: m.tenant }));
vi.mock("@/lib/db/proposals", () => ({
  getProposalListPageByTenant: m.page,
  getProposalListCountsByTenant: m.counts,
  getProposalSummaryByTenant: m.requested,
}));
vi.mock("@/components/propuestas/proposal-shell", () => ({ ProposalShell: () => null }));
import ProposalsPage from "./page";

beforeEach(() => {
  vi.resetAllMocks();
  m.tenant.mockResolvedValue({ id: "tenant-a", userId: "seller-a", userRole: "user", isSuperAdmin: false });
  m.page.mockResolvedValue({ items: [{ proposalId: "newest" }], hasMore: true });
  m.counts.mockResolvedValue({ all: 21 });
  m.requested.mockResolvedValue({ proposalId: "older" });
});

it("loads an exact older proposal independently of the filtered first page", async () => {
  const tree = await ProposalsPage({ searchParams: Promise.resolve({ proposalId: "older", status: "approved" }) });
  expect(m.requested).toHaveBeenCalledWith("tenant-a", "older", "seller-a", false);
  expect(tree.props).toMatchObject({ requestedProposal: { proposalId: "older" }, proposals: [{ proposalId: "newest" }], hasMore: true });
});

it.each(["owner", "admin", "superadmin"])("keeps tenant scope for %s access", async role => {
  m.tenant.mockResolvedValue({ id: "tenant-b", userId: "admin-b", userRole: role, isSuperAdmin: role === "superadmin" });
  await ProposalsPage({ searchParams: Promise.resolve({ proposalId: "older" }) });
  expect(m.requested).toHaveBeenCalledWith("tenant-b", "older", "admin-b", true);
});

it("shows an unavailable selection instead of silently editing the newest proposal", async () => {
  m.requested.mockResolvedValue(null);
  const tree = await ProposalsPage({ searchParams: Promise.resolve({ proposalId: "foreign-or-missing" }) });
  expect(renderToStaticMarkup(tree)).toContain("La propuesta seleccionada no está disponible");
  expect(tree.props).not.toHaveProperty("proposals");
});

it.each(["", ["older", "newest"]])("rejects an ambiguous or empty identity: %j", async proposalId => {
  const tree = await ProposalsPage({ searchParams: Promise.resolve({ proposalId }) });
  expect(renderToStaticMarkup(tree)).toContain("La propuesta seleccionada no está disponible");
  expect(m.requested).not.toHaveBeenCalled();
});

it("uses the normal list when no proposal is requested", async () => {
  const tree = await ProposalsPage({ searchParams: Promise.resolve({}) });
  expect(tree.props).toHaveProperty("requestedProposal", null);
  expect(m.requested).not.toHaveBeenCalled();
});

it("does not read proposals without a tenant session", async () => {
  m.tenant.mockResolvedValue(null);
  await ProposalsPage({ searchParams: Promise.resolve({ proposalId: "older" }) });
  expect(m.requested).not.toHaveBeenCalled();
  expect(m.page).not.toHaveBeenCalled();
});
