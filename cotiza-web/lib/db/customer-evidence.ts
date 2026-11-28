import "server-only";
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { CustomerEvidenceAttachment } from "@/lib/domain/customer-confirmation";

export const MAX_CUSTOMER_EVIDENCE_BYTES = 3 * 1024 * 1024;
export type CustomerEvidenceUpload = { bytes: Uint8Array; filename: string; mimeType: string };
export class CustomerEvidenceError extends Error {
  constructor(message: string, public status = 422) { super(message); }
}

export async function readCustomerEvidenceFile(file: FormDataEntryValue): Promise<CustomerEvidenceUpload> {
  if (!(file instanceof File) || file.size < 1 || file.size > MAX_CUSTOMER_EVIDENCE_BYTES) {
    throw new CustomerEvidenceError("Adjunta un PDF, PNG, JPG o correo EML de hasta 3 MB.");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const buffer = Buffer.from(bytes), name = file.name.toLowerCase();
  let mimeType: string | null = null;
  if (name.endsWith(".pdf") && buffer.subarray(0, 5).toString("ascii") === "%PDF-") mimeType = "application/pdf";
  if (name.endsWith(".png") && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) mimeType = "image/png";
  if (/\.jpe?g$/.test(name) && buffer.length > 3 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) mimeType = "image/jpeg";
  if (name.endsWith(".eml")) {
    const header = buffer.subarray(0, 65536).toString("utf8").split(/\r?\n\r?\n/, 1)[0];
    if (!header.includes("\0") && /^from:.+/im.test(header) && /^(date|subject):.+/im.test(header)) mimeType = "message/rfc822";
  }
  if (!mimeType) throw new CustomerEvidenceError("El contenido no corresponde a un PDF, PNG, JPG o correo EML válido.");
  return { bytes, mimeType, filename: file.name.replace(/[\u0000-\u001f\u007f/\\]/g, "_").slice(-200) || "confirmacion" };
}

export async function storeCustomerEvidence(tx: Prisma.TransactionClient, tenantId: string, proposalId: string, userId: string, file: CustomerEvidenceUpload): Promise<CustomerEvidenceAttachment> {
  if (!file.bytes.length || file.bytes.length > MAX_CUSTOMER_EVIDENCE_BYTES) throw new CustomerEvidenceError("El respaldo debe ocupar como máximo 3 MB.");
  const ready = await tx.$queryRaw<{ ready: boolean }[]>`SELECT to_regclass('customer_acceptance_files') IS NOT NULL AS ready`;
  if (!ready[0]?.ready) throw new CustomerEvidenceError("La carga de archivos requiere completar su publicación. Puedes pegar la confirmación escrita.", 503);
  const hash = createHash("sha256").update(file.bytes).digest("hex");
  const rows = await tx.$queryRaw<CustomerEvidenceAttachment[]>`
    INSERT INTO customer_acceptance_files(tenant_id, proposal_id, sha256, filename, mime_type, file_data, created_by)
    VALUES(${tenantId}, ${proposalId}, ${hash}, ${file.filename}, ${file.mimeType}, ${file.bytes}, ${userId})
    ON CONFLICT(tenant_id, proposal_id, sha256) DO UPDATE SET sha256=EXCLUDED.sha256
    RETURNING evidence_id::text AS id, filename, mime_type AS "mimeType", sha256`;
  return rows[0];
}

export async function readCustomerEvidence(tx: Prisma.TransactionClient, tenantId: string, proposalId: string, evidenceId: string) {
  const rows = await tx.$queryRaw<(CustomerEvidenceAttachment & { bytes: Uint8Array })[]>`
    SELECT evidence_id::text AS id, filename, mime_type AS "mimeType", sha256, file_data AS bytes
    FROM customer_acceptance_files WHERE tenant_id=${tenantId} AND proposal_id=${proposalId} AND evidence_id=${evidenceId}::uuid`;
  return rows[0] ?? null;
}
