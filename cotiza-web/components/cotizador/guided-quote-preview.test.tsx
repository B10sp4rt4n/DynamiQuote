// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GuidedQuotePreview } from "./guided-quote-preview";
import type { EditableQuoteLine } from "@/lib/db/quote-editor";
let root: Root, container: HTMLDivElement;
const lines: EditableQuoteLine[] = [
  { lineId: "base", sku: "BASE", description: "Base", quantity: 2, costUnit: 80, priceUnit: 100, marginPct: 20, classification1: "product", classification2: "" },
  { lineId: "email", sku: "EMAIL", description: "Buzones", quantity: 100, costUnit: 30, priceUnit: 40, marginPct: 25, classification1: "product", classification2: "" },
];
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Simulation must not write or send requests"); }));
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(<GuidedQuotePreview lines={lines} asOf="2026-10-26" minMarginPct={19} sourceQuoteId="quote-1" />));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
it("compares saved values immediately without blank prices, source capture or requests", async () => {
  expect([...container.querySelectorAll("fieldset input")].filter(i => (i as HTMLInputElement).value === "EMAIL")).toHaveLength(3);
  await act(async () => (container.querySelector("button") as HTMLButtonElement).click());
  expect(container.textContent).toContain("Resultado de la comparación");
  expect(container.textContent).toContain("$4,200.00");
  expect(container.textContent).toContain("sin validar vigencia");
  expect(fetch).not.toHaveBeenCalled();
});
it("discards results and starts from the newly selected saved product", async () => {
  await act(async () => (container.querySelector("button") as HTMLButtonElement).click());
  await act(async () => { const select = container.querySelector("select")!; select.value = "base"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(container.textContent).not.toContain("Resultado de la comparación");
  expect([...container.querySelectorAll("fieldset input")].filter(i => (i as HTMLInputElement).value === "BASE")).toHaveLength(3);
});
it("requires a valid source when a new price reference is selected", async () => {
  await act(async () => { const select = container.querySelectorAll("select")[1]; select.value = "reference"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  await act(async () => (container.querySelector("button") as HTMLButtonElement).click());
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Completa la referencia");
  expect(container.textContent).not.toContain("Resultado de la comparación");
});
