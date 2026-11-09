// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }));
import { TenantOperationPanel, type TenantOperationPanelProps } from "./tenant-operation-panel";
let root: Root, container: HTMLDivElement;
const props: TenantOperationPanelProps = { tenantId: "a", tenantName: "Empresa A", initialMode: "consultative",
  canConfigure: true, mercadoLibreEntitled: false, mercadoLibreAvailable: false };
const render = async (changes: Partial<TenantOperationPanelProps> = {}) => {
  await act(async () => root.render(<TenantOperationPanel key={changes.tenantId ?? "a"} {...props} {...changes} />));
};
beforeEach(async () => {
  vi.resetAllMocks(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container); await render();
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const modeButton = () => [...container.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Guardar modalidad")!;
const channelCheckbox = () => container.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
it("saves only the mode, preserves an unchecked channel, and binds the visible tenant", async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ mode: "mixed" }) }); vi.stubGlobal("fetch", fetch);
  await act(async () => container.querySelector<HTMLInputElement>('input[value="mixed"]')!.click());
  expect(channelCheckbox().checked).toBe(false);
  await act(async () => modeButton().click());
  expect(fetch).toHaveBeenCalledWith("/api/settings/tenant-operation", expect.objectContaining({
    headers: { "Content-Type": "application/json", "X-Tenant-Context": "a" }, body: JSON.stringify({ mode: "mixed" }),
  }));
  expect(channelCheckbox().checked).toBe(false); expect(modeButton().disabled).toBe(true);
  expect(container.textContent).toContain("guardada para Empresa A"); expect(refresh).toHaveBeenCalledOnce();
});
it("enables the channel without changing the selected operation mode", async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ enabled: true }) }); vi.stubGlobal("fetch", fetch);
  await act(async () => channelCheckbox().click());
  const button = [...container.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Guardar capacidades")!;
  await act(async () => button.click());
  expect(fetch).toHaveBeenCalledWith("/api/settings/tenant-capabilities", expect.objectContaining({
    body: JSON.stringify({ capabilityKey: "mercadolibre_channel", enabled: true }),
    headers: { "Content-Type": "application/json", "X-Tenant-Context": "a" },
  }));
  expect(container.querySelector<HTMLInputElement>('input[value="consultative"]')!.checked).toBe(true);
});
it("shows a failed save, allows retry, and never reports success", async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "La empresa activa cambió." }) }); vi.stubGlobal("fetch", fetch);
  await act(async () => container.querySelector<HTMLInputElement>('input[value="pos"]')!.click());
  await act(async () => modeButton().click());
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("empresa activa cambió");
  expect(modeButton().disabled).toBe(false); expect(refresh).not.toHaveBeenCalled();
});
it("keeps admin read-only and hides an unentitled channel", async () => {
  await render({ canConfigure: false });
  expect(container.querySelector('input[type="checkbox"]')).toBeNull();
  expect(container.querySelector("fieldset")?.disabled).toBe(true);
  expect(container.querySelector("a")).toBeNull(); expect(container.textContent).not.toContain("Mercado Libre");
});
it("opens a granted channel in any mode, only while the service is available", async () => {
  for (const initialMode of ["consultative", "pos", "mixed"] as const) {
    await render({ tenantId: initialMode, initialMode, canConfigure: false, mercadoLibreEntitled: true, mercadoLibreAvailable: true });
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/configuracion/integraciones/mercadolibre");
  }
  await render({ tenantId: "stopped", mercadoLibreEntitled: true, mercadoLibreAvailable: false });
  expect(container.querySelector("a")).toBeNull(); expect(container.textContent).toContain("puesta en servicio está pendiente");
});
