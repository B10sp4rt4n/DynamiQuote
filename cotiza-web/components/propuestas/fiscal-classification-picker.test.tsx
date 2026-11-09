// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FiscalClassificationPicker } from "./fiscal-classification-picker";
let root: Root, host: HTMLDivElement;
const catalog = { cfdiVersion: "4.0", source: "SAT", sourceUrl: "http://omawww.sat.gob.mx/catalog.xls", publishedAt: "2026-11-06", checkedAt: "2026-11-08", sourceSha256: "b".repeat(64), counts: { product: 52513, unit: 2418 } };
const product = { code: "43233205", description: "Software de seguridad", details: "", notes: "", valid: true, validFrom: "2022-01-01", validTo: null, domainRelations: ["edr → seguridad"] };
const unit = { ...product, code: "E48", description: "Unidad de servicio", domainRelations: [] };
const classification = { itemNumber: 1, satProductCode: product.code, unitCode: unit.code, catalogVersion: catalog.sourceSha256, classificationEventId: "fcl_" + "c".repeat(64) };
const change = vi.fn();
const props = { proposalId: "p1", itemNumber: 1, description: "EDR ThreatDown 12 meses", fingerprint: "a".repeat(64), onChange: change };
const buttons = () => Array.from(host.querySelectorAll("button"));
const button = (text: string) => buttons().find(row => row.textContent?.includes(text))!;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); change.mockClear();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
const json = (data: unknown) => Promise.resolve({ ok: true, json: async () => data });
async function chooseNature() {
  await act(async () => root.render(<FiscalClassificationPicker {...props} />));
  await act(async () => { const select = host.querySelector("select")!; select.value = "license"; select.dispatchEvent(new Event("change", { bubbles: true })); });
}
function setInput(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}
it("requires explicit selection, review and confirmation before applying either code", async () => {
  const fetcher = vi.fn((url: string, init?: RequestInit) => {
    if (init?.method === "POST") return json({ classification });
    const q = new URL(url, "https://cotiza.test").searchParams;
    if (q.get("mode") === "memory") return json({ memory: null });
    expect(q.get("itemNumber")).toBe("1");
    return json({ catalog, results: [q.get("kind") === "product" ? product : unit] });
  });
  vi.stubGlobal("fetch", fetcher); await chooseNature();
  expect(button("Confirmar clasificación").disabled).toBe(true);
  await act(async () => buttons().filter(row => row.textContent === "Buscar")[0].click());
  expect(host.textContent).toContain("Relación de búsqueda");
  await act(async () => button("43233205").click());
  expect(change).not.toHaveBeenCalledWith(classification);
  await act(async () => setInput(host.querySelectorAll<HTMLInputElement>('input[type="text"], input:not([type])')[1], "E48"));
  await act(async () => buttons().filter(row => row.textContent === "Buscar")[1].click());
  await act(async () => button("E48").click());
  expect(button("Confirmar clasificación").disabled).toBe(true);
  await act(async () => host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
  await act(async () => button("Confirmar clasificación").click());
  expect(change).toHaveBeenLastCalledWith(classification);
  const posted = JSON.parse(fetcher.mock.calls.find(row => row[1]?.method === "POST")![1]!.body as string);
  expect(posted).toMatchObject({ confirm: true, remember: true, expectedFingerprint: props.fingerprint });
  await act(async () => setInput(host.querySelectorAll<HTMLInputElement>('input[type="text"], input:not([type])')[0], "Otra operación"));
  expect(change).toHaveBeenLastCalledWith(null); expect(button("Confirmar clasificación").disabled).toBe(true);
});
it("keeps a remembered pair pending until the operator reviews and confirms it again", async () => {
  vi.stubGlobal("fetch", vi.fn(() => json({ memory: { satProductCode: product.code, unitCode: unit.code, catalogVersion: "d".repeat(64) },
    validation: { valid: true, catalog, items: [{ itemNumber: 1, valid: true, product, unit }] } })));
  await chooseNature();
  expect(host.textContent).toContain("El catálogo se actualizó");
  await act(async () => button("Revisar selección anterior").click());
  expect(button("Confirmar clasificación").disabled).toBe(true);
  expect(change).toHaveBeenLastCalledWith(null);
});
it("discards an older search response after its query was edited", async () => {
  let resolve: (value: unknown) => void = () => {};
  vi.stubGlobal("fetch", vi.fn((url: string) => url.includes("mode=memory") ? json({ memory: null }) : new Promise(r => { resolve = r; })));
  await chooseNature();
  await act(async () => buttons().filter(row => row.textContent === "Buscar")[0].click());
  await act(async () => setInput(host.querySelector<HTMLInputElement>('input:not([type])')!, "Otra búsqueda"));
  await act(async () => resolve({ ok: true, json: async () => ({ catalog, results: [product] }) }));
  expect(host.textContent).not.toContain("43233205");
});

it("does not overwrite a local edit with a late saved-classification response", async () => {
  let finish!: (value: unknown) => void;
  vi.stubGlobal("fetch", vi.fn((url: string) => url.includes("mode=resume")
    ? new Promise(resolve => { finish = resolve; }) : json({ memory: null })));
  await chooseNature();
  await act(async () => finish({ ok: true, json: async () => ({ saved: { classification, nature: "support", remember: false },
    validation: { valid: true, catalog, items: [{ itemNumber: 1, valid: true, product, unit }] } }) }));
  expect(host.querySelector("select")!.value).toBe("license");
  expect(host.textContent).not.toContain("Claves vigentes y confirmadas para esta revisión.");
  expect(change).not.toHaveBeenCalledWith(classification, true);
});

it("guides the operator to the exact pending control, including unit and explicit review", async () => {
  vi.stubGlobal("fetch", vi.fn((url: string) => url.includes("mode=memory") ? json({ memory: null })
    : json({ catalog, results: [url.includes("kind=product") ? product : unit] })));
  await act(async () => root.render(<FiscalClassificationPicker {...props} />));
  expect(host.textContent).toContain("Siguiente paso: Selecciona qué estás facturando.");
  await act(async () => button("Ir al siguiente paso").click());
  expect(document.activeElement).toBe(host.querySelector("select"));
  await chooseNature();
  expect(host.textContent).toContain("Busca y selecciona el producto o servicio SAT.");
  await act(async () => buttons().filter(row => row.textContent === "Buscar")[0].click());
  await act(async () => button("43233205").click());
  expect(host.textContent).toContain("Siguiente paso: Busca y selecciona la Unidad SAT.");
  await act(async () => button("Ir al siguiente paso").click());
  expect(document.activeElement).toBe(host.querySelector('[data-catalog="unit"] input'));
  await act(async () => setInput(document.activeElement as HTMLInputElement, "E48"));
  await act(async () => buttons().filter(row => row.textContent === "Buscar")[1].click());
  await act(async () => button("E48").click());
  expect(host.textContent).toContain("Marca la casilla de revisión de las dos claves.");
  await act(async () => button("Ir al siguiente paso").click());
  expect(document.activeElement).toBe(host.querySelector('input[type="checkbox"]'));
  await act(async () => host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
  await act(async () => button("Ir al siguiente paso").click());
  expect(document.activeElement).toBe(button("Confirmar clasificación"));
  expect(change).not.toHaveBeenCalledWith(classification);
});
