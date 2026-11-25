// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThreatDownImportModal } from "./threatdown-import-modal";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), imported: vi.fn(), close: vi.fn() }));
const fileHash = "a".repeat(64);
const source = {
  quoteNumber: "Q-123456", licenseTo: "Cliente sintetico", currency: "USD", preliminary: true,
  startsOn: "2026-11-01", endsOn: "2027-10-31", expiresOn: "2026-11-30", termMonths: 12, netTotal: 20,
  lines: [{ sku: "TESTSKU1", description: "Producto sintetico", quantity: 2, costUnit: 10, netTotal: 20 }],
};
const imported = {
  lines: [{ lineId: "line-1", sku: "TESTSKU1", description: "Producto sintetico", quantity: 2,
    costUnit: 10, priceUnit: 0, marginPct: 0, classification1: "product", classification2: "" }],
  quote: { quoteId: "quote-imported", quoteGroupId: "group-1", clientName: "Cliente sintetico",
    proposalName: "Cotizacion", createdAt: "2026-11-25T12:00:00Z", playbookName: null,
    status: "draft", version: 1, versionCount: 1, totalRevenue: 0, avgMargin: 0, currency: "USD" },
  totals: { totalCost: 20, totalRevenue: 0, grossProfit: -20, avgMargin: 0 }, versionCreated: false,
};
const response = (data: unknown, ok = true) => ({ ok, json: async () => data });
let container: HTMLDivElement, root: Root;

beforeEach(() => {
  vi.clearAllMocks(); mocks.fetch.mockReset();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.stubGlobal("fetch", mocks.fetch);
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: vi.fn() });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: vi.fn() });
  mocks.fetch.mockImplementation(async (_url: string, init: RequestInit) =>
    (init.body as FormData).get("action") === "preview" ? response({ source, fileHash }) : response(imported));
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

