// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CrmWorkspace } from "./crm-workspace";
import type { ClientSummary } from "@/lib/db/clients";
vi.mock("@/components/configuracion/client-shell", () => ({ ClientShell: () => <div>Existing client workflow</div> }));
const m = vi.hoisted(() => ({ pipeline: vi.fn() }));
vi.mock("@/components/pipeline/pipeline-dashboard", () => ({ PipelineDashboard: (props: unknown) => { m.pipeline(props); return <div>Existing opportunity workflow</div>; } }));
vi.mock("@/components/inicio/pending-tasks-panel", () => ({ PendingTasksPanel: () => <div>Existing pending tasks</div> }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }));
let root: Root, container: HTMLDivElement;
beforeEach(async () => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = document.createElement("div"); document.body.append(container); root = createRoot(container); await act(async () => root.render(<CrmWorkspace canSeeAll tenantName="Sys" viewerUserId="u1" clients={[{ clientId:"c1",company:"HL INNOVACIÓN DIGITAL" } as ClientSummary]} opportunities={[]} tasks={[]} clientLogos={[]} vendors={[]} />)); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
it("opens today's real-data workspace and links to the selected client record", () => {
  expect(container.textContent).toContain("Existing pending tasks"); expect(container.querySelector('a[href="/clientes/c1"]')).not.toBeNull(); expect(container.querySelector('a[href="/cotizaciones"]')).not.toBeNull();
});
it("takes the next-step shortcut to the existing client/task flow", async () => {
  const next = [...container.querySelectorAll("button")].find(b => b.textContent === "Registrar próximo paso")!;
  await act(async () => next.click()); expect(container.textContent).toContain("Existing client workflow"); expect(container.textContent).toContain("pulsa Tarea"); expect(container.textContent).not.toContain("Existing pending tasks");
});
it("opens opportunities without changing their workflow", async () => {
  const next = [...container.querySelectorAll("button")].find(b => b.textContent === "Oportunidades")!;
  await act(async () => next.click()); expect(container.textContent).toContain("Existing opportunity workflow");
});

it("gives the seller an own-opportunity workspace without catalog or vendor navigation", async () => {
  await act(async () => root.render(<CrmWorkspace canSeeAll={false} tenantName="Sys" viewerUserId="seller" clients={[]} opportunities={[]} tasks={[]} clientLogos={[]} vendors={[]} />));
  expect(container.textContent).toContain("Aquí ves tus oportunidades y pendientes");
  expect(container.textContent).not.toContain("Clientes y seguimiento"); expect(container.textContent).not.toContain("Registrar próximo paso");
  expect(container.querySelector('a[href^="/clientes/"]')).toBeNull();
  const next = [...container.querySelectorAll("button")].find(b => b.textContent === "Ver mis oportunidades")!;
  await act(async () => next.click());
  expect(m.pipeline).toHaveBeenLastCalledWith(expect.objectContaining({ canSeeAll: false, linkClients: false, viewerUserId: "seller", vendors: [] }));
});
