// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { InvoiceNumberingPanel } from "./invoice-numbering-panel";
let root: Root, container: HTMLDivElement;
const initial = { available: true, year: 2026, policy: null };
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = document.createElement("div");
  document.body.append(container); root = createRoot(container);
  await act(async () => root.render(<InvoiceNumberingPanel tenantId="a" tenantName="Empresa A" initial={initial} />));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const submit = () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
it("shows estimated folios without a network call and gates annual reset on year", async () => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  expect(container.textContent).toContain("FAC-2026-000001");
  const [year, reset] = container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
  await act(async () => reset.click()); expect(reset.checked).toBe(true);
  await act(async () => year.click()); expect(reset.checked).toBe(false); expect(reset.disabled).toBe(true);
  expect(container.textContent).toContain("FAC-000001"); expect(fetch).not.toHaveBeenCalled();
});
it("saves the previewed policy for the active tenant and shows the confirmed result", async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ available: true, year: 2026, policy: {
    prefix: "FAC", include_year: true, reset_annually: false, digits: 6, next_number: 1, revision: 1,
    series: "FAC-2026", year: 2026, examples: ["FAC-2026-000001"] } }) });
  vi.stubGlobal("fetch", fetch); await act(async () => { submit(); });
  expect(fetch).toHaveBeenCalledWith("/api/settings/invoice-numbering", expect.objectContaining({
    headers: { "Content-Type": "application/json", "X-Tenant-Context": "a" },
    body: JSON.stringify({ prefix: "FAC", include_year: true, reset_annually: false, digits: 6, next_number: 1, expected_revision: 0 }) }));
  expect(container.querySelector('[role="status"]')?.textContent).toContain("Numeración guardada para Empresa A");
});
it("requires refresh after conflict or uncertain save and never shows false success", async () => {
  const fetch = vi.fn().mockRejectedValue(new Error("Resultado incierto")); vi.stubGlobal("fetch", fetch);
  await act(async () => { submit(); }); expect(container.querySelector('[role="alert"]')?.textContent).toContain("Resultado incierto");
  expect(container.querySelector('[role="status"]')).toBeNull(); expect(container.querySelector("a")?.textContent).toContain("Recargar");
  await act(async () => { submit(); }); expect(fetch).toHaveBeenCalledOnce();
});
it("resets values when the active tenant changes and hides the form if unavailable", async () => {
  await act(async () => root.render(<InvoiceNumberingPanel key="b" tenantId="b" tenantName="Empresa B" initial={{ available: false, year: 2026, policy: null }} />));
  expect(container.querySelector("form")).toBeNull(); expect(container.textContent).toContain("Empresa B");
});
