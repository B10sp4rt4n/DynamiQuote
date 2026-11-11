// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ProposalOutcomeActions } from "./proposal-outcome-actions";
const m = vi.hoisted(() => ({ refresh: vi.fn(), fetch: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: m.refresh }) }));
let root: Root; let container: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.stubGlobal("fetch", m.fetch);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  m.fetch.mockResolvedValue({ ok: true, json: async () => ({ outcome: "won", outcomeAt: "2026-10-29T06:00:00.000Z" }) });
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
async function render(admin: boolean) {
  await act(async () => root.render(<ProposalOutcomeActions canOverrideCloseDate={admin} proposalId="p1" status="approved"
    initialOutcome="won" initialOutcomeAt="2026-11-10T06:00:00.000Z" opportunityCreatedAt="2026-11-10T18:00Z" />));
  const button = [...container.querySelectorAll("button")].find(b => b.textContent === "Corregir fecha de cierre")!;
  await act(async () => button.click());
}
async function fill(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true })); element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
it("keeps the ordinary lower bound for sellers", async () => {
  await render(false);
  expect(container.querySelector('input[type="date"]')!.getAttribute("min")).toBe("2026-11-10");
  expect(container.querySelector('input[type="checkbox"]')).toBeNull();
});
it("requires opting in and a reason before submitting an historical close with its edit reference", async () => {
  await render(true);
  const date = container.querySelector<HTMLInputElement>('input[type="date"]')!;
  expect(date.min).toBe("2026-11-10");
  await act(async () => container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
  expect(date.hasAttribute("min")).toBe(false); expect(date.max).not.toBe("");
  const save = container.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  expect(save.disabled).toBe(true);
  await fill(date, "2026-10-29");
  await fill(container.querySelector("textarea")!, "Negocio registrado posteriormente");
  expect(save.disabled).toBe(false);
  await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(JSON.parse(m.fetch.mock.calls[0][1].body)).toEqual({ outcome: "won", closedOn: "2026-10-29",
    expectedOutcome: "won", expectedOutcomeAt: "2026-11-10T06:00:00.000Z", closeDateOverrideReason: "Negocio registrado posteriormente" });
  expect(m.refresh).toHaveBeenCalledOnce();
});
it("restores the lower bound when the administrator turns the exception off", async () => {
  await render(true); const checkbox = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
  await act(async () => checkbox.click()); await act(async () => checkbox.click());
  expect(container.querySelector<HTMLInputElement>('input[type="date"]')!.min).toBe("2026-11-10");
  expect(container.querySelector("textarea")).toBeNull();
});
