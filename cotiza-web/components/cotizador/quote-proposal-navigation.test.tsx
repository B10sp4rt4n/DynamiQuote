// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { QuoteLinesPutResponse } from "@/lib/validations/quote-editor-response";
import { QuoteLineEditor } from "./quote-line-editor";

const m = vi.hoisted(() => ({ fetch: vi.fn(), navigate: vi.fn(), push: vi.fn(), refresh: vi.fn(),
  imported: null as QuoteLinesPutResponse | null, didImport: false, proposal: {} as unknown, ok: true }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: m.push, refresh: m.refresh }) }));
vi.mock("recharts", () => ({ Cell: () => null, Pie: () => null, PieChart: () => null, ResponsiveContainer: () => null, Tooltip: () => null }));
vi.mock("./threatdown-import-modal", () => ({ ThreatDownImportModal: ({ onImported }: { onImported: (data: QuoteLinesPutResponse) => void }) =>
  <button onClick={() => { m.didImport = true; onImported(m.imported!); }}>Completar importación sintética</button> }));

const quote: QuoteLinesPutResponse["quote"] = { quoteId: "synthetic-q1", quoteGroupId: "COT-TEST", clientName: "Empresa de prueba", proposalName: "Servicio de prueba",
  createdAt: "2026-11-13", status: "draft", playbookName: null, totalRevenue: 100, avgMargin: 20, version: 1, versionCount: 1 };
const line = { lineId: "synthetic-line", sku: "TEST", description: "Partida de prueba", quantity: 1, costUnit: 80,
  priceUnit: 100, marginPct: 20, classification1: "product" as const, classification2: "" };
let root: Root, container: HTMLDivElement;
function button(text: string) { return [...container.querySelectorAll("button")].find(b => b.textContent === text)!; }
async function click(text: string) { await act(async () => button(text).click()); }
function Workspace() {
  const [quotes, setQuotes] = useState([quote]), [selected, setSelected] = useState(quote.quoteId);
  return <QuoteLineEditor quotes={quotes} forcedSelectedQuoteId={selected} threatDownImportEnabled
    onQuoteVersionSaved={saved => setQuotes([saved])} onSelectedQuoteChange={id => setSelected(id)} />;
}
async function render() { await act(async () => root.render(<Workspace />)); }
beforeEach(() => {
  vi.clearAllMocks(); m.didImport = false; m.imported = null; m.ok = true;
  m.proposal = { proposal: { proposalId: "synthetic-proposal", formal: { proposalNumber: "PROP-TEST" } } };
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.stubGlobal("fetch", m.fetch);
  vi.stubGlobal("window", new Proxy(window, { get(target, key, receiver) {
    return key === "location" ? { assign: m.navigate } : Reflect.get(target, key, receiver);
  } }));
  m.fetch.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === "/api/proposals") return { ok: m.ok, json: async () => m.proposal };
    const active = m.didImport ? m.imported!.quote : quote;
    if (url.endsWith("/versions")) return { ok: true, json: async () => ({ quoteGroupId: active.quoteGroupId,
      currentQuoteId: active.quoteId, versions: [{ ...active, closedAt: null, rejectedAt: null, sentAt: null }] }) };
    if (url.endsWith("/lines") && init?.method === "GET") return { ok: true, json: async () => ({ lines: m.didImport ? m.imported!.lines : [line] }) };
    throw Error(`Unexpected request ${init?.method} ${url}`);
  });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

it.each([false, true])("opens the returned proposal immediately after PDF import (new version: %s)", async newVersion => {
  await render();
  m.imported = { quote: { ...quote, quoteId: newVersion ? "synthetic-q2" : quote.quoteId, version: newVersion ? 2 : 1,
    versionCount: newVersion ? 2 : 1, totalRevenue: 500 }, lines: [{ ...line, costUnit: 400, priceUnit: 500 }],
    versionCreated: newVersion, totals: { totalCost: 400, totalRevenue: 500, grossProfit: 100, avgMargin: 20 } };
  await click("Importar PDF ThreatDown"); await click("Completar importación sintética");
  expect(button("Crear propuesta").disabled).toBe(false);
  await click("Crear propuesta");
  const writes = m.fetch.mock.calls.filter(([, init]) => init?.method === "POST");
  expect(writes).toHaveLength(1);
  expect(JSON.parse(writes[0][1].body)).toMatchObject({ quoteId: m.imported.quote.quoteId });
  expect(m.navigate).toHaveBeenCalledExactlyOnceWith("/propuestas?proposalId=synthetic-proposal");
  expect(m.push).not.toHaveBeenCalled(); expect(m.refresh).not.toHaveBeenCalled();
  expect(button("Generando...").disabled).toBe(true);
  await click("Generando...");
  expect(m.fetch.mock.calls.filter(([url]) => url === "/api/proposals")).toHaveLength(1);
});

it.each([false, true])("stays in the quote when creation fails or has no destination (malformed success: %s)", async malformed => {
  await render(); m.ok = malformed;
  m.proposal = malformed ? { proposal: { formal: null } } : { error: "No fue posible crear la propuesta" };
  await click("Crear propuesta");
  expect(m.navigate).not.toHaveBeenCalled(); expect(button("Crear propuesta").disabled).toBe(false);
  expect(container.textContent).toContain(malformed ? "No fue posible generar la propuesta" : "No fue posible crear la propuesta");
});

it("does not create a proposal while its quote lines are still loading", async () => {
  const fallback = m.fetch.getMockImplementation()!;
  let resolve!: (value: unknown) => void;
  m.fetch.mockImplementation((url: string, init?: RequestInit) => url.endsWith("/lines")
    ? new Promise(r => { resolve = r; }) : fallback(url, init));
  await render(); expect(button("Crear propuesta").disabled).toBe(true); await click("Crear propuesta");
  expect(m.fetch.mock.calls.some(([url]) => url === "/api/proposals")).toBe(false);
  await act(async () => resolve({ ok: true, json: async () => ({ lines: [line] }) }));
  expect(button("Crear propuesta").disabled).toBe(false);
});
