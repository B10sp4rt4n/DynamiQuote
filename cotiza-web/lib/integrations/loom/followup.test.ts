import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { loomFollowupSchema, type LoomLink, type LoomTarget } from "./domain";
import { reviewLoomFollowup, verifyLoomFollowup } from "./followup";
const target: LoomTarget = { tenantId: "one", actorId: "super", connectionKey: "c".repeat(64), clientId: "client", opportunityId: "opp" };
const link: LoomLink = { linkId: "link", revision: 2, snapshot: { sourceId: "a".repeat(32), ari: "ari:source",
  url: "https://www.loom.com/share/" + "a".repeat(32), title: "Sintético", type: "ASYNC_VIDEO", createdAt: null, durationSeconds: 60,
  transcript: "[0:01] Confirmar cantidades antes de cotizar.", transcriptStatus: "ready", sourceStatus: "READY", observedAt: "2026-11-10T18:00:00Z" } };
const key = Buffer.from("ab".repeat(32), "hex");
it("requires an explicit valid date for tasks and forbids a date on notes", () => {
  const task = { kind: "task", excerpt: "Confirmar cantidades", description: "Pedir cantidades", dueDate: "2026-11-12" };
  expect(loomFollowupSchema.safeParse(task).success).toBe(true);
  for (const value of ["", "2026-02-30", "mañana", null]) expect(loomFollowupSchema.safeParse({ ...task, dueDate: value }).success).toBe(false);
  expect(loomFollowupSchema.safeParse({ ...task, kind: "note" }).success).toBe(false);
});
it("reviews an exact excerpt and signs the action, content, source revision and destination", () => {
  const review = reviewLoomFollowup(target, link, { kind: "note", excerpt: "Confirmar cantidades", description: "Pendiente de confirmar", dueDate: null }, key, 1000);
  const claims = verifyLoomFollowup(review.token, target, key, 2000);
  expect(claims).toMatchObject({ linkId: "link", revision: 2, followup: { kind: "note", description: "Pendiente de confirmar" } });
  expect(() => verifyLoomFollowup(review.token, { ...target, tenantId: "other" }, key, 2000)).toThrow();
  expect(() => verifyLoomFollowup(review.token, { ...target, actorId: "other" }, key, 2000)).toThrow();
  expect(() => verifyLoomFollowup(review.token + "x", target, key, 2000)).toThrow();
  expect(() => verifyLoomFollowup(review.token, target, key, 601000)).toThrow();
});
it("does not invent a source excerpt or accept a metadata-only recording", () => {
  const input = { kind: "note" as const, excerpt: "Aprobado", description: "Nota de prueba", dueDate: null };
  expect(() => reviewLoomFollowup(target, link, input, key)).toThrow(/fragmento/);
  expect(() => reviewLoomFollowup(target, { ...link, snapshot: { ...link.snapshot, transcript: null, transcriptStatus: "unavailable" } }, input, key)).toThrow();
});
