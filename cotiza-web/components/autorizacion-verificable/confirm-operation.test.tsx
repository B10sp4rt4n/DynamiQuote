// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ auth: { isLoaded: true, isSignedIn: true, userId: "user_owner" as string | null }, assertion: vi.fn() }));
vi.mock("@clerk/nextjs", () => ({ useAuth: () => m.auth, SignInButton: ({ children }: { children: React.ReactNode }) => children, UserButton: () => <span>Cuenta</span> }));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock("@simplewebauthn/browser", () => ({ startAuthentication: m.assertion }));
import { ConfirmOperation } from "./confirm-operation";
import { clearApprovalToken } from "./use-approval-token";
const id = "c80cb83e-5aa7-4ff7-8fa7-42aedeb91ce2", token = "A".repeat(43);
const row = { id, kind: "purchase", state: "pending", expiresAt: "2026-11-16T12:10:00Z", payloadHash: "hash", snapshot: { tenantId: "syn-test", tenantName: "SynAppsSys", policy: "test", credentialPolicy: "singleDevice", simulated: true,
  input: { kind: "purchase", approverUserId: "user_owner", purchase: { folio: "SYN-001", vendor: "Proveedor de ensayo", description: "Prueba", amount: "1250.00", currency: "MXN" } } } };
let host: HTMLDivElement, root: Root;
const fetcher = vi.fn();
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks(); m.auth.isSignedIn = true; m.auth.userId = "user_owner";
  sessionStorage.clear(); clearApprovalToken(id); history.replaceState(null, "", `/confirmar-autorizacion/${id}#${token}`);
  vi.stubGlobal("fetch", fetcher); fetcher.mockResolvedValue(json(row));
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
async function render() { await act(async () => { root.render(<ConfirmOperation id={id} />); await new Promise(r => setTimeout(r, 10)); }); }
it("opens directly on mobile, removes the URL secret and displays the exact purchase", async () => {
  await render();
  expect(window.location.hash).toBe(""); expect(host.textContent).toContain("1250.00 MXN"); expect(host.textContent).toContain("Proveedor de ensayo");
  expect(host.querySelector("img")).toBeNull();
  expect(fetcher.mock.calls[0][1].headers["X-Approval-Token"]).toBe(token);
});
it("keeps details private before sign-in and preserves the return token in the tab", async () => {
  m.auth.isSignedIn = false; m.auth.userId = null; await render();
  expect(fetcher).not.toHaveBeenCalled(); expect(host.textContent).toContain("Iniciar sesión"); expect(host.textContent).not.toContain("1250.00");
  expect(sessionStorage.getItem(`cotiza-approval:${id}`)).toContain(token);
});
it("does not disclose details when the server rejects the account", async () => {
  fetcher.mockResolvedValue(json({ error: "Cuenta destinataria incorrecta" }, 403)); await render();
  expect(host.textContent).toContain("Cuenta destinataria incorrecta"); expect(host.textContent).not.toContain("1250.00");
});
it("requires an explicit click and a cryptographic assertion before confirmation", async () => {
  await render(); expect(m.assertion).not.toHaveBeenCalled();
  fetcher.mockImplementation(async (url: string) => url.endsWith("/options") ? json({ options: { challenge: "test" }, challengeId: "challenge" }) : json({ ...row, state: "approved" }));
  m.assertion.mockResolvedValue({ id: "credential" });
  await act(async () => { Array.from(host.querySelectorAll("button")).find(b => b.textContent === "Autorizar ensayo")!.click(); await new Promise(r => setTimeout(r, 10)); });
  expect(m.assertion).toHaveBeenCalledOnce(); expect(host.textContent).toContain("Autorización recibida");
  const confirm = fetcher.mock.calls.find(c => String(c[0]).endsWith("/confirm"));
  expect(JSON.parse(confirm![1].body)).toMatchObject({ token, challengeId: "challenge", response: { id: "credential" } });
  expect(sessionStorage.getItem(`cotiza-approval:${id}`)).toBeNull();
});
it("does not fetch or approve a request without its link token", async () => {
  history.replaceState(null, "", `/confirmar-autorizacion/${id}`); await render();
  expect(fetcher).not.toHaveBeenCalled(); expect(host.textContent).toContain("enlace original");
});
