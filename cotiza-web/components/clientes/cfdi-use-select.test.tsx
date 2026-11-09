// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CfdiUseSelect } from "./cfdi-use-select";

let root: Root, container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const props = { value: "", rfc: "AAA010101AAA", regime: "601", onChange: vi.fn() };

it("shows descriptions and all 24 catalog entries on request, disabling invalid and special choices", async () => {
  const change = vi.fn();
  await act(async () => root.render(<CfdiUseSelect {...props} onChange={change} />));
  expect(container.querySelector('option[value="G03"]')?.textContent).toContain("Gastos en general");
  expect(container.querySelector('option[value="D01"]')).toBeNull();
  await act(async () => container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
  expect(container.querySelectorAll("option")).toHaveLength(25); // 24 codes plus pending.
  for (const code of ["D01", "CP01", "CN01"]) expect(container.querySelector<HTMLOptionElement>(`option[value="${code}"]`)!.disabled).toBe(true);
  const select = container.querySelector("select")!;
  await act(async () => { select.value = "G03"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(change).toHaveBeenCalledWith("G03");
});

it("keeps a selected value visible and flags it after changing regime without silently replacing it", async () => {
  await act(async () => root.render(<CfdiUseSelect {...props} value="G03" />));
  await act(async () => root.render(<CfdiUseSelect {...props} value="G03" regime="616" rfc="AAAA010101AAA" />));
  expect(container.querySelector("select")!.value).toBe("G03");
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("no corresponde");
  expect(container.querySelector<HTMLOptionElement>('option[value="G03"]')!.disabled).toBe(true);
});

it("preserves a legacy code so editing never disguises it as a blank value", async () => {
  await act(async () => root.render(<CfdiUseSelect {...props} value="P01" />));
  expect(container.querySelector("select")!.value).toBe("P01");
  expect(container.textContent).toContain("P01 — Revisar uso guardado");
  expect(container.textContent).toContain("no está en el catálogo CFDI 4.0");
});
