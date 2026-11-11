import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { normalizeLoomUrl, loomRequestSchema } from "./domain";
import { signPreview, snapshotHash, verifyPreview } from "./preview";
import type { LoomSnapshot, LoomTarget } from "./domain";
const id = "a".repeat(32);
const target: LoomTarget = { tenantId: "one", actorId: "actor", connectionKey: "c".repeat(64), clientId: "client", opportunityId: "opp" };
const snapshot: LoomSnapshot = { sourceId: id, ari: "ari:source", url: "https://www.loom.com/share/" + id, title: "Prueba", type: "ASYNC_VIDEO",
  createdAt: null, durationSeconds: 60, transcript: "[0:01] Texto de prueba", transcriptStatus: "ready", sourceStatus: "READY", observedAt: "2026-11-10T18:00:00Z" };
const key = Buffer.from("ab".repeat(32), "hex");
describe("Loom identity and reviewed import", () => {
  it("canonicalizes share/embed links without carrying queries to the provider", () => {
    for (const url of ["https://loom.com/embed/" + id + "?t=30#x", "https://www.loom.com/share/" + id.toUpperCase()]) {
      expect(normalizeLoomUrl(url)).toEqual({ sourceId: id, url: snapshot.url });
    }
  });
  it.each(["http://www.loom.com/share/" + id, "https://loom.com.evil.test/share/" + id, "https://user:secret@loom.com/share/" + id,
    "https://www.loom.com:8080/share/" + id, "https://127.0.0.1/share/" + id, "https://www.loom.com/share/short",
    "https://www.loom.com/share/" + id + "/extra"])("rejects unsafe identity %s", url => expect(() => normalizeLoomUrl(url)).toThrow());
  it("never accepts caller-selected tenant, metadata or transcript", () => {
    expect(loomRequestSchema.safeParse({ action: "preview", url: snapshot.url, tenantId: "other" }).success).toBe(false);
    expect(loomRequestSchema.safeParse({ action: "link", url: snapshot.url, previewToken: "x", snapshot }).success).toBe(false);
  });
  it("binds a signed preview to source, actor, company, connection and exact dossier", () => {
    const signed = signPreview(target, snapshot, key, 2, 1000);
    expect(verifyPreview(signed, target, id, key, 2000)).toEqual({ hash: snapshotHash(snapshot), baseRevision: 2 });
    for (const altered of [{ ...target, tenantId: "two" }, { ...target, actorId: "other" }, { ...target, connectionKey: "d" },
      { ...target, clientId: "foreign" }, { ...target, opportunityId: "other" }]) {
      expect(() => verifyPreview(signed, altered, id, key, 2000)).toThrow();
    }
    expect(() => verifyPreview(signed, target, "b".repeat(32), key, 2000)).toThrow();
    expect(() => verifyPreview(signed + "x", target, id, key, 2000)).toThrow();
    expect(() => verifyPreview(signed, target, id, key, 601000)).toThrow();
  });
  it("ignores observation time for idempotency but detects changed source text", () => {
    expect(snapshotHash({ ...snapshot, observedAt: "later" })).toBe(snapshotHash(snapshot));
    expect(snapshotHash({ ...snapshot, transcript: "new" })).not.toBe(snapshotHash(snapshot));
  });
});

it("keeps the same source digest after JSONB reorders keys", () => {
  const reordered = Object.fromEntries(Object.entries(snapshot).reverse()) as LoomSnapshot;
  expect(snapshotHash(reordered)).toBe(snapshotHash(snapshot));
});
