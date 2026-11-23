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
vi.mock("@/lib/integrations/recordia/access", () => ({ recordiaPilotVisible: async () => false }));
import BusinessPage from "./page";

const opportunity = { opportunityId: "opp-a", opportunityNumber: "OPP-0066", title: "Renovación de prueba",
  stage: "won", clientId: "client-a", clientCompany: "Cliente de prueba", ownerUserId: "seller-a",
  amount: 7900, closedAt: "2026-10-20T06:00:00Z", createdAt: "2026-09-01T06:00:00Z", canChangeDisposition: false };
const workspace = () => ({ opportunity, quotes: [
  { quote_id: "quote-v2", quote_group_id: "COT-1", status: "draft", version: 2, proposal_name: "Renovación ampliada", total_revenue: "10000.00" },
  { quote_id: "quote-v1", quote_group_id: "COT-1", status: "draft", version: 1, proposal_name: "Renovación original", total_revenue: "7900.00" },
], proposals: [{ proposal_id: "proposal-a", origin: "quote-v2", status: "approved", outcome: "won", invoice_status: null as string | null,
  invoice_uuid: null as string | null, invoice_draft_id: null, invoice_stamped_at: null,
  proposal_items: [{ subtotal_price: "5000.00" as string | null }, { subtotal_price: "2900.00" as string | null }],
  formal_proposals: [{ proposal_number: "PROP-1", quote_id: "quote-v1" as string | null, subject: "Protección anual" as string | null, status: "approved", sent_at: null, currency: "USD" as string | null }] }],
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
  data.proposals.push({ ...data.proposals[0]!, proposal_id: "proposal-b", proposal_items: [], formal_proposals: [{ ...data.proposals[0]!.formal_proposals[0]!, proposal_number: "PROP-2", currency: "MXN" }] });
  m.workspace.mockResolvedValue(data); const html = await render();
  expect(html).toContain("Importes en varias monedas");
  expect(html.match(/<header[\s\S]*?<\/header>/)?.[0]).not.toContain("7,900");
});

it("identifies each proposal by its exact quote revision and its own amount rather than the newest quote", async () => {
  const html = await render();
  const proposalCard = html.split('id="propuestas"')[1]?.match(/<a[^>]*href="\/propuestas\/proposal-a"[^>]*>([\s\S]*?)<\/a>/)?.[1];
  expect(proposalCard).toContain("Renovación original");
  expect(proposalCard).toContain("PROP-1");
  expect(proposalCard).toContain("Asunto: Protección anual");
  expect(proposalCard).toContain("Cotización COT-1 · Revisión 1");
  expect(proposalCard).toContain("$7,900.00 USD");
  expect(proposalCard).toContain("antes de IVA");
  expect(proposalCard).not.toContain("Renovación ampliada");
  expect(proposalCard).not.toContain("10,000");
  expect(html).toContain("$10,000.00 MXN");
});

it("uses the historical origin only when no formal quote link exists and preserves a genuine zero", async () => {
  const data = workspace();
  data.proposals[0]!.formal_proposals[0]!.quote_id = null;
  data.proposals[0]!.proposal_items = [{ subtotal_price: "0" }];
  m.workspace.mockResolvedValue(data);
  const html = await render();
  const proposalCard = html.split('id="propuestas"')[1]?.match(/<a[^>]*href="\/propuestas\/proposal-a"[^>]*>([\s\S]*?)<\/a>/)?.[1];
  expect(proposalCard).toContain("Renovación ampliada");
  expect(proposalCard).toContain("Cotización COT-1 · Revisión 2");
  expect(proposalCard).toContain("$0.00 USD");
});

it("keeps missing names, prices and currencies explicit without borrowing another document's data", async () => {
  const data = workspace();
  const proposal = data.proposals[0]!;
  proposal.formal_proposals[0] = { ...proposal.formal_proposals[0]!, quote_id: "unavailable-quote", subject: null, currency: null };
  proposal.proposal_items[1]!.subtotal_price = null;
  m.workspace.mockResolvedValue(data);
  let html = await render();
  let proposalCard = html.split('id="propuestas"')[1]?.match(/<a[^>]*href="\/propuestas\/proposal-a"[^>]*>([\s\S]*?)<\/a>/)?.[1];
  expect(proposalCard).toContain("Propuesta sin nombre");
  expect(proposalCard).toContain("Monto por confirmar");
  expect(proposalCard).not.toMatch(/Renovación|\$|USD|MXN/);
  proposal.formal_proposals[0]!.subject = "Asunto de propuesta histórica";
  proposal.proposal_items[1]!.subtotal_price = "2900";
  html = await render();
  proposalCard = html.split('id="propuestas"')[1]?.match(/<a[^>]*href="\/propuestas\/proposal-a"[^>]*>([\s\S]*?)<\/a>/)?.[1];
  expect(proposalCard).toContain("Asunto de propuesta histórica");
  expect(proposalCard).toContain("7,900.00 · Moneda por confirmar");
  expect(proposalCard).not.toMatch(/\$|USD|MXN/);
});

it("identifies an unnamed draft as a quotation and exposes its naming action outside the document link", async () => {
  const data = workspace(); data.quotes[0]!.proposal_name = "Sin propuesta";
  m.workspace.mockResolvedValue(data);
  const html = await render();
  const quoteCard = html.match(/<article[\s\S]*?<\/article>/)?.[0];
  expect(quoteCard).toContain("Cotización sin nombre");
  expect(quoteCard).toContain("Asignar nombre");
  expect(quoteCard).not.toContain("Sin propuesta");
  expect(quoteCard?.indexOf("</a>")).toBeLessThan(quoteCard!.indexOf("<button"));
  expect(html).toContain("El nombre se captura al crear la cotización");
});

it("shows the current revision as the estimate and leaves the earlier proposal accessible", async () => {
  const data = workspace();
  const earlier = { ...data.proposals[0]!, opportunity_id: "opp-a", outcome: null };
  const current = { ...earlier, proposal_id: "proposal-b",
    formal_proposals: [{ ...earlier.formal_proposals[0]!, proposal_number: "PROP-2", quote_id: "quote-v2" }] };
  m.workspace.mockResolvedValue({ ...data, proposals: [earlier, current],
    relationship: { mode: "revision", preferredProposalId: "proposal-b", proposalIds: ["proposal-a", "proposal-b"], revision: 1 },
    opportunity: { ...opportunity, stage: "open", amount: 7900, proposalRelationship: { mode: "revision", amounts: [{ currency: "USD", value: 7900 }] } },
  });
  const html = await render();
  expect(html).toContain("Relación entre propuestas · Revisiones");
  expect(html).toContain("Revisión vigente");
  expect(html).toContain("Revisión anterior");
  expect(html).toContain('href="/propuestas/proposal-a"');
  expect(html).toContain('href="/propuestas/proposal-b"');
});