async function render() {
  await act(async () => root.render(<ThreatDownImportModal quoteId="quote-1" clientName="Cliente sintetico"
    commercialEvidenceEnabled onImported={mocks.imported} onClose={mocks.close} />));
}
function button(label: string) {
  const found = [...container.querySelectorAll("button")].find(b => b.textContent === label);
  if (!found) throw Error("No button: " + label);
  return found;
}
async function click(label: string) { await act(async () => button(label).click()); }
async function selectFile() {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
  await act(async () => {
    Object.defineProperty(input, "files", { configurable: true, value: [new File(["%PDF-synthetic"], "quote.pdf")] });
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
async function confirm() { await act(async () => container.querySelector<HTMLInputElement>("#td-confirm")!.click()); }
async function saveEvidence() {
  await act(async () => [...container.querySelectorAll("label")].find(l => l.textContent?.includes("Guardar PDF"))!.querySelector("input")!.click());
}
const forms = () => mocks.fetch.mock.calls.map(([, init]) => (init as RequestInit).body as FormData);
async function selectCurrency(currency: string) {
  await act(async () => {
    const select = container.querySelector<HTMLSelectElement>('[aria-label="Moneda de los costos importados"]')!;
    select.value = currency; select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
async function setRate(value: string) {
  await act(async () => {
    const input = container.querySelector<HTMLInputElement>('[aria-label="Tipo de cambio USD a MXN"]')!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("ThreatDown PDF review and import recovery", () => {
  it("defaults to net costs in USD without opting into evidence", async () => {
    await render(); await selectFile(); await confirm(); await click("Importar partidas");
    const form = forms().find(form => form.get("action") === "apply")!;
    expect(form.get("includeCosts")).toBe("yes"); expect(form.get("costCurrency")).toBe("USD");
    expect(form.get("exchangeRate")).toBe("1"); expect(form.has("saveCommercialEvidence")).toBe(false);
    expect(mocks.imported).toHaveBeenCalledOnce();
  });
  it("requires a reviewed exchange rate for MXN and displays the converted unit cost and total", async () => {
    await render(); await selectFile(); await selectCurrency("MXN");
    expect(button("Importar partidas").disabled).toBe(true);
    expect(container.textContent).toContain("Captura un tipo de cambio positivo");
    await setRate("20");
    expect(container.textContent).toMatch(/MXN\s+200\.00/);
    expect(container.textContent).toMatch(/MXN\s+400\.00/);
    await confirm();
    mocks.fetch.mockResolvedValueOnce(response({ ...imported, quote: { ...imported.quote, currency: "MXN" },
      totals: { ...imported.totals, totalCost: 400, grossProfit: -400 } }));
    await click("Importar partidas");
    const form = forms().find(form => form.get("action") === "apply")!;
    expect(form.get("costCurrency")).toBe("MXN"); expect(form.get("exchangeRate")).toBe("20");
    expect(mocks.imported).toHaveBeenCalledOnce();
  });
  it("retains the explicit items-only path", async () => {
    await render(); await selectFile();
    await act(async () => [...container.querySelectorAll("label")].find(l => l.textContent?.includes("Importar el costo neto unitario"))!.querySelector("input")!.click());
    await confirm();
    mocks.fetch.mockResolvedValueOnce(response({ ...imported, quote: { ...imported.quote, currency: undefined },
      totals: { ...imported.totals, totalCost: 0, grossProfit: 0 } }));
    await click("Importar partidas");
    expect(forms().find(form => form.get("action") === "apply")!.get("includeCosts")).toBe("no");
    expect(mocks.imported).toHaveBeenCalledOnce();
  });
  it("removes an earlier preview and confirmation when a re-read fails", async () => {
    await render(); await selectFile(); await confirm();
    expect(container.textContent).toContain("TESTSKU1");
    mocks.fetch.mockResolvedValueOnce(response({ error: "No se pudo completar la lectura." }, false));
    await click("Volver a leer PDF");
    expect(container.textContent).toContain("No se pudo completar la lectura.");
    expect(container.textContent).not.toContain("TESTSKU1");
    expect(container.querySelector("#td-confirm")).toBeNull();
    expect(container.textContent).toContain("quote.pdf");
    expect(forms().every(form => form.get("action") === "preview")).toBe(true);
  });

  it("retains a valid preview and the same operation when the import response fails", async () => {
    await render(); await selectFile(); await confirm();
    mocks.fetch.mockResolvedValueOnce(response({ error: "La lectura se completó; reintenta la misma operación." }, false));
    await click("Importar partidas");
    expect(container.textContent).toContain("TESTSKU1");
    expect(container.textContent).toContain("La lectura se completó");
    await click("Importar partidas");
    const attempts = forms().filter(form => form.get("action") === "apply");
    expect(attempts).toHaveLength(2);
    expect(attempts[1].get("operationId")).toBe(attempts[0].get("operationId"));
    expect(attempts[1].get("expectedHash")).toBe(fileHash);
    expect(mocks.imported).toHaveBeenCalledOnce();
  });

  it("preserves MXN conversion and evidence consent across re-reading the same PDF after a lost response", async () => {
    await render(); await selectFile(); await selectCurrency("MXN"); await setRate("20"); await saveEvidence(); await confirm();
    mocks.fetch.mockRejectedValueOnce(new TypeError("connection interrupted"));
    await click("Importar partidas");
    expect(container.textContent).toContain("No se pudo confirmar la importación");
    await click("Volver a leer PDF");
    expect(container.querySelector<HTMLInputElement>("#td-confirm")!.checked).toBe(false);
    expect(container.querySelector<HTMLSelectElement>("select")!.value).toBe("MXN");
    expect(container.querySelector<HTMLInputElement>('[aria-label="Tipo de cambio USD a MXN"]')!.value).toBe("20");
    mocks.fetch.mockResolvedValueOnce(response({ ...imported, quote: { ...imported.quote, currency: "MXN" },
      totals: { ...imported.totals, totalCost: 400, grossProfit: -400 } }));
    await confirm(); await click("Importar partidas");
    const attempts = forms().filter(form => form.get("action") === "apply");
    expect(attempts).toHaveLength(2);
    expect(attempts[1].get("operationId")).toBe(attempts[0].get("operationId"));
    expect(attempts.map(form => form.get("saveCommercialEvidence"))).toEqual(["yes", "yes"]);
    expect(attempts.map(form => [form.get("costCurrency"), form.get("exchangeRate")])).toEqual([["MXN", "20"], ["MXN", "20"]]);
    expect(mocks.imported).toHaveBeenCalledOnce();
  });

  it("labels the import as an import and suppresses a rapid double click", async () => {
    await render(); await selectFile(); await confirm();
    let resolve!: (value: ReturnType<typeof response>) => void;
    mocks.fetch.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const apply = button("Importar partidas");
    await act(async () => { apply.click(); apply.click(); });
    expect(container.textContent).toContain("Importando las partidas al borrador");
    expect(container.textContent).toContain("Importando partidas…");
    expect(container.textContent).not.toContain("Leyendo PDF…");
    expect(forms().filter(form => form.get("action") === "apply")).toHaveLength(1);
    await act(async () => resolve(response(imported)));
    expect(mocks.imported).toHaveBeenCalledOnce();
  });

  it("does not show or apply a malformed preview response", async () => {
    await render();
    mocks.fetch.mockResolvedValueOnce(response({ source: { quoteNumber: "Old" }, fileHash }));
    await selectFile();
    expect(container.textContent).toContain("No se pudo validar la lectura");
    expect(container.querySelector("#td-confirm")).toBeNull();
    expect(mocks.imported).not.toHaveBeenCalled();
  });
});
