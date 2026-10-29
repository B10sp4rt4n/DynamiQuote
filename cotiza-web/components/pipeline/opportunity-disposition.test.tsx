// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { OpportunityDispositionControl } from "./opportunity-disposition";
import type { OpportunityWithStage } from "@/lib/db/opportunities";
const m = vi.hoisted(() => ({ refresh: vi.fn(), fetch: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: m.refresh }) }));
let root: Root, container: HTMLDivElement;
const originalShowModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");
// jsdom has no native modal top layer. Real viewport/focus behavior is checked
// in the browser; this shim exercises our open, submit and cancel handlers.
const showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute("open", ""); });
const closeDialog = vi.fn(function (this: HTMLDialogElement) { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); });
const opp: OpportunityWithStage = { opportunityId: "fixture", opportunityNumber: "OPP-X", title: "Test", stage: "open", amount: 100,
  clientCompany: "Test", clientId: "c", createdAt: "2026-01-01", closedAt: null, lifetimeDays: 1, expectedCloseDate: null, ownerUserId: "seller" };
function button(text: string) { return [...container.querySelectorAll("button")].find(b => b.textContent === text)!; }
async function click(text: string) { await act(async () => button(text).click()); }
async function change(selector: string, value: string) {
  const element = container.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  await act(async () => { const prototype = element.tagName === "SELECT" ? HTMLSelectElement.prototype : element.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event(element.tagName === "SELECT" ? "change" : "input", { bubbles: true })); });
}
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.stubGlobal("fetch", m.fetch);
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: showModal });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: closeDialog });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  m.fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals();
  if (originalShowModal) Object.defineProperty(HTMLDialogElement.prototype, "showModal", originalShowModal);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  if (originalClose) Object.defineProperty(HTMLDialogElement.prototype, "close", originalClose);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, "close"); });
it("requires only a reason for no decision and sends the opportunity revision without caller identity", async () => {
  await act(async () => root.render(<OpportunityDispositionControl opportunity={opp} canManage />));
  await click("Descartar"); expect(button("Guardar estado").disabled).toBe(true);
  expect(container.querySelector('input[type="date"]')).toBeNull();
  await change("textarea", "No se autorizó el proyecto"); await click("Guardar estado");
  expect(JSON.parse(m.fetch.mock.calls[0][1].body)).toEqual({ state: "no_decision", reason: "No se autorizó el proyecto", revision: 0 });
  expect(m.refresh).toHaveBeenCalledOnce();
});
it("requires a date only for pause and presents the reminder behavior", async () => {
  await act(async () => root.render(<OpportunityDispositionControl opportunity={opp} canManage />));
  await click("Descartar"); await change("select", "paused"); await change("textarea", "Revisar presupuesto");
  expect(button("Guardar estado").disabled).toBe(true);
  expect(container.textContent).toContain("Se crea un recordatorio");
  await change('input[type="date"]', "2099-01-01"); await click("Guardar estado");
  expect(JSON.parse(m.fetch.mock.calls[0][1].body).resumeOn).toBe("2099-01-01");
});
it("offers no action to unauthorized viewers or for an actual winning decision", async () => {
  await act(async () => root.render(<OpportunityDispositionControl opportunity={opp} canManage={false} />)); expect(container.querySelector("button")).toBeNull();
  await act(async () => root.render(<OpportunityDispositionControl opportunity={{ ...opp, stage: "won" }} canManage />)); expect(container.querySelector("button")).toBeNull(); expect(m.fetch).not.toHaveBeenCalled();
});
it("keeps the form and shows an error after a stale write instead of pretending success", async () => {
  m.fetch.mockResolvedValue({ ok: false, json: async () => ({ error: "La oportunidad cambió" }) });
  await act(async () => root.render(<OpportunityDispositionControl opportunity={opp} canManage />));
  await click("Descartar"); await change("textarea", "No avanzó"); await click("Guardar estado");
  expect(container.querySelector('[role="alert"]')!.textContent).toBe("La oportunidad cambió");
  expect(container.querySelector("textarea")).not.toBeNull(); expect(m.refresh).not.toHaveBeenCalled();
});

it("opens a labeled modal and cancels without writing or retaining the previous reason", async () => {
  await act(async () => root.render(<OpportunityDispositionControl opportunity={opp} canManage />));
  expect(container.querySelector("dialog")!.open).toBe(false);
  await click("Descartar");
  expect(showModal).toHaveBeenCalledOnce();
  const dialog = container.querySelector("dialog")!;
  expect(dialog.open).toBe(true);
  expect(document.getElementById(dialog.getAttribute("aria-labelledby")!)!.textContent).toBe("Descartar oportunidad");
  expect(document.getElementById(dialog.getAttribute("aria-describedby")!)!.textContent).toContain("OPP-X");
  await change("textarea", "Un motivo que no se guarda"); await click("Cancelar");
  expect(dialog.open).toBe(false); expect(m.fetch).not.toHaveBeenCalled();
  await click("Descartar"); expect((container.querySelector("textarea") as HTMLTextAreaElement).value).toBe("");
});
