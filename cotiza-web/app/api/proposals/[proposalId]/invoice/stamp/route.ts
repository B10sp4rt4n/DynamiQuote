import { isProposalVisibleToViewer } from "@/lib/db/proposals";
import { NextResponse } from "next/server";

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

export async function POST(_: Request, context: RouteContext) {
  const tenant = await getCurrentTenantContext();
  if (!tenant) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (!isDigestorFiscalEnabledForTenant(tenant.id)) {
    return NextResponse.json({ error: "La facturación no está habilitada para este tenant" }, { status: 403 });
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

  // El compare-and-set en BD evita que dos solicitudes concurrentes lancen
  // al PAC el mismo borrador. Ante timeout el estado queda en 'stamping'.
  const claimed = await claimProposalInvoiceStampByTenant(tenant.id, proposalId, invoice.draftId);
  if (!claimed) {
    return NextResponse.json({ error: "Otra solicitud ya inicio el timbrado o cambio la prefactura." }, { status: 409 });
  }

  try {
    const result = await stampBillingDraft(invoice.draftId);

    if (!result.ok) {
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
