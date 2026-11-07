// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ usePathname: () => "/oportunidades/example" }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }));
import { DashboardNav } from "./dashboard-nav";
let root: Root, container: HTMLDivElement;
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(<DashboardNav />));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
it("names the current section and opens and closes the compact menu", async () => {
  const toggle = container.querySelector("button")!;
  expect(toggle.textContent).toContain("Menú · Oportunidades");
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  expect(container.querySelector('[aria-current="page"]')?.textContent).toBe("Oportunidades");
  await act(async () => toggle.click());
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  expect(container.querySelector("nav")?.id).toBe(toggle.getAttribute("aria-controls"));
  await act(async () => toggle.click());
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
});
it("closes after choosing a section while preserving commercial order and the change disclosure", async () => {
  const toggle = container.querySelector("button")!;
  await act(async () => toggle.click());
  const link = container.querySelector<HTMLAnchorElement>('nav a[href="/cotizaciones"]')!;
  link.addEventListener("click", event => event.preventDefault());
  await act(async () => link.click());
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  expect([...container.querySelectorAll("nav a")].map(a => a.textContent)).toEqual(["Inicio", "Clientes", "Oportunidades", "Cotizaciones", "Propuestas", "KPIs", "Paquetes", "Configuración"]);
  expect(container.querySelector("summary")?.textContent).toContain("Actualizamos el orden del menú");
});
