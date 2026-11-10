import { isProposalVisibleToViewer } from "@/lib/db/proposals";
import { NextResponse } from "next/server";
import { z } from "zod";
import { readInvoiceStamp } from "@/lib/domain/invoice-stamp";

import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { isDigestorFiscalEnabledForTenant, stampBillingDraft } from "@/lib/integrations/digestor-fiscal";
import {
  claimProposalInvoiceStampByTenant,
  getProposalInvoiceStatusByTenant,
  markProposalInvoiceRejectedByTenant,
  markProposalInvoiceStampedByTenant,
} from "@/lib/db/proposal-invoices";

type RouteContext = {
  params: Promise<{ proposalId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const tenant = await getCurrentTenantContext();
  if (!tenant) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (!isDigestorFiscalEnabledForTenant(tenant.id)) {
    return NextResponse.json({ error: "La facturación no está habilitada para este tenant" }, { status: 403 });
  }

  if (process.env['DIGESTOR_FISCAL_PPD_PRODUCTION_ENABLED'] === 'true' &&
      (tenant.authMode !== 'clerk' || request.headers.get('origin') !== new URL(request.url).origin)) {
    return NextResponse.json({ error: "Se requiere sesión y origen autorizado para timbrar" }, { status: 403 });
  }
  const { proposalId } = await context.params;
  const canSeeAll = tenant.isSuperAdmin || tenant.userRole === "owner" || tenant.userRole === "admin";
  if (!await isProposalVisibleToViewer(tenant.id, proposalId, tenant.userId, canSeeAll)) {
    return NextResponse.json({ error: "Propuesta no encontrada" }, { status: 404 });
  }
  const invoice = await getProposalInvoiceStatusByTenant(tenant.id, proposalId);

  if (!invoice) {
    return NextResponse.json({ error: "Propuesta no encontrada" }, { status: 404 });
  }

  if (!invoice.draftId) {
    return NextResponse.json(
      { error: "Primero genera la prefactura antes de timbrar" },
      { status: 422 },
    );
  }

  if (invoice.status === "stamped" || invoice.uuid || invoice.xmlBase64 || invoice.stampedAt) {
    return NextResponse.json({ error: "Esta propuesta ya tiene un CFDI timbrado" }, { status: 409 });
  }
  if (invoice.status === "stamping") {
    return NextResponse.json(
      { error: "Hay un timbrado pendiente de confirmacion. Usa Consultar estado; no repitas el timbrado." },
      { status: 409 },
    );
  }

  const input = z.object({ expectedDraftId: z.string().min(1).max(128), confirm: z.literal(true) }).strict()
    .safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "Confirma el timbrado de la prefactura revisada" }, { status: 422 });
  if (input.data.expectedDraftId !== invoice.draftId) return NextResponse.json({ error: "La prefactura cambió. Recarga y revisa antes de timbrar" }, { status: 409 });

  if (invoice.outcome !== "won") {
    return NextResponse.json({ error: "Solo se puede timbrar una propuesta marcada como Ganada. El expediente fiscal sigue disponible para consulta." }, { status: 422 });
  }

  // El compare-and-set en BD evita que dos solicitudes concurrentes lancen
  // al PAC el mismo borrador. Ante timeout el estado queda en 'stamping'.
  const claimed = await claimProposalInvoiceStampByTenant(tenant.id, proposalId, invoice.draftId);
  if (!claimed) {
    return NextResponse.json({ error: "La propuesta o prefactura cambió, o ya hay un timbrado iniciado. Recarga antes de continuar." }, { status: 409 });
  }

  try {
    const result = await stampBillingDraft(invoice.draftId);

    if (!result.ok) {
      if (result.draft?.stampStatus !== "rejected" || result.uuid || result.xmlBase64) {
        return NextResponse.json({ error: "El resultado no confirma un rechazo. Consulta el estado; no repitas el timbrado" }, { status: 502 });
      }
      const recorded = await markProposalInvoiceRejectedByTenant(tenant.id, proposalId, invoice.draftId);
      if (!recorded) {
        return NextResponse.json(
          { error: "El estado local cambió durante el rechazo. Actualiza la página antes de continuar." },
          { status: 409 },
        );
      }
      const detail = result.rejectionMessage ? ` Detalle del PAC: ${result.rejectionMessage}` : "";
      return NextResponse.json(
        { error: `El PAC rechazo el timbrado.${detail}`, ok: false },
        { status: 422 },
      );
    }

    if (!result.uuid || !result.xmlBase64) {
      // Exito remoto sin comprobante completo: NO es seguro repetir.
      return NextResponse.json(
        { error: "El PAC pudo haber timbrado, pero no se recibio UUID/XML valido. Consulta el estado antes de reintentar." },
        { status: 502 },
      );
    }

    readInvoiceStamp(result.xmlBase64, result.uuid);

    const recorded = await markProposalInvoiceStampedByTenant(
      tenant.id, proposalId, invoice.draftId, result.uuid, result.xmlBase64,
    );
    if (!recorded) {
      return NextResponse.json(
        { error: "CFDI timbrado, pero no se pudo guardar su estado local. Usa Consultar estado para recuperarlo." },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true, uuid: result.uuid }, { status: 200 });
  } catch {
    // Nunca liberar 'stamping' por un error de red: el PAC pudo aceptar.
    return NextResponse.json(
      { error: "Resultado del timbrado incierto. Usa Consultar estado; NO vuelvas a timbrar." },
      { status: 502 },
    );
  }
}
