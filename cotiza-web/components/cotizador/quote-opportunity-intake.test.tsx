// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuoteShell } from "./quote-shell";
import { QuoteOpportunityPanel } from "./quote-opportunity-panel";
import type { OpportunityIntake } from "@/lib/domain/opportunity-intake";
const m = vi.hoisted(() => ({ fetch: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/cotizaciones", useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ refresh: m.refresh, replace: m.replace }) }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }));
// Existing line editing has separate regression coverage; exercise the real creation form and intake panel.
vi.mock("./quote-line-editor", () => ({ QuoteLineEditor: () => <p>Editor de partidas disponible</p> }));
let root: Root, container: HTMLDivElement;
let saved: OpportunityIntake;
const quote = { quoteId: "new-quote", quoteGroupId: "COT-TEST", clientName: "Synthetic company", proposalName: "Sin propuesta",
  createdAt: "2026-10-27T12:00:00Z", playbookName: "General", status: "draft", version: 1, versionCount: 1, totalRevenue: 0, avgMargin: 0 };
const response = (data: unknown, ok = true) => ({ ok, json: async () => data });
async function settle(ms = 0) { await act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); }); }
function button(text: string) { const element = [...container.querySelectorAll("button")].find(button => button.textContent === text); if (!element) throw Error(`No button: ${text}`); return element; }
async function input(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  await act(async () => { Object.getOwnPropertyDescriptor(element.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true })); });
}
async function click(text: string) { await act(async () => button(text).click()); await settle(); }
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.stubGlobal("fetch", m.fetch);
  saved = { opportunityId: "opp-new", opportunityNumber: "OPP-TEST", clientCompany: "Synthetic company", title: "", need: "", source: "", nextStep: "", revision: 0,
    missingFields: ["Nombre de oportunidad", "Necesidad", "Origen"], managed: true };
  m.fetch.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.startsWith("/api/clients?")) return response({ clients: [{ clientId: "client-a", company: "Synthetic company", contactName: null }] });
    if (url.startsWith("/api/opportunities?")) return response({ opportunities: [{ opportunityId: "existing-opp", opportunityNumber: "OPP-OLD", title: "Existing sale" }] });
    if (url === "/api/quotes" && init?.method === "POST") return response({ quote });
    if (url.endsWith("/opportunity")) return response({ opportunity: saved });
    if (url.endsWith("/intake") && init?.method === "PATCH") {
      const fields = JSON.parse(init.body as string); saved = { ...saved, ...fields, revision: fields.revision + 1,
        missingFields: [!fields.title ? "Nombre de oportunidad" : null, !fields.need ? "Necesidad" : null, !fields.source ? "Origen" : null].filter(Boolean) };
      return response({ opportunity: saved });
    }
    throw Error(`Unexpected ${url}`);
  });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
async function renderShell(playbookFieldEnabled = false) { await act(async () => root.render(<QuoteShell playbookFieldEnabled={playbookFieldEnabled} currentTenantSlug="test" items={[]} tenantName="Test" tenantOptions={[]} />)); }
async function renderPanel() { await act(async () => root.render(<QuoteOpportunityPanel key="new-quote" quoteId="new-quote" />)); await settle(); }
function field(label: string) { const element = [...container.querySelectorAll("label")].find(item => item.textContent?.startsWith(label))?.querySelector("input, textarea"); if (!element) throw Error(`No field ${label}`); return element as HTMLInputElement; }

