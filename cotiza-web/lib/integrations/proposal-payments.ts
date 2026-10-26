import "server-only";
import { NextResponse } from "next/server";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { isProposalVisibleToViewer } from "@/lib/db/proposals";
import { getProposalInvoiceStatusByTenant } from "@/lib/db/proposal-invoices";
import { isDigestorFiscalEnabledForTenant } from "@/lib/integrations/digestor-fiscal";

export function isPpdCaptureEnabled(): boolean {
  return process.env["DIGESTOR_FISCAL_PPD_ENABLED"] === "true";
}

export async function authorizeProposalPayments(proposalId: string) {
  const tenant = await getCurrentTenantContext();
  if (!tenant) return { error: NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  if (!isPpdCaptureEnabled() || !isDigestorFiscalEnabledForTenant(tenant.id)) {
    return { error: NextResponse.json({ error: "PPD y pagos aún no están habilitados" }, { status: 403 }) };
  }
  const canSeeAll = tenant.isSuperAdmin || tenant.userRole === "owner" || tenant.userRole === "admin";
  if (!await isProposalVisibleToViewer(tenant.id, proposalId, tenant.userId, canSeeAll)) {
    return { error: NextResponse.json({ error: "Propuesta no encontrada" }, { status: 404 }) };
  }
  const invoice = await getProposalInvoiceStatusByTenant(tenant.id, proposalId);
  if (!invoice?.draftId || invoice.status !== "stamped" || !invoice.uuid || !invoice.xmlBase64) {
    return { error: NextResponse.json({ error: "Se requiere una factura timbrada" }, { status: 409 }) };
  }
  return { draftId: invoice.draftId };
}

export function paymentFailure(error: unknown): NextResponse {
  return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo confirmar la operación; consulta el estado antes de reintentar" }, { status: 502 });
}
