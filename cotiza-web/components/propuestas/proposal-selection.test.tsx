// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ProposalListCounts, ProposalSummary } from "@/lib/db/proposals";
import { ProposalShell } from "./proposal-shell";

const m = vi.hoisted(() => ({ query: "proposalId=older", fetch: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: m.replace, refresh: m.refresh }),
  usePathname: () => "/propuestas",
  useSearchParams: () => new URLSearchParams(m.query),
}));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }));

function summary(id: string): ProposalSummary {
  return { proposalId: id, createdAt: "2026-11-01T18:00:00Z", origin: `quote-${id}`, status: "draft",
    formal: { clientLogoId: "", clientLogoDataUrl: "", currency: "MXN", customIntro: null, objective: null,
      issuerCompany: "Emisor", issuerContactName: "Vendedor", issuerEmail: "emisor@example.com", issuerPhone: "",
      issuerLogoId: "", issuerLogoDataUrl: "", issuedDate: "2026-11-01", proposalDocId: `doc-${id}`, proposalNumber: `PROP-${id}`,
      quoteId: `quote-${id}`, recipientCompany: `Cliente ${id}`, recipientContactName: "Contacto", recipientContactTitle: "",
      recipientEmail: "cliente@example.com", subject: `Asunto ${id}`, termsAndConditions: "", validUntil: null, status: "draft" } };
}
function detail(id: string) {
  return { proposal: { ...saved.get(id)!, items: [{ itemNumber: 1, componentType: "product", costUnit: 80, priceUnit: 100,
    quantity: 2, description: `Servicio ${id}`, sku: id, origin: "manual", status: "active" }], approvals: [],
    approvalGate: { canAuthorizeFinal: false, missingRoles: ["owner"] }, issuanceStatus: "normal" } };
}
const response = (body: unknown, ok = true) => ({ ok, json: async () => body });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
let container: HTMLDivElement;
let root: Root;
let saved: Map<string, ProposalSummary>;
let offPage: boolean;
const element = () => <ProposalShell canForceIssuance={false} counts={{} as ProposalListCounts} hasMore
  initialBlockedMarginFilter={false} initialOutcomeFilter="all" initialStatusFilter="all" tenantName="Prueba"
  proposals={offPage ? [saved.get("newest")!] : [...saved.values()]} requestedProposal={saved.get("older")!} />;
const render = () => act(async () => { root.render(element()); });
const subject = () => container.querySelector<HTMLInputElement>("#proposal-subject")!;
const saveButton = () => [...container.querySelectorAll("button")].find(b => b.textContent === "Guardar cambios")!;
const activeNumber = () => container.querySelector("article h2")?.textContent;
const writes = () => m.fetch.mock.calls.filter(([, init]) => init?.method === "PUT");
async function navigate(query: string) { m.query = query; await render(); }
async function editAndSave(value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(subject(), value);
    subject().dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => saveButton().click());
}

beforeEach(() => {
  vi.clearAllMocks(); m.query = "proposalId=older"; offPage = false;
  saved = new Map(["newest", "older"].map(id => [id, summary(id)]));
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", m.fetch);
  // Deliberately disagree with the router: SSR and client must use the URL
  // supplied by Next, never a window-only initializer or the first row.
  window.history.replaceState(null, "", "/propuestas?proposalId=newest");
  m.fetch.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.startsWith("/api/commercial-context")) return response({ context: null });
    if (url.startsWith("/api/proposals?")) return response({ items: [saved.get("newest")!], hasMore: false });
    const id = url.split("/").at(-1)!;
    if (!saved.has(id)) throw Error(`Unexpected request ${url}`);
    if (init?.method === "PUT") {
      const input = JSON.parse(init.body as string);
      const previous = saved.get(id)!;
      saved.set(id, { ...previous, formal: { ...previous.formal!, subject: input.subject ?? previous.formal!.subject } });
    }
    return response(detail(id));
  });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals();
});

it("renders and loads the selected older proposal outside the first page", async () => {
  offPage = true;
  const html = renderToString(element());
  expect(html).toContain('value="Asunto older"');
  expect(html).toContain('PROP-older</h2>');
  await render();
  expect(activeNumber()).toBe("PROP-older");
  expect(subject().value).toBe("Asunto older");
  expect(m.fetch.mock.calls.filter(([url]) => url === "/api/proposals/newest")).toHaveLength(0);
  expect(m.replace).not.toHaveBeenCalled();
  await editAndSave("Asunto corregido");
  expect(writes().map(([url]) => url)).toEqual(["/api/proposals/older"]);
  await act(async () => saveButton().click());
  expect(writes()).toHaveLength(1);
});

