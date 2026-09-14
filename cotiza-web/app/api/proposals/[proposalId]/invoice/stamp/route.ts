import { NextResponse } from "next/server";

import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { isDigestorFiscalEnabledForTenant, stampBillingDraft } from "@/lib/integrations/digestor-fiscal";
import { getProposalInvoiceStatusByTenant, markProposalInvoiceStampedByTenant } from "@/lib/db/proposal-invoices";

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

  if (invoice.status === "stamped") {
    return NextResponse.json({ error: "Esta propuesta ya tiene un CFDI timbrado" }, { status: 409 });
  }

  try {
    const result = await stampBillingDraft(invoice.draftId);
    await markProposalInvoiceStampedByTenant(tenant.id, proposalId, result.ok ? result.uuid : null);

    if (!result.ok) {
      const detail = result.rejectionMessage ? ` Detalle del PAC: ${result.rejectionMessage}` : "";
      return NextResponse.json(
        { error: `El PAC rechazó el timbrado.${detail}`, ok: false },
        { status: 422 },
      );
    }

    return NextResponse.json({ ok: true, uuid: result.uuid }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido al timbrar";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
