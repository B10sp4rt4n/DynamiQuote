// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }));
import { ExpiryAlertsBell } from "./expiry-alerts-bell";
const m = vi.hoisted(() => ({ fetch: vi.fn() }));
let root: Root, host: HTMLDivElement;
const notice = { key: "internal:p1", proposalId: "p1", proposalNumber: "PROP-TEST", recipientCompany: "Cliente sintético", kind: "internal", requirements: ["Autorización del owner"], href: "/propuestas?proposalId=p1" };
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.stubGlobal("fetch", m.fetch); vi.clearAllMocks();
  m.fetch.mockResolvedValue({ ok: true, json: async () => ({ tenantId: "a", alerts: [], unlabeled: [], approvalNotices: [notice] }) });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
it("shows an approval badge and the exact actionable link, without recording an approval", async () => {
  await act(async () => root.render(<ExpiryAlertsBell tenantId="a" />));
  const bell = host.querySelector("button")!; expect(bell.getAttribute("aria-label")).toContain("1 solicitudes de aprobación");
  await act(async () => bell.click()); expect(host.textContent).toContain("PROP-TEST");
  expect(host.querySelector('a[href="/propuestas?proposalId=p1"]')).not.toBeNull();
  expect(m.fetch).toHaveBeenCalledWith("/api/proposals/expiring-alerts", expect.objectContaining({ cache: "no-store", headers: { "X-Tenant-Context": "a" } }));
});
it("refreshes after a decision and on focus, removing resolved requests without duplicate alerts", async () => {
  await act(async () => root.render(<ExpiryAlertsBell tenantId="a" />));
  m.fetch.mockResolvedValue({ ok: true, json: async () => ({ tenantId: "a", alerts: [], unlabeled: [], approvalNotices: [] }) });
  await act(async () => window.dispatchEvent(new Event("cotiza:approval-requests-changed")));
  expect(host.querySelector("button")!.getAttribute("aria-label")).toBe("Notificaciones");
  await act(async () => window.dispatchEvent(new Event("focus"))); expect(m.fetch).toHaveBeenCalledTimes(3);
});
it("rejects a response from another tenant and makes retrieval failures visible", async () => {
  m.fetch.mockResolvedValue({ ok: true, json: async () => ({ tenantId: "b", approvalNotices: [notice] }) });
  await act(async () => root.render(<ExpiryAlertsBell tenantId="a" />)); await act(async () => host.querySelector("button")!.click());
  expect(host.textContent).not.toContain("PROP-TEST"); expect(host.querySelector('[role="alert"]')?.textContent).toContain("No se pudieron");
});
