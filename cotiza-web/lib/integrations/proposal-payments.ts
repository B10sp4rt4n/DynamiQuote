import "server-only";
import { NextResponse } from "next/server";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { isProposalVisibleToViewer } from "@/lib/db/proposals";
import { getProposalInvoiceStatusByTenant } from "@/lib/db/proposal-invoices";
import { isDigestorFiscalEnabledForTenant } from "@/lib/integrations/digestor-fiscal";
import { isDigestorFiscalSandboxTenant } from "@/lib/integrations/digestor-routing";
import { DigestorHttpError } from "./digestor-error";

export function isPpdCaptureEnabled(): boolean {
  return process.env["DIGESTOR_FISCAL_PPD_ENABLED"] === "true";
}

export async function authorizeProposalFiscalDocument(proposalId: string, feature: 'payments' | 'cancellation' | 'correction' | 'correction_read' | 'sat_status', request?: Request) {
  const tenant = await getCurrentTenantContext();
  if (!tenant) return { error: NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  const enabled = feature === 'payments' ? isPpdCaptureEnabled() : ['correction_read','sat_status'].includes(feature) ? true
    : feature === 'correction' ? process.env['DIGESTOR_FISCAL_CORRECTIONS_ENABLED'] === 'true'
    : process.env['DIGESTOR_FISCAL_CANCELLATION_ENABLED'] === 'true';
  if (!enabled || !isDigestorFiscalEnabledForTenant(tenant.id)) {
    return { error: NextResponse.json({ error: "La operación fiscal aún no está habilitada" }, { status: 403 }) };
  }
  const production = feature === 'sat_status' ? !isDigestorFiscalSandboxTenant(tenant.id) : feature === 'payments' ? process.env['DIGESTOR_FISCAL_PPD_PRODUCTION_ENABLED'] === 'true'
    : process.env['DIGESTOR_FISCAL_OPERATIONS_PRODUCTION_ENABLED'] === 'true';
  if (production) {
    if (tenant.authMode !== 'clerk') return { error: NextResponse.json({ error: "Inicia sesión para operar facturas reales" }, { status: 401 }) };
    if (feature !== 'payments' && feature !== 'sat_status' && !(tenant.isSuperAdmin || tenant.userRole === 'owner' || tenant.userRole === 'admin')) {
      return { error: NextResponse.json({ error: 'Acceso fiscal administrativo requerido' }, { status: 403 }) };
    }
    if (request && !['GET','HEAD'].includes(request.method) && request.headers.get('origin') !== new URL(request.url).origin) {
      return { error: NextResponse.json({ error: "Origen no autorizado" }, { status: 403 }) };
    }
  }
  const canSeeAll = tenant.isSuperAdmin || tenant.userRole === "owner" || tenant.userRole === "admin";
  if (!await isProposalVisibleToViewer(tenant.id, proposalId, tenant.userId, canSeeAll)) {
    return { error: NextResponse.json({ error: "Propuesta no encontrada" }, { status: 404 }) };
  }
  const invoice = await getProposalInvoiceStatusByTenant(tenant.id, proposalId);
  if (!invoice?.draftId || invoice.status !== "stamped" || !invoice.uuid || !invoice.xmlBase64) {
    return { error: NextResponse.json({ error: "Se requiere una factura timbrada" }, { status: 409 }) };
  }
  return {
    draftId: invoice.draftId,
    ...(feature === 'sat_status' ? {tenantId: tenant.id} : {}),
    environment: isDigestorFiscalSandboxTenant(tenant.id) ? 'sandbox' as const : 'production' as const,
  };
}

export function authorizeProposalPayments(proposalId: string, request?: Request) {
  return authorizeProposalFiscalDocument(proposalId, 'payments', request);
}

export function paymentFailure(error: unknown): NextResponse {
  const status = error instanceof DigestorHttpError && error.status === 409 ? 409 : 502;
  return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo confirmar la operación; consulta el estado antes de reintentar" }, { status });
}
