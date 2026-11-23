import "server-only";

import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { QuoteInputError } from "@/lib/domain/quote-input";
import { COMMERCIAL_EVIDENCE } from "@/lib/tenant-capabilities";

export const MAX_EVIDENCE_BYTES = 3 * 1024 * 1024;

export type EvidenceDocument = {
  bytes: Uint8Array;
  filename: string;
  supplier: string;
  reference: string | null;
  expiresOn: string | null;
};

export type EvidenceLink = Omit<EvidenceDocument, "bytes"> & {
  evidenceId: string;
  quoteId: string;
};

export async function readEvidenceFile(file: FormDataEntryValue | null) {
  if (!(file instanceof File) || file.size > MAX_EVIDENCE_BYTES || !file.name.toLowerCase().endsWith(".pdf")) {
    throw new QuoteInputError("Adjunta un PDF de hasta 3 MB.");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (Buffer.from(bytes.subarray(0, 5)).toString("ascii") !== "%PDF-") {
    throw new QuoteInputError("El archivo debe ser un PDF válido.");
  }
  return { bytes, filename: file.name };
}

export async function requireCommercialEvidence(tx: Prisma.TransactionClient, tenantId: string) {
  const rows = await tx.$queryRaw<{ enabled: boolean }[]>`
    SELECT enabled FROM tenant_capabilities
    WHERE tenant_id = ${tenantId} AND capability_key = ${COMMERCIAL_EVIDENCE}
    FOR SHARE`;
  if (!rows[0]?.enabled) throw new QuoteInputError("Evidencia comercial desactivada para esta empresa.", 403);
}

export async function storeCommercialEvidence(
  tx: Prisma.TransactionClient, tenantId: string, userId: string, document: EvidenceDocument,
) {
  const hash = createHash("sha256").update(document.bytes).digest("hex");
  const filename = document.filename.replace(/[\u0000-\u001f\u007f/\\]/g, "_").slice(-200);
  const inserted = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO commercial_evidence (tenant_id, sha256, filename, supplier, reference, expires_on, file_data, created_by)
    VALUES (${tenantId}, ${hash}, ${filename}, ${document.supplier}, ${document.reference},
      ${document.expiresOn}::date, ${document.bytes}, ${userId})
    ON CONFLICT (tenant_id, sha256) DO NOTHING
    RETURNING evidence_id::text AS id`;
  if (inserted[0]) return inserted[0].id;
  const existing = await tx.$queryRaw<{ id: string }[]>`
    SELECT evidence_id::text AS id FROM commercial_evidence WHERE tenant_id = ${tenantId} AND sha256 = ${hash}`;
  return existing[0].id;
}

export async function linkCommercialEvidence(
  tx: Prisma.TransactionClient, tenantId: string, userId: string, evidenceId: string, quoteIds: string[],
) {
  await tx.$executeRaw`
    INSERT INTO commercial_evidence_quotes (tenant_id, quote_id, evidence_id, linked_by)
    SELECT ${tenantId}, quote_id, ${evidenceId}::uuid, ${userId}
    FROM unnest(ARRAY[${Prisma.join(quoteIds)}]::text[]) AS requested(quote_id)
    ORDER BY quote_id
    ON CONFLICT DO NOTHING`;
}

export async function listCommercialEvidence(tenantId: string, quoteIds: string[]) {
  if (!quoteIds.length) return [];
  return prisma.$queryRaw<EvidenceLink[]>`
    SELECT e.evidence_id::text AS "evidenceId", l.quote_id AS "quoteId", e.filename,
      e.supplier, e.reference, to_char(e.expires_on, 'YYYY-MM-DD') AS "expiresOn"
    FROM commercial_evidence_quotes l JOIN commercial_evidence e USING (tenant_id, evidence_id)
    WHERE l.tenant_id = ${tenantId} AND l.quote_id IN (${Prisma.join(quoteIds)})
    ORDER BY e.created_at DESC, e.evidence_id, l.quote_id`;
}

export async function getCommercialEvidenceFile(tenantId: string, quoteId: string, evidenceId: string) {
  const rows = await prisma.$queryRaw<{ filename: string; bytes: Uint8Array }[]>`
    SELECT e.filename, e.file_data AS bytes
    FROM commercial_evidence_quotes l JOIN commercial_evidence e USING (tenant_id, evidence_id)
    WHERE l.tenant_id = ${tenantId} AND l.quote_id = ${quoteId} AND l.evidence_id = ${evidenceId}::uuid`;
  return rows[0] ?? null;
}
