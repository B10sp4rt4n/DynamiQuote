// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RecordiaContextPanel } from "./recordia-context-panel";
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
let root: Root, container: HTMLDivElement;
const fetchMock = vi.fn();
const item = { id: "note:a", title: "Nota comercial registrada", recorded_at_utc: "2026-11-16T06:00:00Z", description: "<script>private</script>",
  epistemic_status: "recorded_claim", context: {}, evidence_ids: ["cotiza:note:a"], source: { href: null } };
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset();
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
it("queries on demand through MCP and shows declared notes and CDMX/UTC without executing HTML", async () => {
  fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    return { ok: true, status: body.method === "notifications/initialized" ? 202 : 200,
      json: async () => ({ result: body.method === "initialize" ? { protocolVersion: "2025-11-25" } : { content: [{ type: "text", text: JSON.stringify({
        items: [item], next_offset: null, source_truncated: false, captured_at_utc: "2026-11-16T06:00:00Z", premium: true,
      }) }] } }) };
  });
  await act(async () => root.render(<RecordiaContextPanel tenantId="syn" opportunityId="opp" />));
  expect(fetchMock).not.toHaveBeenCalled();
  await act(async () => container.querySelector("button")!.click());
  expect(container.textContent).toContain("Premium · Piloto SynAppsSys");
  expect(container.textContent).toContain("Declaración registrada");
  expect(container.querySelector("script")).toBeNull();
  expect(container.querySelector("time")?.dateTime).toBe("2026-11-16T06:00:00Z");
  expect(fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body).method)).toEqual(["initialize", "notifications/initialized", "tools/call"]);
  expect(fetchMock.mock.calls.every(([, init]) => init.headers["X-Tenant-Context"] === "syn")).toBe(true);
  fetchMock.mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: "Piloto revocado" }) });
  await act(async () => container.querySelector("button")!.click());
  expect(container.querySelector('[role="alert"]')?.textContent).toBe("Piloto revocado");
  expect(container.textContent).not.toContain("<script>private</script>");
});
it("cancels an outstanding response when the panel is unmounted after a tenant change", async () => {
  fetchMock.mockImplementation(() => new Promise(() => {}));
  await act(async () => root.render(<RecordiaContextPanel tenantId="syn" opportunityId="opp" />));
  await act(async () => container.querySelector("button")!.click());
  const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
  await act(async () => root.render(<p>Otra empresa</p>));
  expect(signal.aborted).toBe(true);
});
