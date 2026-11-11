import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const m = vi.hoisted(() => ({ tenant: vi.fn(), workspace: vi.fn(), billing: vi.fn() }));
vi.mock("@/lib/auth/tenant-context", () => ({ getCurrentTenantContext: m.tenant }));
vi.mock("@/lib/db/opportunity-workspace", () => ({ getBusinessWorkspace: m.workspace }));
vi.mock("@/lib/integrations/digestor-fiscal", () => ({ isDigestorFiscalEnabledForTenant: m.billing }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }));
vi.mock("next/navigation", () => ({ notFound: () => { throw Error("not-found"); }, redirect: (url: string) => { throw Error(`redirect:${url}`); }, useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/cotizador/quote-opportunity-panel", () => ({ QuoteOpportunityPanel: () => <p>Datos del negocio</p> }));
vi.mock("@/lib/integrations/loom/availability", () => ({ loomPilotVisible: async () => false }));
import BusinessPage from "./page";

const opportunity = { opportunityId: "opp-a", opportunityNumber: "OPP-0066", title: "Renovación de prueba",
  stage: "won", clientId: "client-a", clientCompany: "Cliente de prueba", ownerUserId: "seller-a",
  amount: 7900, closedAt: "2026-10-20T06:00:00Z", createdAt: "2026-09-01T06:00:00Z", canChangeDisposition: false };
const workspace = () => ({ opportunity, quotes: [
  { quote_id: "quote-v2", quote_group_id: "COT-1", status: "draft", version: 2, proposal_name: "Renovación" },
  { quote_id: "quote-v1", quote_group_id: "COT-1", status: "draft", version: 1, proposal_name: "Renovación" },
], proposals: [{ proposal_id: "proposal-a", status: "approved", outcome: "won", invoice_status: null as string | null,
  invoice_uuid: null as string | null, invoice_draft_id: null, invoice_stamped_at: null,
  formal_proposals: [{ proposal_number: "PROP-1", status: "approved", sent_at: null, currency: "USD" }] }],
tasks: [], optionLabels: {}, ownerName: "Responsable de prueba" });
beforeEach(() => {
  vi.clearAllMocks(); m.tenant.mockResolvedValue({ id: "tenant-a", userId: "seller-a", userRole: "user", isSuperAdmin: false });
  m.workspace.mockResolvedValue(workspace()); m.billing.mockReturnValue(true);
});
const render = async () => renderToStaticMarkup(await BusinessPage({ params: Promise.resolve({ opportunityId: "opp-a" }) }));

it("replaces the contradictory won/pending wizard with real documents, date, currency and fiscal follow-up", async () => {
  const html = await render();
  expect(html).toContain("Ganada"); expect(html).toContain("Seguimiento del cierre");
  expect(html).toContain("1 cotización · 2 revisiones"); expect(html).toContain("1 propuesta · 1 autorizada");
  expect(html).toContain("20 oct 2026"); expect(html).toContain("USD");
  expect(html).toContain('href="/propuestas/proposal-a#facturacion"'); expect(html).toContain("Preparar prefactura");
  expect(html).not.toMatch(/Estás aquí|Retoma una cotización|Crea la primera|El avance de estos pasos/);
  expect(html).toContain("4. Facturación"); expect(html).toContain("Pendiente de preparar");
  expect(html.match(/<h1/g)).toHaveLength(1);
  expect(m.workspace).toHaveBeenCalledWith("tenant-a", "opp-a", { userId: "seller-a", canSeeAll: false });
});
it("keeps an undated historical close explicit without inventing missing documents or currency", async () => {
  m.workspace.mockResolvedValue({ ...workspace(), opportunity: { ...opportunity, closedAt: null }, quotes: [], proposals: [] });
  const html = await render();
  expect(html).toContain("Cierre registrado sin cotización o propuesta vinculada en esta vista");
  expect(html).toContain("Fecha de cierre sin registrar"); expect(html).toContain("Moneda por confirmar");
  expect(html).not.toContain("USD"); expect(html).not.toContain("Crear primera cotización");
});
it("shows recorded invoice evidence and routes to its existing controls without asserting fiscal validity", async () => {
  const data = workspace(); data.proposals[0] = { ...data.proposals[0]!, invoice_uuid: "uuid-a", invoice_status: "stamped" };
  m.workspace.mockResolvedValue(data); const html = await render();
  expect(html).toContain("CFDI registrado"); expect(html).toContain("Revisar factura y pagos");
  expect(html).not.toMatch(/Factura vigente|Pagada|saldo cero/);
});
it("does not show a dossier when the viewer has no authorized workspace", async () => {
  m.workspace.mockResolvedValue(null); await expect(render()).rejects.toThrow("not-found");
});
it("does not present an unconverted mixed-currency sum as the amount of a won business", async () => {
  const data = workspace();
  data.proposals.push({ ...data.proposals[0]!, proposal_id: "proposal-b", formal_proposals: [{ proposal_number: "PROP-2", status: "approved", sent_at: null, currency: "MXN" }] });
  m.workspace.mockResolvedValue(data); const html = await render();
  expect(html).toContain("Importes en varias monedas");
  expect(html).not.toContain("7,900");
});
