// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ path: "/oportunidades/example" }));
vi.mock("next/navigation", () => ({ usePathname: () => state.path }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }));
import { DashboardNav } from "./dashboard-nav";
let root: Root, container: HTMLDivElement;
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.path = "/oportunidades/example";
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(<DashboardNav />));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
it("keeps a nested opportunity in Comercial and closes the mobile menu on selection", async () => {
  const toggle = container.querySelector("button")!;
  expect(toggle.textContent).toContain("Menú · Oportunidades");
  expect(container.querySelector('[aria-current="location"]')?.textContent).toBe("Comercial");
  expect(container.querySelector('[aria-current="page"]')?.textContent).toBe("Oportunidades");
  await act(async () => toggle.click());
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  const link = container.querySelector<HTMLAnchorElement>('a[href="/cotizaciones"]')!;
  link.addEventListener("click", event => event.preventDefault());
  await act(async () => link.click());
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  expect(container.querySelector("#dashboard-primary-navigation")).not.toBeNull();
});
it("shows areas only when their capabilities and role permit them", async () => {
  const areas = () => [...container.querySelectorAll('nav[aria-label="Áreas de CDC Suite"] a')].map(a => a.textContent);
  expect(areas()).toEqual(["Inicio", "Comercial", "Inteligencia"]);
  await act(async () => root.render(<DashboardNav fiscalEnabled canAdminister />));
  expect(areas()).toEqual(["Inicio", "Comercial", "Fiscal", "Inteligencia", "Administración"]);
  await act(async () => root.render(<DashboardNav />));
  expect(areas()).toEqual(["Inicio", "Comercial", "Inteligencia"]);
});
it("resolves KPIs before the general proposals path and clients before configuration", async () => {
  for (const [path, label, area] of [["/propuestas/kpis", "KPIs comerciales", "Inteligencia"], ["/clientes/123", "Clientes", "Comercial"], ["/configuracion/clientes", "Clientes", "Comercial"]]) {
    state.path = path;
    await act(async () => root.render(<DashboardNav canAdminister />));
    expect(container.querySelector('[aria-current="page"]')?.textContent).toBe(label);
    expect(container.querySelector('[aria-current="location"]')?.textContent).toBe(area);
  }
});
it("preserves optional procurement and CRM navigation", async () => {
  expect(container.querySelector('a[href="/compras"]')).toBeNull();
  await act(async () => root.render(<DashboardNav procurementEnabled crmWorkspaceEnabled />));
  expect(container.querySelector('a[href="/compras"]')?.textContent).toBe("Compras");
  expect(container.querySelector('a[href="/crm"]')?.textContent).toBe("CRM · Piloto");
});
it("keeps fiscal configuration within Fiscal when the connection is enabled", async () => {
  state.path = "/configuracion/facturacion";
  await act(async () => root.render(<DashboardNav fiscalEnabled canAdminister />));
  expect(container.querySelector('[aria-current="location"]')?.textContent).toBe("Fiscal");
  expect(container.querySelector('[aria-current="page"]')?.textContent).toBe("Documentos por propuesta");
});
