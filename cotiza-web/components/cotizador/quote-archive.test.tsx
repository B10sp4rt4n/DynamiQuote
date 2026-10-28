// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { QuoteLineEditor } from "./quote-line-editor";
const m = vi.hoisted(() => ({ fetch: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: m.refresh }) }));
vi.mock("recharts", () => ({ Cell: () => null, Pie: () => null, PieChart: () => null, ResponsiveContainer: () => null, Tooltip: () => null }));
const quote = { quoteId: "fixture", quoteGroupId: "COT-X", clientName: "Fixture", proposalName: "Fixture", createdAt: "2026-01-01",
  status: "draft", playbookName: null, totalRevenue: 100, avgMargin: 40, version: 1, versionCount: 1 };
let root: Root, container: HTMLDivElement, status: string;
function button(text: string) { return [...container.querySelectorAll("button")].find(b => b.textContent?.trim() === text)!; }
async function click(text: string) { await act(async () => button(text).click()); }
async function render() { await act(async () => { root.render(<QuoteLineEditor quotes={[quote]} forcedSelectedQuoteId="fixture" />); }); }
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.stubGlobal("fetch", m.fetch); status = "draft";
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  m.fetch.mockImplementation(async (url: string, init?: RequestInit) => {
    if (init?.method === "PATCH") { status = JSON.parse(init.body as string).action === "archive" ? "archived" : "draft"; return { ok: true, json: async () => ({ status }) }; }
    if (url.endsWith("/versions")) return { ok: true, json: async () => ({ quoteGroupId: "COT-X", currentQuoteId: "fixture", versions: [{ quoteId: "fixture", status, version: 1, totalRevenue: 100, avgMargin: 40,
      createdAt: "2026-01-01", closedAt: null, rejectedAt: null, sentAt: null, archiveReason: status === "archived" ? "No usar" : null }] }) };
    return { ok: true, json: async () => ({ lines: [{ lineId: "line", sku: "X", description: "Fixture", quantity: 1, costUnit: 60, priceUnit: 100, marginPct: 40, classification1: "product", classification2: "" }] }) };
  });
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
it("uses fresh version status in the selector rather than the old draft prop", async () => {
  status = "closed"; await render();
  expect(container.querySelector('#quote-selector option')!.textContent).toContain("Cerrada");
  expect(container.querySelector('#quote-selector option')!.textContent).not.toContain("Borrador");
});
it("archives the selected draft, blocks editing and restores without creating a version", async () => {
  await render(); await click("Archivar borrador"); expect(button("Confirmar archivo").disabled).toBe(true);
  const input = container.querySelector('[aria-label="Motivo para archivar"]') as HTMLInputElement;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "No usar"); input.dispatchEvent(new Event("input", { bubbles: true })); });
  await click("Confirmar archivo");
  expect((container.querySelector('[aria-label="Partidas de cotización"]') as HTMLFieldSetElement).disabled).toBe(true);
  expect(button("Guardar").disabled).toBe(true); expect(button("Crear propuesta").disabled).toBe(true);
  expect(container.textContent).toContain("Motivo: No usar"); expect(container.querySelector('#quote-selector option')!.textContent).toContain("Archivada");
  await click("Reactivar borrador"); expect((container.querySelector('[aria-label="Partidas de cotización"]') as HTMLFieldSetElement).disabled).toBe(false);
  expect(container.querySelector('#quote-selector option')!.textContent).toContain("Borrador");
  const writes = m.fetch.mock.calls.filter(call => call[1]?.method === "PATCH");
  expect(writes.map(call => [call[0], JSON.parse(call[1].body)])).toEqual([["/api/quotes/fixture", { action: "archive", reason: "No usar" }], ["/api/quotes/fixture", { action: "restore" }]]);
});
