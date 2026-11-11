// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ProposalShell } from "./proposal-shell";
import type { ProposalListCounts } from "@/lib/db/proposals";
const m = vi.hoisted(() => ({ fetch: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: m.replace, refresh: m.refresh }), usePathname: () => "/propuestas", useSearchParams: () => new URLSearchParams("proposalId=p") }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }));
it("imports the saved quotation, reloads the proposal and displays the new cost without auto-authorization", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.stubGlobal("fetch", m.fetch);
  window.history.replaceState(null, "", "/propuestas?proposalId=p");
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
  let cost = 160;
  m.fetch.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/sync-quote")) { cost = 137.93; return { ok: true, json: async () => ({ result: "updated" }) }; }
    if (url === "/api/proposals/p") return { ok: true, json: async () => ({ quoteSyncToken: "a".repeat(64), proposal: { proposalId: "p", origin: "v1", status: "draft", formal: null,
      items: [{ itemNumber: 1, componentType: "product", costUnit: cost, priceUnit: 172.41, quantity: 1, description: "20 timbres", sku: "20PKTF", origin: "manual", status: "active" }],
      approvals: [], approvalGate: { canAuthorizeFinal: false, missingRoles: ["owner"] } } }) };
    if (url.startsWith("/api/commercial-context")) return { ok: true, json: async () => ({ context: null }) };
    throw new Error(`Unexpected request ${url} ${init?.method}`);
  });
  const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
  try {
    await act(async () => root.render(<ProposalShell canForceIssuance={false} counts={{} as ProposalListCounts} hasMore={false}
      initialBlockedMarginFilter={false} initialOutcomeFilter="all" initialStatusFilter="all" tenantName="Test"
      proposals={[{ createdAt: "2026-11-10T18:00Z", formal: null, origin: "v1", proposalId: "p", status: "draft" }]} />));
    await act(async () => { await new Promise(r => setTimeout(r, 20)); });
    const sync = [...container.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Actualizar desde cotización")!;
    expect(sync.disabled).toBe(false);
    await act(async () => sync.click());
    expect(confirm).toHaveBeenCalledOnce();
    const write = m.fetch.mock.calls.find(([url]) => url.endsWith("/sync-quote"))!;
    expect(JSON.parse(write[1].body)).toEqual({ expectedToken: "a".repeat(64) });
    expect([...container.querySelectorAll("input")].some(i => i.value === "137.93")).toBe(true);
    expect(container.textContent).toContain("Partidas actualizadas desde la cotización original");
    expect(m.fetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  } finally { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); }
});
