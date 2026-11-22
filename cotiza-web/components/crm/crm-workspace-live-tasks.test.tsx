// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ClientSummary } from "@/lib/db/clients";
import type { OpportunityWithStage } from "@/lib/db/opportunities";
import { CrmWorkspace } from "./crm-workspace";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }));
vi.mock("@/components/configuracion/client-shell", () => ({ ClientShell: () => null }));
vi.mock("@/components/pipeline/pipeline-dashboard", () => ({ PipelineDashboard: () => null }));
let root: Root, container: HTMLDivElement;
const fetcher = vi.fn();
beforeEach(async () => {
  vi.clearAllMocks(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.stubGlobal("fetch", fetcher);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(<CrmWorkspace tenantName="Sys" viewerUserId="u1" today="2026-11-22" asOf="2026-11-22T23:30:00Z"
    clients={[{ clientId: "won", company: "Ganada con entrega" } as ClientSummary]} clientLogos={[]} vendors={[]}
    opportunities={[{ clientId: "won", opportunityId: "opp-won", opportunityNumber: "OPP-1", title: "Venta registrada", stage: "won",
      createdAt: "2026-11-01T06:00:00Z", closedAt: "2026-11-20T06:00:00Z", expectedCloseDate: null } as OpportunityWithStage]}
    tasks={[{ clientId: "won", clientCompany: "Ganada con entrega", taskId: "task-won", description: "Confirmar entrega", dueDate: "2026-11-21T00:00:00Z",
      opportunityId: "opp-won", opportunityNumber: "OPP-1" }]} />));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
async function complete() { await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === "Marcar hecha")!.click()); }
it("removes a won account from Por atender as soon as its last post-sale task is successfully completed", async () => {
  expect(container.querySelectorAll("article")).toHaveLength(1); expect(container.textContent).toContain("0 abiertas · 1 ganada · 1 tarea pendiente");
  fetcher.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }); await complete();
  expect(fetcher).toHaveBeenCalledExactlyOnceWith("/api/tasks/task-won", { method: "PATCH" });
  expect(container.querySelectorAll("article")).toHaveLength(0); expect(container.textContent).toContain("Por atender (0)");
  expect(container.textContent).toContain("Ganadas (1)"); expect(container.textContent).toContain("No tienes tareas pendientes");
});
it("retains the actual pending follow-up when task completion fails", async () => {
  fetcher.mockResolvedValue({ ok: false, json: async () => ({ error: "No se pudo completar la tarea" }) }); await complete();
  expect(container.querySelectorAll("article")).toHaveLength(1); expect(container.textContent).toContain("Por atender (1)");
  expect(container.textContent).toContain("No se pudo completar la tarea");
});
