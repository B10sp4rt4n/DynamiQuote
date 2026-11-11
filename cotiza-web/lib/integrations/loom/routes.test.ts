import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ auth: vi.fn(), read: vi.fn(), list: vi.fn(), save: vi.fn(), revision: vi.fn(), find: vi.fn(), followup: vi.fn() }));
vi.mock("./access", () => ({ authorizeLoom: m.auth }));
vi.mock("./client", () => ({ readLoomSnapshot: m.read }));
vi.mock("./store", () => ({ listLoomLinks: m.list, getLoomRevision: m.revision, saveLoomLink: m.save }));
vi.mock("./followup-store", () => ({ findLoomLink: m.find, saveLoomFollowup: m.followup }));
import { GET, POST } from "@/app/api/clients/[clientId]/loom/route";
import { GET as opportunityGet } from "@/app/api/opportunities/[opportunityId]/loom/route";
import { LoomError, type LoomSnapshot } from "./domain";
const id = "a".repeat(32), context = { params: Promise.resolve({ clientId: "client" }) };
const target = { tenantId: "one", actorId: "super", connectionKey: "c".repeat(64), clientId: "client", opportunityId: null };
const snapshot: LoomSnapshot = { sourceId: id, ari: "ari:source", url: "https://www.loom.com/share/" + id,
  title: "Prueba", type: "ASYNC_VIDEO", createdAt: null, durationSeconds: 30,
  transcript: "[0:01] Prueba", transcriptStatus: "ready", sourceStatus: "READY", observedAt: "2026-11-10T18:00:00Z" };
const request = (value: unknown) => new Request("https://cotiza.test/api/clients/client/loom", { method: "POST", headers: { origin: "https://cotiza.test", "x-tenant-context": "one" }, body: JSON.stringify(value) });
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("COTIZA_LOOM_TENANT_ID", "one"); vi.stubEnv("COTIZA_LOOM_CLOUD_ID", "9061827c-eca4-4635-819e-8a2927a7c7ee");
  vi.stubEnv("COTIZA_LOOM_EMAIL", "reader@example.test"); vi.stubEnv("COTIZA_LOOM_API_TOKEN", "synthetic-private");
  vi.stubEnv("COTIZA_LOOM_PREVIEW_KEY", "ab".repeat(32)); vi.stubEnv("COTIZA_LOOM_APP_ORIGIN", "https://cotiza.test");
  m.auth.mockResolvedValue(target); m.read.mockResolvedValue(snapshot); m.list.mockResolvedValue([]);
  m.find.mockResolvedValue({ linkId: "link", revision: 1, snapshot }); m.followup.mockResolvedValue({ kind: "note", resultId: "note-a", unchanged: false });
  m.revision.mockResolvedValue(null); m.save.mockResolvedValue({ link: { linkId: "link", revision: 1, snapshot }, unchanged: false });
});
afterEach(() => vi.unstubAllEnvs());
it("reads saved copies without invoking Loom and keeps every response private", async () => {
  const response = await GET(new Request("https://cotiza.test/api"), context);
  expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toContain("no-store");
  expect(m.read).not.toHaveBeenCalled(); expect(m.list).toHaveBeenCalledWith(target);
  await opportunityGet(new Request("https://cotiza.test/api"), { params: Promise.resolve({ opportunityId: "opp" }) });
  expect(m.auth).toHaveBeenLastCalledWith(expect.any(Request), "opportunity", "opp");
});
it("previews without persisting, then rechecks the source before saving the signed copy", async () => {
  const response = await POST(request({ action: "preview", url: snapshot.url }), context), preview = await response.json();
  expect(response.status).toBe(200); expect(m.save).not.toHaveBeenCalled();
  expect(preview.previewToken).toBeTypeOf("string");
  const linked = await POST(request({ action: "link", url: snapshot.url, previewToken: preview.previewToken }), context);
  expect(linked.status).toBe(201); expect(m.read).toHaveBeenCalledTimes(2);
  expect(m.save).toHaveBeenCalledWith(target, snapshot, null);
});
it("rejects client transcript injection, unknown fields and unsigned confirmations before the provider", async () => {
  for (const payload of [{ action: "preview", url: snapshot.url, tenantId: "two" }, { action: "link", url: snapshot.url, previewToken: "bad" },
    { action: "preview", url: snapshot.url, transcript: "invented" }]) {
    expect((await POST(request(payload), context)).status).toBeGreaterThanOrEqual(400);
  }
  expect(m.read).not.toHaveBeenCalled(); expect(m.save).not.toHaveBeenCalled();
});
it("rejects a changed company, actor or source between preview and confirmation", async () => {
  const preview = await (await POST(request({ action: "preview", url: snapshot.url }), context)).json();
  m.auth.mockResolvedValue({ ...target, tenantId: "two" });
  expect((await POST(request({ action: "link", url: snapshot.url, previewToken: preview.previewToken }), context)).status).toBe(409);
  m.auth.mockResolvedValue(target); m.read.mockResolvedValue({ ...snapshot, transcript: "changed" });
  expect((await POST(request({ action: "link", url: snapshot.url, previewToken: preview.previewToken }), context)).status).toBe(409);
  expect(m.save).not.toHaveBeenCalled();
});
it("does not leak secrets or alter saved copies on authorization/provider/storage failures", async () => {
  m.auth.mockRejectedValue(new LoomError("No autorizado", 403));
  expect((await GET(new Request("https://cotiza.test/api"), context)).status).toBe(403); expect(m.list).not.toHaveBeenCalled();
  m.auth.mockResolvedValue(target); m.read.mockRejectedValue(Error("synthetic-private-token"));
  const response = await POST(request({ action: "preview", url: snapshot.url }), context);
  expect(response.status).toBe(503); expect(JSON.stringify(await response.json())).not.toContain("synthetic-private-token"); expect(m.save).not.toHaveBeenCalled();
});
it("surfaces rate limits with retry metadata and rejects oversized bodies", async () => {
  m.auth.mockRejectedValue(new LoomError("Espera", 429, "30"));
  const limited = await GET(new Request("https://cotiza.test/api"), context); expect(limited.headers.get("retry-after")).toBe("30");
  m.auth.mockResolvedValue(target);
  expect((await POST(request({ action: "preview", url: "x".repeat(11000) }), context)).status).toBe(413);
});