it("responds to another Edit link in the same mounted editor and saves that identity", async () => {
  await render();
  await navigate("proposalId=newest");
  expect(activeNumber()).toBe("PROP-newest");
  expect(subject().value).toBe("Asunto newest");
  await editAndSave("Asunto de la seleccionada");
  expect(writes().map(([url]) => url)).toEqual(["/api/proposals/newest"]);
  expect(saved.get("older")!.formal!.subject).toBe("Asunto older");
  await navigate("proposalId=older");
  expect(subject().value).toBe("Asunto older");
});

it("selects a clicked row through the URL and retains the list filters", async () => {
  m.query = "proposalId=older&status=draft";
  await render();
  const row = [...container.querySelectorAll("tbody tr")].find(tr => tr.textContent?.includes("PROP-newest"))!;
  await act(async () => (row as HTMLElement).click());
  expect(m.replace).toHaveBeenLastCalledWith("/propuestas?proposalId=newest&status=draft", { scroll: false });
  await navigate("proposalId=newest&status=draft");
  expect(activeNumber()).toBe("PROP-newest");
});

it("keeps the selected identity when a list filter removes its row", async () => {
  await render();
  await navigate("proposalId=older&status=approved");
  expect(activeNumber()).toBe("PROP-older");
  expect(subject().value).toBe("Asunto older");
  expect(container.querySelectorAll("tbody tr")[0].textContent).toContain("PROP-newest");
  await editAndSave("Asunto después del filtro");
  expect(writes()[0][0]).toBe("/api/proposals/older");
});

it.each(["success", "error"])("ignores a late %s from the previously selected proposal", async result => {
  const pending = deferred<ReturnType<typeof response>>();
  const normal = m.fetch.getMockImplementation()!;
  m.fetch.mockImplementation((url, init) => url === "/api/proposals/older" && init?.method === "GET" ? pending.promise : normal(url, init));
  await render();
  expect(saveButton().disabled).toBe(true);
  await navigate("proposalId=newest");
  expect(subject().value).toBe("Asunto newest");
  await act(async () => {
    if (result === "success") pending.resolve(response(detail("older")));
    else pending.reject(new Error("Fallo de la propuesta anterior"));
  });
  expect(activeNumber()).toBe("PROP-newest");
  expect(subject().value).toBe("Asunto newest");
  expect(container.textContent).not.toContain("Fallo de la propuesta anterior");
  await editAndSave("Asunto newest corregido");
  expect(writes()[0][0]).toBe("/api/proposals/newest");
});

it.each(["failed", "wrong-identity"])("blocks saving when the selected detail is %s", async mode => {
  const normal = m.fetch.getMockImplementation()!;
  m.fetch.mockImplementation((url, init) => url === "/api/proposals/older" && init?.method === "GET"
    ? Promise.resolve(mode === "failed" ? response({ error: "No se pudo cargar" }, false) : response(detail("newest"))) : normal(url, init));
  await render();
  expect(activeNumber()).toBe("PROP-older");
  expect(saveButton().disabled).toBe(true);
  await act(async () => saveButton().click());
  expect(writes()).toHaveLength(0);
});

it("retries the selected detail after a failed load without switching proposals", async () => {
  const normal = m.fetch.getMockImplementation()!;
  m.fetch.mockImplementation((url, init) => url === "/api/proposals/older" && init?.method === "GET"
    ? Promise.reject(new Error("Carga interrumpida")) : normal(url, init));
  await render();
  expect(saveButton().disabled).toBe(true);
  m.fetch.mockImplementation(normal);
  const retry = [...container.querySelectorAll("button")].find(b => b.textContent?.includes("Reintentar carga"))!;
  await act(async () => retry.click());
  expect(activeNumber()).toBe("PROP-older");
  expect(subject().value).toBe("Asunto older");
  expect(saveButton().disabled).toBe(false);
});

it("ignores a save response after navigating to a different proposal", async () => {
  await render();
  const pending = deferred<ReturnType<typeof response>>();
  const normal = m.fetch.getMockImplementation()!;
  m.fetch.mockImplementation((url, init) => url === "/api/proposals/older" && init?.method === "PUT" ? pending.promise : normal(url, init));
  await editAndSave("Cambio de older");
  expect(writes()[0][0]).toBe("/api/proposals/older");
  await navigate("proposalId=newest");
  await act(async () => pending.resolve(response({ proposal: { ...detail("older").proposal,
    formal: { ...saved.get("older")!.formal!, subject: "Cambio de older" } } })));
  expect(activeNumber()).toBe("PROP-newest");
  expect(subject().value).toBe("Asunto newest");
  expect(container.textContent).not.toContain("Cambios guardados correctamente");
});

it("does not display a different proposal for an unknown URL identity", async () => {
  m.query = "proposalId=missing";
  await render();
  expect(subject()).toBeNull();
  expect(container.querySelector("article")!.textContent).toContain("La propuesta seleccionada no está disponible");
  expect(m.fetch.mock.calls.filter(([url]) => url.startsWith("/api/proposals/"))).toHaveLength(0);
  expect(m.replace).not.toHaveBeenCalled();
});
