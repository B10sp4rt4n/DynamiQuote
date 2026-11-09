import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "./prisma";
import { confirmClassificationSchema, normalizeConcept, type ClassificationMemory, type SaleNature } from "@/lib/domain/fiscal-classification";

const TYPE = "fiscal_classification_confirmed";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
type Concept = { itemNumber: number; sku?: string; description: string };
export function classificationKey(item: Concept, nature: SaleNature): string {
  const sku = item.sku?.trim().toUpperCase();
  const normalized = normalizeConcept(item.description);
  const duration = normalized.match(/\b(\d+)\s*(meses|mes|anos|ano|months|month|years|year)\b/);
  const months = duration ? Number(duration[1]) * (/^(ano|year)/.test(duration[2]) ? 12 : 1) : null;
  const identity = sku && !["N/A", "NA", "SIN SKU", "GENERAL", "GENERIC"].includes(sku) ? { sku } : { description: normalized };
  return hash(JSON.stringify({ version: 1, ...identity, nature, months }));
}
function parse(payload: string | null, eventHash: string) {
  if (!payload || hash(payload) !== eventHash) return null;
  try { const data = JSON.parse(payload); return data.version === 1 && data.type === TYPE ? data : null; } catch { return null; }
}

// A saved decision for this exact document/actor/revision is distinct from
// reusable commercial memory. It can be recovered even when remember=false.
export async function savedClassification(input: { tenantId: string; actorUserId: string;
  proposalId: string; itemNumber: number; fingerprint: string; eventId?: string }) {
  const rows = await prisma.proposal_audit_events.findMany({
    where: { tenant_id: input.tenantId, proposal_id: input.proposalId, event_type: TYPE,
      ...(input.eventId ? { event_id: input.eventId } : {}),
      AND: [
        { payload: { contains: `"itemNumber":${input.itemNumber},` } },
        { payload: { contains: JSON.stringify({ fingerprint: input.fingerprint }).slice(1, -1) } },
        { payload: { contains: JSON.stringify({ actorUserId: input.actorUserId }).slice(1, -1) } },
      ] },
    orderBy: [{ created_at: "desc" }, { event_id: "desc" }], take: 1,
    select: { event_id: true, payload: true, event_hash: true, created_at: true },
  });
  const row = rows[0], data = row && parse(row.payload, row.event_hash);
  if (!data || row.event_id !== `fcl_${row.event_hash}` || data.tenantId !== input.tenantId
    || data.actorUserId !== input.actorUserId || data.proposalId !== input.proposalId
    || data.itemNumber !== input.itemNumber || data.fingerprint !== input.fingerprint) return null;
  const checked = confirmClassificationSchema.safeParse({ itemNumber: data.itemNumber,
    expectedFingerprint: data.fingerprint, nature: data.nature, satProductCode: data.satProductCode,
    unitCode: data.unitCode, catalogVersion: data.catalogVersion, confirm: true, remember: data.remember });
  if (!checked.success) return null;
  return { classification: { itemNumber: checked.data.itemNumber, satProductCode: checked.data.satProductCode,
    unitCode: checked.data.unitCode, catalogVersion: checked.data.catalogVersion, classificationEventId: row.event_id },
    nature: checked.data.nature, remember: checked.data.remember, confirmedAt: row.created_at.toISOString() };
}
export async function classificationMemory(tenantId: string, item: Concept, nature: SaleNature): Promise<ClassificationMemory | null> {
  const memoryKey = classificationKey(item, nature);
  const rows = await prisma.proposal_audit_events.findMany({
    where: { tenant_id: tenantId, event_type: TYPE, payload: { contains: memoryKey } },
    orderBy: [{ created_at: "desc" }, { event_id: "desc" }], take: 30,
    select: { payload: true, event_hash: true, created_at: true },
  });
  for (const row of rows) {
    const data = parse(row.payload, row.event_hash);
    if (data?.remember === true && data.memoryKey === memoryKey && data.nature === nature && data.tenantId === tenantId) {
      return { satProductCode: data.satProductCode, unitCode: data.unitCode, catalogVersion: data.catalogVersion, confirmedAt: row.created_at.toISOString() };
    }
  }
  return null;
}
export async function recordClassification(input: { tenantId: string; actorUserId: string; proposalId: string; item: Concept;
  fingerprint: string; nature: SaleNature; satProductCode: string; unitCode: string; catalogVersion: string; remember: boolean }) {
  const payload = JSON.stringify({ version: 1, type: TYPE, tenantId: input.tenantId, actorUserId: input.actorUserId,
    proposalId: input.proposalId, itemNumber: input.item.itemNumber, fingerprint: input.fingerprint,
    memoryKey: classificationKey(input.item, input.nature), nature: input.nature, sku: input.item.sku || null,
    description: input.item.description, satProductCode: input.satProductCode, unitCode: input.unitCode,
    catalogVersion: input.catalogVersion, remember: input.remember });
  const eventHash = hash(payload), id = `fcl_${eventHash}`;
  const event = await prisma.proposal_audit_events.upsert({ where: { event_id: id }, update: {},
    create: { event_id: id, tenant_id: input.tenantId, proposal_id: input.proposalId, event_type: TYPE,
      event_hash: eventHash, payload, created_at: new Date() } });
  return { id: event.event_id, confirmedAt: event.created_at.toISOString() };
}
export async function verifyClassification(input: { tenantId: string; actorUserId: string; proposalId: string;
  itemNumber: number; fingerprint: string; eventId: string; satProductCode: string; unitCode: string; catalogVersion: string }) {
  const row = await prisma.proposal_audit_events.findFirst({ where: { event_id: input.eventId, tenant_id: input.tenantId,
    proposal_id: input.proposalId, event_type: TYPE }, select: { payload: true, event_hash: true } });
  const data = row && parse(row.payload, row.event_hash);
  return Boolean(data && data.tenantId === input.tenantId && data.actorUserId === input.actorUserId && data.proposalId === input.proposalId
    && data.itemNumber === input.itemNumber && data.fingerprint === input.fingerprint && data.satProductCode === input.satProductCode
    && data.unitCode === input.unitCode && data.catalogVersion === input.catalogVersion);
}