it("reviews a source-backed follow-up without writing, then saves exactly the signed action locally", async () => {
  const reviewed = await POST(request({ action: "review_followup", linkId: "link", revision: 1,
    followup: { kind: "note", excerpt: "Prueba", description: "Confirmar siguiente paso", dueDate: null } }), context);
  expect(reviewed.status).toBe(200); const data = await reviewed.json();
  expect(m.followup).not.toHaveBeenCalled(); expect(m.read).not.toHaveBeenCalled();
  expect((await POST(request({ action: "save_followup", token: data.token }), context)).status).toBe(201);
  expect(m.followup).toHaveBeenCalledWith(target, expect.objectContaining({ linkId: "link", revision: 1,
    followup: { kind: "note", excerpt: "Prueba", description: "Confirmar siguiente paso", dueDate: null } }));
});
it("rejects a missing task date, stale copy and follow-up token from another dossier", async () => {
  const followup = { kind: "task", excerpt: "Prueba", description: "Pedir cantidades", dueDate: "" };
  expect((await POST(request({ action: "review_followup", linkId: "link", revision: 1, followup }), context)).status).toBe(422);
  expect((await POST(request({ action: "review_followup", linkId: "link", revision: 2, followup: { ...followup, dueDate: "2026-11-12" } }), context)).status).toBe(409);
  const data = await (await POST(request({ action: "review_followup", linkId: "link", revision: 1, followup: { ...followup, dueDate: "2026-11-12" } }), context)).json();
  m.auth.mockResolvedValue({ ...target, opportunityId: "foreign" });
  expect((await POST(request({ action: "save_followup", token: data.token }), context)).status).toBe(409);
  expect(m.followup).not.toHaveBeenCalled();
});
