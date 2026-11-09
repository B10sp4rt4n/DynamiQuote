// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MercadoLibreInbox } from "./mercadolibre-inbox";
vi.mock("next/link", () => ({ default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => <a href={href} className={className}>{children}</a> }));
const initial = { connection: { sellerId: "123", nickname: "Synthetic seller", status: "connected" as const, lastSyncAt: null }, sales: [], total: 0 };
let root: Root, container: HTMLDivElement;
const fetchMock = vi.fn();
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset();
  container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const button = (text: string) => [...container.querySelectorAll("button")].find(b => b.textContent === text)!;
it("makes missing configuration actionable and does not offer fiscal actions", async () => {
  await act(async () => root.render(<MercadoLibreInbox initial={{ ...initial, connection: null }} ready={false} tenantName="Empresa A" />));
  expect(button("Conectar Mercado Libre").disabled).toBe(true); expect(button("Consultar ventas recientes").disabled).toBe(true);
  expect(container.textContent).toContain("Falta completar la configuración"); expect(container.textContent).not.toContain("Timbrar");
});
it("sends only one import on double click and displays new/updated counts", async () => {
  fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => ({ ok: true,
    json: async () => init?.method === "POST" ? { inserted: 1, updated: 0, unchanged: 0, total: 51, nextOffset: 50 } : { ...initial, total: 1 } }));
  await act(async () => root.render(<MercadoLibreInbox initial={initial} ready tenantName="Empresa A" />));
  await act(async () => { button("Consultar ventas recientes").click(); button("Consultar ventas recientes").click(); });
  expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  expect(container.textContent).toContain("1 nuevas"); expect(button("Importar siguientes 50")).toBeDefined();
});
it("requires a separate confirmation to disconnect and keeps the imported history visible", async () => {
  fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => ({ ok: true, json: async () => init?.method === "POST" ? { disconnected: true }
    : { ...initial, connection: { ...initial.connection, status: "disconnected" } } }));
  await act(async () => root.render(<MercadoLibreInbox initial={initial} ready tenantName="Empresa A" />));
  await act(async () => button("Desconectar cuenta").click()); expect(fetchMock).not.toHaveBeenCalled();
  await act(async () => button("Confirmar desconexión").click());
  expect(container.textContent).toContain("Se conserva el historial"); expect(button("Consultar ventas recientes").disabled).toBe(true);
});
