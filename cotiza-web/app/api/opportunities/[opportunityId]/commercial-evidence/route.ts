import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import {
  linkCommercialEvidence, MAX_EVIDENCE_BYTES, readEvidenceFile, requireCommercialEvidence, storeCommercialEvidence,
} from "@/lib/db/commercial-evidence";
import { resolveBusiness } from "@/lib/db/opportunity-workspace";
import { prisma } from "@/lib/db/prisma";
import { isTenantCapabilityEnabled } from "@/lib/db/tenant-capabilities";
import { QuoteInputError, quoteInputIdSchema } from "@/lib/domain/quote-input";
import { COMMERCIAL_EVIDENCE } from "@/lib/tenant-capabilities";
import { enforceRateLimit, getRequestIdentity } from "@/lib/utils/rate-limit";

export const runtime = "nodejs";

const uploadSchema = z.object({
  supplier: z.string().trim().min(1).max(120),
  reference: z.string().trim().max(120),
  expiresOn: z.union([z.literal(""), z.iso.date()]),
});

export async function POST(request: Request, { params }: { params: Promise<{ opportunityId: string }> }) {
  const tenant = await getCurrentTenantContext();
  if (!tenant?.userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!await isTenantCapabilityEnabled(tenant.id, COMMERCIAL_EVIDENCE)) {
    return NextResponse.json({ error: "Evidencia comercial desactivada para esta empresa." }, { status: 403 });
  }
  if (request.headers.get("X-Tenant-Context") !== tenant.id) {
    return NextResponse.json({ error: "La empresa activa cambió. Recarga la oportunidad." }, { status: 409 });
  }
  const { opportunityId } = await params;
  const userId = tenant.userId;
  const canSeeAll = tenant.isSuperAdmin || tenant.userRole === "owner" || tenant.userRole === "admin";
  const business = await resolveBusiness(tenant.id, opportunityId, { userId, canSeeAll });
  if (!business) return NextResponse.json({ error: "Oportunidad no encontrada." }, { status: 404 });
  const rate = enforceRateLimit(`commercial-evidence:${tenant.id}:${getRequestIdentity(request, userId)}`, 15, 60_000);
  if (!rate.allowed) return NextResponse.json({ error: "Espera un momento antes de adjuntar más documentos." }, { status: 429 });
  if (Number(request.headers.get("content-length") ?? 0) > MAX_EVIDENCE_BYTES + 65536) {
    return NextResponse.json({ error: "El PDF supera el límite de 3 MB." }, { status: 413 });
  }

  try {
    const form = await request.formData().catch(() => null);
    const ids = z.array(quoteInputIdSchema).min(1).max(50).safeParse(form?.getAll("quoteId"));
    if (!form || !ids.success) throw new QuoteInputError("Selecciona las revisiones de cotización que quieres vincular.");
    const quoteIds = [...new Set(ids.data)];
    const existingId = form.get("evidenceId");
    const existing = z.uuid().nullable().safeParse(existingId);
    if (!existing.success) throw new QuoteInputError("Selecciona una evidencia válida.");
    const fields = existing.data ? null : uploadSchema.safeParse({
      supplier: form.get("supplier"), reference: form.get("reference") ?? "", expiresOn: form.get("expiresOn") ?? "",
    });
    if (fields && !fields.success) throw new QuoteInputError("Revisa el fabricante, el folio y la vigencia.");
    const document = fields?.success ? {
      ...await readEvidenceFile(form.get("file")), supplier: fields.data.supplier,
      reference: fields.data.reference || null, expiresOn: fields.data.expiresOn || null,
    } : null;
    const scope = Prisma.sql`q.tenant_id = ${tenant.id} AND q.opportunity_id IN (${Prisma.join(business.ids)})
      AND (${canSeeAll} OR q.created_by_user_id = ${userId})`;

    await prisma.$transaction(async (tx) => {
      await requireCommercialEvidence(tx, tenant.id);
      const quotes = await tx.$queryRaw<{ quote_id: string }[]>`
        SELECT q.quote_id FROM quotes q WHERE ${scope} AND q.quote_id IN (${Prisma.join(quoteIds)})
        ORDER BY q.quote_id FOR SHARE`;
      if (quotes.length !== quoteIds.length) throw new QuoteInputError("Una o más revisiones ya no están disponibles en esta oportunidad.", 404);
      if (existing.data) {
        const links = await tx.$queryRaw<{ quote_id: string }[]>`
          SELECT l.quote_id FROM commercial_evidence_quotes l
          JOIN quotes q ON q.tenant_id = l.tenant_id AND q.quote_id = l.quote_id
          WHERE ${scope} AND l.evidence_id = ${existing.data}::uuid LIMIT 1`;
        if (!links.length) throw new QuoteInputError("Evidencia no encontrada en esta oportunidad.", 404);
        await linkCommercialEvidence(tx, tenant.id, userId, existing.data, quoteIds);
      } else if (document) {
        const evidenceId = await storeCommercialEvidence(tx, tenant.id, userId, document);
        await linkCommercialEvidence(tx, tenant.id, userId, evidenceId, quoteIds);
      }
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof QuoteInputError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[commercial-evidence:attach]", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "No se pudo guardar la evidencia comercial. Vuelve a intentarlo." }, { status: 500 });
  }
}
