import { createHash } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ findMany: vi.fn(), findFirst: vi.fn(), upsert: vi.fn() }));
vi.mock("./prisma", () => ({ prisma: { proposal_audit_events: m } }));
import { classificationKey, classificationMemory, recordClassification, verifyClassification } from "./fiscal-classifications";
const item = { itemNumber: 1, sku: "EDR-12", description: "ThreatDown EDR licencia 12 meses" };
const input = { tenantId: "tenant-a", actorUserId: "actor-a", proposalId: "p-a", item, fingerprint: "a".repeat(64),
  nature: "license" as const, satProductCode: "43233205", unitCode: "E48", catalogVersion: "b".repeat(64), remember: true };
beforeEach(() => {
  vi.resetAllMocks(); m.findMany.mockResolvedValue([]);
  m.upsert.mockImplementation(async ({ create }) => create);
});
it("distinguishes sale nature, duration and unrecognized SKUs", () => {
  expect(classificationKey(item, "license")).not.toBe(classificationKey(item, "managed_service"));
  expect(classificationKey(item, "license")).not.toBe(classificationKey({ ...item, description: "ThreatDown EDR 36 meses" }, "license"));
  expect(classificationKey({ ...item, sku: "N/A" }, "license")).not.toBe(classificationKey({ ...item, sku: "N/A", description: "Otra operación" }, "license"));
});
it("records immutable idempotent decisions and exposes only tenant scoped remembered pairs", async () => {
  const saved = await recordClassification(input);
  const call = m.upsert.mock.calls[0][0];
  expect(call.update).toEqual({}); expect(saved.id).toMatch(/^fcl_[a-f0-9]{64}$/);
  m.findMany.mockResolvedValue([call.create]);
  const memory = await classificationMemory("tenant-a", item, "license");
  expect(memory).toMatchObject({ satProductCode: "43233205", unitCode: "E48" });
  expect(memory).not.toHaveProperty("proposalId"); expect(memory).not.toHaveProperty("actorUserId");
  expect(m.findMany.mock.calls[0][0].where.tenant_id).toBe("tenant-a");
  expect(await classificationMemory("tenant-b", item, "license")).toBeNull();
});
it("verifies decision integrity and binds tenant, actor, proposal, item and revision", async () => {
  await recordClassification(input); const row = m.upsert.mock.calls[0][0].create;
  m.findFirst.mockResolvedValue(row);
  const receipt = { ...input, itemNumber: 1, eventId: row.event_id };
  expect(await verifyClassification(receipt)).toBe(true);
  for (const changed of [{ tenantId: "other" }, { actorUserId: "other" }, { proposalId: "other" }, { itemNumber: 2 }, { fingerprint: "c".repeat(64) }, { unitCode: "H87" }]) {
    expect(await verifyClassification({ ...receipt, ...changed })).toBe(false);
  }
  m.findFirst.mockResolvedValue({ ...row, payload: row.payload + " " });
  expect(await verifyClassification(receipt)).toBe(false);
  expect(createHash("sha256").update(row.payload).digest("hex")).toBe(row.event_hash);
});
it("does not reuse an event for which remembering was not authorized", async () => {
  await recordClassification({ ...input, remember: false });
  m.findMany.mockResolvedValue([m.upsert.mock.calls[0][0].create]);
  expect(await classificationMemory("tenant-a", item, "license")).toBeNull();
});
