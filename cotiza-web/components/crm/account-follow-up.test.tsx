// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ClientSummary } from "@/lib/db/clients";
import type { OpportunityWithStage } from "@/lib/db/opportunities";
import { AccountFollowUp } from "./account-follow-up";
const m = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: m.refresh }) }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }));
const clients = [{ clientId: "won", company: "ALFREDO VALDÉZ" }, ...Array.from({ length: 7 }, (_, i) => ({ clientId: `open-${i}`, company: `Cuenta ${i}` }))] as ClientSummary[];
const opportunities = clients.map(client => ({ opportunityId: `opp-${client.clientId}`, opportunityNumber: `OPP-${client.clientId}`, clientId: client.clientId,
  title: `Negocio ${client.company}`, stage: client.clientId === "won" ? "won" : "open", createdAt: "2026-11-01T06:00:00Z", closedAt: client.clientId === "won" ? "2026-11-20T06:00:00Z" : null,
  expectedCloseDate: null })) as OpportunityWithStage[];
let root: Root, container: HTMLDivElement;
async function render(data = opportunities) { await act(async () => root.render(<AccountFollowUp clients={clients} opportunities={data} tasks={[]}
  today="2026-11-22" asOf="2026-11-22T23:30:00Z" />)); }
async function click(text: string) { await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === text)!.click()); }
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
it("starts with actionable accounts, exposes all six-plus results and shows actual won closures on demand", async () => {
  await render(); expect(container.querySelectorAll("article")).toHaveLength(6);
  expect(container.textContent).not.toContain("ALFREDO VALDÉZ"); expect(container.textContent).toContain("Por atender (7)");
  await click("Ver más cuentas"); expect(container.querySelectorAll("article")).toHaveLength(7);
  await click("Ganadas (1)"); expect(container.querySelectorAll("article")).toHaveLength(1);
  expect(container.textContent).toContain("ALFREDO VALDÉZ"); expect(container.textContent).toContain("0 abiertas · 1 ganada · 0 tareas pendientes");
  expect(container.querySelector('a[href="/oportunidades/opp-won"]')!.textContent).toBe("Ver cierre");
  expect(container.textContent).not.toContain("Continuar oportunidad");
});
it("searches accounts without accents and has an explicit empty state for a won-only search in Por atender", async () => {
  await render(); const input = container.querySelector("input")!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "valdez"); input.dispatchEvent(new Event("input", { bubbles: true })); });
  expect(container.querySelectorAll("article")).toHaveLength(0); expect(container.textContent).toContain("Consulta los cierres en Ganadas");
  await click("Ganadas (1)"); expect(container.querySelectorAll("article")).toHaveLength(1);
});
it("refreshes from the server and removes an opportunity from open follow-up when new props report it won", async () => {
  await render(); await click("Actualizar cuentas"); expect(m.refresh).toHaveBeenCalledOnce();
  await render(opportunities.map(opportunity => ({ ...opportunity, stage: "won", closedAt: "2026-11-22T06:00:00Z" })));
  expect(container.querySelectorAll("article")).toHaveLength(0); expect(container.textContent).toContain("Ganadas (8)");
  await click("Ganadas (8)"); expect(container.querySelectorAll("article")).toHaveLength(6);
  expect(container.textContent).not.toContain("Continuar oportunidad");
});
