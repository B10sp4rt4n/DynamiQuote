import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const mocks = vi.hoisted(() => ({ context: vi.fn(), enabled: vi.fn(), list: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }));
vi.mock("@/lib/auth/tenant-context", () => ({ getCurrentTenantContext: mocks.context }));
vi.mock("@/lib/db/proposals", () => ({ getProposalListPageByTenant: mocks.list }));
vi.mock("@/lib/integrations/digestor-fiscal", () => ({ isDigestorFiscalEnabledForTenant: mocks.enabled }));
import FiscalPage from "./page";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.context.mockResolvedValue({ id: "company-a", userId: "user-a", userRole: "user", isSuperAdmin: false });
  mocks.enabled.mockReturnValue(true);
  mocks.list.mockResolvedValue({ items: [{ proposalId: "exact-id", formal: { proposalNumber: "PROP-001", recipientCompany: "Cliente de prueba" } }], hasMore: false });
});
it("uses the active company and existing owner visibility, with an exact proposal link", async () => {
  const html = renderToStaticMarkup(await FiscalPage());
  expect(mocks.list).toHaveBeenCalledWith("company-a", "user-a", false, { blockedMargin: false, outcome: "won", status: "all" });
  expect(html).toContain("/propuestas?proposalId=exact-id");
  expect(html).toContain("PROP-001");
  expect(html).not.toContain("Configuración fiscal");
});
it("does not query proposals for a missing membership or disabled company", async () => {
  mocks.context.mockResolvedValue(null);
  await FiscalPage();
  expect(mocks.list).not.toHaveBeenCalled();
  mocks.context.mockResolvedValue({ id: "company-b", userRole: "admin" });
  mocks.enabled.mockReturnValue(false);
  expect(renderToStaticMarkup(await FiscalPage())).toContain("no está habilitada");
  expect(mocks.list).not.toHaveBeenCalled();
});
it("allows an administrator to reach configuration and labels partial results", async () => {
  mocks.context.mockResolvedValue({ id: "company-a", userId: "owner", userRole: "owner" });
  mocks.list.mockResolvedValue({ items: [], hasMore: true });
  const html = renderToStaticMarkup(await FiscalPage());
  expect(mocks.list.mock.calls[0].slice(0, 3)).toEqual(["company-a", "owner", true]);
  expect(html).toContain("Configuración fiscal");
  expect(html).toContain("Consultar más propuestas");
});