describe("deferred opportunity intake from quotation", () => {
  it("shows and submits the variable field when the tenant explicitly enables it", async () => {
    await renderShell(true);
    await input(container.querySelector('[aria-label="Cliente de la cotización"]')!, "Synthetic company");
    await input(field("Guía comercial (opcional)"), "Renovación");
    await click("Crear cotizacion");
    expect(JSON.parse(m.fetch.mock.calls.find(([url]) => url === "/api/quotes")![1].body)).toMatchObject({ playbookName: "Renovación" });
  });
  it("creates immediately without CRM fields and shows the linked persistent reminder", async () => {
    await renderShell(); await input(container.querySelector('[aria-label="Cliente de la cotización"]')!, "Synthetic company");
    await click("Crear cotizacion");
    expect(container.querySelector('input[placeholder="Playbook"]')).toBeNull();
    expect(container.textContent).not.toContain("Guía comercial (opcional)");
    const post = m.fetch.mock.calls.find(([url]) => url === "/api/quotes")!;
    expect(JSON.parse(post[1].body)).not.toHaveProperty("playbookName");
    expect(JSON.parse(post[1].body)).toMatchObject({ opportunityMode: "new", clientName: "Synthetic company", proposalName: "", creationId: expect.any(String) });
    expect(container.textContent).toContain("Datos de oportunidad pendientes");
    expect(container.textContent).toContain("Puedes seguir cotizando");
    expect(container.textContent).toContain("Editor de partidas disponible");
    expect(container.querySelector("textarea")).toBeNull();
  });
  it("keeps the creation key after an uncertain response and suppresses double-click posts", async () => {
    const fallback = m.fetch.getMockImplementation()!; let attempts = 0;
    m.fetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/quotes" && ++attempts === 1) throw Error("Respuesta interrumpida");
      return fallback(url, init);
    });
    await renderShell(); await input(container.querySelector('[aria-label="Cliente de la cotización"]')!, "Synthetic company");
    await click("Crear cotizacion");
    await act(async () => { button("Crear cotizacion").click(); button("Crear cotizacion").click(); }); await settle();
    const requests = m.fetch.mock.calls.filter(([url]) => url === "/api/quotes").map(([, init]) => JSON.parse(init.body));
    expect(requests).toHaveLength(2); expect(requests[1].creationId).toBe(requests[0].creationId);
  });
  it("requires selecting an available opportunity for the chosen catalog client", async () => {
    await renderShell();
    await act(async () => (container.querySelector('input[value="existing"]') as HTMLInputElement).click());
    await input(container.querySelector('[aria-label="Cliente de la cotización"]')!, "Synthetic"); await settle(300);
    expect(button("Crear cotizacion").disabled).toBe(true);
    await act(async () => button("Synthetic company").dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))); await settle();
    const select = container.querySelector("fieldset select") as HTMLSelectElement;
    await act(async () => { select.value = "existing-opp"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    await click("Crear cotizacion");
    expect(JSON.parse(m.fetch.mock.calls.find(([url]) => url === "/api/quotes")![1].body)).toMatchObject({ opportunityMode: "existing", opportunityId: "existing-opp", clientId: "client-a" });
  });
  it("saves partial fields, survives remount and clears the reminder after completion", async () => {
    await renderPanel(); await click("Completar datos de la oportunidad");
    await input(field("Nombre de oportunidad"), "Mail protection"); await click("Guardar datos");
    expect(container.textContent).toContain("Avance guardado"); expect(container.textContent).toContain("Datos de oportunidad pendientes");
    await act(async () => root.render(<div />)); await renderPanel();
    expect(container.textContent).toContain("Datos de oportunidad pendientes"); await click("Completar datos de la oportunidad");
    expect(field("Nombre de oportunidad").value).toBe("Mail protection");
    await input(field("Necesidad del cliente"), "Protect mailboxes"); await input(field("Origen"), "Customer request"); await click("Guardar datos");
    expect(container.textContent).not.toContain("Datos de oportunidad pendientes"); expect(container.textContent).toContain("Datos de la oportunidad completos");
  });
  it("keeps the reminder and entered fields if the update is rejected", async () => {
    await renderPanel(); await click("Completar datos de la oportunidad"); await input(field("Nombre de oportunidad"), "Unsaved name");
    m.fetch.mockResolvedValueOnce(response({ error: "La oportunidad cambió. Recarga antes de guardar." }, false));
    await click("Guardar datos");
    expect(field("Nombre de oportunidad").value).toBe("Unsaved name"); expect(container.textContent).toContain("Datos de oportunidad pendientes");
    expect(container.textContent).toContain("La oportunidad cambió");
  });
});
