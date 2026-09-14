import { NextResponse } from "next/server";

import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { fetchBillingDraftPreviewHtml, isDigestorFiscalEnabledForTenant } from "@/lib/integrations/digestor-fiscal";
import { getProposalInvoiceStatusByTenant } from "@/lib/db/proposal-invoices";

type RouteContext = {
  params: Promise<{ proposalId: string }>;
};

// Digestor Fiscal exige Bearer para /preview -- Cotiza lo proxea aqui para
// que el navegador nunca vea el token.
export async function GET(_: Request, context: RouteContext) {
  const tenant = await getCurrentTenantContext();
  if (!tenant) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (!isDigestorFiscalEnabledForTenant(tenant.id)) {
    return NextResponse.json({ error: "La facturación no está habilitada para este tenant" }, { status: 403 });
  }

  const { proposalId } = await context.params;
  const invoice = await getProposalInvoiceStatusByTenant(tenant.id, proposalId);

  if (!invoice?.draftId) {
    return NextResponse.json({ error: "Esta propuesta no tiene una prefactura generada" }, { status: 404 });
  }

  try {
    const html = await fetchBillingDraftPreviewHtml(invoice.draftId);
    return new NextResponse(html, {
      headers: { "Cache-Control": "no-store", "Content-Type": "text/html; charset=utf-8" },
      status: 200,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
