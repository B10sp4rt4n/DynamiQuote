import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { LoomMcp } from "./mcp";
import { parseLoomPage, readLoomSnapshot } from "./client";
const id = "a".repeat(32), cloudId = "9061827c-eca4-4635-819e-8a2927a7c7ee", url = "https://www.loom.com/share/" + id;
const object = (content: unknown = [{ component: "transcript", status: "READY", payload: { content: "[0:01] Prueba", totalCharacters: 13 } }]) =>
  ({ status: "OK", ari: "ari:cloud:loom:" + cloudId + ":video/activation/workspace/" + id, title: "Video sintético", type: "ASYNC_VIDEO", createdAt: "2026-11-10T18:00:00Z", durationSeconds: 20, content });
const result = (item: unknown) => ({ content: [{ type: "text", text: JSON.stringify({ data: { items: [item] } }) }] });
const rpc = (id: number, value: unknown) => Response.json({ jsonrpc: "2.0", id, result: value });
beforeEach(() => {
  vi.stubEnv("COTIZA_LOOM_TENANT_ID", "one"); vi.stubEnv("COTIZA_LOOM_CLOUD_ID", cloudId);
  vi.stubEnv("COTIZA_LOOM_EMAIL", "reader@example.test"); vi.stubEnv("COTIZA_LOOM_API_TOKEN", "synthetic-only-private");
  vi.stubEnv("COTIZA_LOOM_PREVIEW_KEY", "ab".repeat(32)); vi.stubEnv("COTIZA_LOOM_APP_ORIGIN", "https://cotiza.test");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
function fixture() {
  return vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(JSON.stringify({ jsonrpc: "2.0", id: 1,
    result: { protocolVersion: "2025-11-25", capabilities: { tools: {} } } }), { headers: { "content-type": "application/json", "mcp-session-id": "session-synthetic" } }))
    .mockResolvedValueOnce(new Response(null, { status: 202 }));
}
it("initializes, propagates protocol/session, calls only the read tool and closes the session", async () => {
  const fetcher = fixture().mockResolvedValueOnce(rpc(2, result(object()))).mockResolvedValueOnce(new Response(null, { status: 204 }));
  const mcp = new LoomMcp("Basic private", fetcher);
  await mcp.read(cloudId, url); await mcp.close();
  const bodies = fetcher.mock.calls.slice(0, 3).map(c => JSON.parse(String(c[1]?.body)));
  expect(bodies.map(x => x.method)).toEqual(["initialize", "notifications/initialized", "tools/call"]);
  expect(bodies[2].params).toEqual({ name: "getLoomObjectsContent", arguments: { cloudId, identifiers: [url], expand: ["transcript"] } });
  expect(fetcher.mock.calls[2]![1]!.headers).toMatchObject({ "Mcp-Session-Id": "session-synthetic", "MCP-Protocol-Version": "2025-11-25" });
  expect(fetcher.mock.calls.every(c => c[0] === "https://mcp.atlassian.com/v2/mcp" && c[1]?.redirect === "error")).toBe(true);
  expect(fetcher.mock.calls[3]![1]!.method).toBe("DELETE");
});
it("reads a chunked SSE result and cancels a stream that remains open", async () => {
  const cancel = vi.fn(), encoder = new TextEncoder(), text = "event: message\r\ndata: " + JSON.stringify({ jsonrpc: "2.0", id: 2, result: { ready: true } }) + "\r\n\r\n";
  const stream = new ReadableStream({ start(c) { c.enqueue(encoder.encode(text.slice(0, 18))); c.enqueue(encoder.encode(text.slice(18))); }, cancel });
  const fetcher = fixture().mockResolvedValueOnce(new Response(stream, { headers: { "content-type": "text/event-stream" } }));
  expect(await new LoomMcp("private", fetcher).read(cloudId, url)).toEqual({ ready: true });
  expect(cancel).toHaveBeenCalled();
});
it("rejects an unsupported protocol before requesting any content", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(rpc(1, { protocolVersion: "unknown", capabilities: { tools: {} } }));
  await expect(new LoomMcp("private", fetcher).read(cloudId, url)).rejects.toMatchObject({ status: 502 });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each([401, 403, 429, 500])("hides provider bodies on HTTP %s", async status => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("sensitive-provider-body", { status, headers: { "retry-after": "30" } }));
  await expect(new LoomMcp("private", fetcher).read(cloudId, url)).rejects.toMatchObject({ status: status === 429 ? 429 : status < 500 ? 403 : 503 });
});
it("parses native tool envelopes, rejects other sites and preserves unavailable transcripts", () => {
  expect(parseLoomPage(result(object()), id, cloudId).item.title).toBe("Video sintético");
  expect(() => parseLoomPage(result({ ...object(), ari: "ari:cloud:loom:foreign:video/" + id }), id, cloudId)).toThrow();
  expect(() => parseLoomPage({ isError: true, content: [] }, id, cloudId)).toThrow();
  expect(parseLoomPage(result(object([{ component: "transcript", status: "ABSENT" }])), id, cloudId).transcript?.status).toBe("ABSENT");
});
it("collects paginated transcript text with opaque cursors and no partial import", async () => {
  const first = object([{ component: "transcript", status: "READY", payload: { content: "first", totalCharacters: 11 }, nextCursor: "opaque-cursor" }]);
  const second = object([{ component: "transcript", status: "READY", payload: { content: "second", totalCharacters: 11 } }]);
  const fetcher = fixture().mockResolvedValueOnce(rpc(2, result(first))).mockResolvedValueOnce(rpc(3, result(second))).mockResolvedValueOnce(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetcher);
  expect((await readLoomSnapshot(url)).transcript).toBe("firstsecond");
  expect(JSON.parse(String(fetcher.mock.calls[3]![1]!.body)).params.arguments.resume).toEqual(["opaque-cursor"]);
});
it("rejects incomplete content and allows a metadata-only link when transcript is absent", async () => {
  let fetcher = fixture().mockResolvedValueOnce(rpc(2, result(object([{ component: "transcript", status: "READY", payload: { content: "short", totalCharacters: 100 } }])))).mockResolvedValueOnce(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetcher); await expect(readLoomSnapshot(url)).rejects.toMatchObject({ status: 502 });
  fetcher = fixture().mockResolvedValueOnce(rpc(2, result(object([{ component: "transcript", status: "ABSENT" }])))).mockResolvedValueOnce(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetcher); expect(await readLoomSnapshot(url)).toMatchObject({ transcript: null, transcriptStatus: "unavailable", sourceStatus: "ABSENT" });
});
