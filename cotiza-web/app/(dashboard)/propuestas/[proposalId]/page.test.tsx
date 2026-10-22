import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

const mocks = vi.hoisted(() => ({
  context: vi.fn(), visible: vi.fn(), proposal: vi.fn(), timeline: vi.fn(),
  profile: vi.fn(), derivation: vi.fn(),
}));
vi.mock("@/lib/auth/tenant-context", () => ({ getCurrentTenantContext: mocks.context }));
vi.mock("@/lib/db/proposals", () => ({
  isProposalVisibleToViewer: mocks.visible,
  getProposalWorkflowByTenant: mocks.proposal,
  getProposalDerivationInfoByTenant: mocks.derivation,
}));
vi.mock("@/lib/db/proposal-audit", () => ({ getProposalAuditTimelineByTenant: mocks.timeline }));
vi.mock("@/lib/db/tenants", () => ({ getTenantProfileByTenant: mocks.profile }));
vi.mock("@/lib/integrations/digestor-fiscal", () => ({ isDigestorFiscalEnabledForTenant: () => false }));
vi.mock("@/components/propuestas/proposal-detail-view", () => ({ ProposalDetailView: () => null }));

import ProposalDetailPage from "./page";
const page = () => ProposalDetailPage({ params: Promise.resolve({ proposalId: "p1" }) });

describe("proposal history access", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.context.mockResolvedValue({ id: "tenant-1", name: "Empresa", userId: "seller-1", userRole: "user", isSuperAdmin: false });
    mocks.visible.mockResolvedValue(true);
    mocks.proposal.mockResolvedValue({ formal: null, salesOwner: "Ana" });
    mocks.profile.mockResolvedValue(null);
    mocks.derivation.mockResolvedValue({ basedOn: null, supersededBy: null });
    mocks.timeline.mockResolvedValue([{
      id: "e1", type: "status_change_requested", actorName: "Ana",
      createdAt: "2026-10-22T15:00:00Z",
      details: { fromStatus: "draft", resultStatus: "in_review", ok: true, marginPct: 23.17, privateNote: "SECRET" },
    }]);
  });

  it("shows read-only history to an authorized seller and filters internal fields on the server", async () => {
    const tree = await page();
    const html = renderToStaticMarkup(tree);
    expect(mocks.visible).toHaveBeenCalledWith("tenant-1", "p1", "seller-1", false);
    expect(mocks.timeline).toHaveBeenCalledWith("tenant-1", "p1");
    expect(html).toContain("Historial de la propuesta (1)");
    expect(html).toContain("Ana");
    expect(html).not.toContain("23.17");
    // Also inspect the props, not just the resulting HTML.
    expect(JSON.stringify(tree)).not.toContain("SECRET");
    expect(JSON.stringify(tree)).not.toContain("marginPct");
  });

  it.each(["owner", "admin", "superadmin"])("preserves the full view for %s within the selected tenant", async (role) => {
    mocks.context.mockResolvedValue({ id: "tenant-2", userId: "admin-1", userRole: role, isSuperAdmin: role === "superadmin" });
    expect(renderToStaticMarkup(await page())).toContain("23.17");
    expect(mocks.visible).toHaveBeenCalledWith("tenant-2", "p1", "admin-1", true);
    expect(mocks.timeline).toHaveBeenCalledWith("tenant-2", "p1");
  });

  it("does not query history for another seller's inaccessible proposal", async () => {
    mocks.visible.mockResolvedValue(false);
    expect(renderToStaticMarkup(await page())).toContain("Propuesta no encontrada");
    expect(mocks.timeline).not.toHaveBeenCalled();
    expect(mocks.proposal).not.toHaveBeenCalled();
  });

  it("does not query history when the proposal is absent in the tenant", async () => {
    mocks.proposal.mockResolvedValue(null);
    expect(renderToStaticMarkup(await page())).toContain("Propuesta no encontrada");
    expect(mocks.timeline).not.toHaveBeenCalled();
  });

  it("does not query history without an authenticated tenant", async () => {
    mocks.context.mockResolvedValue(null);
    await page();
    expect(mocks.timeline).not.toHaveBeenCalled();
    expect(mocks.visible).not.toHaveBeenCalled();
  });

  it("shows an empty history without granting write controls", async () => {
    mocks.timeline.mockResolvedValue([]);
    const html = renderToStaticMarkup(await page());
    expect(html).toContain("Historial de la propuesta (0)");
    expect(html).toContain("Sin eventos registrados");
    expect(html).not.toContain("<button");
  });
});
