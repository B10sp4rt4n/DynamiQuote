import { NextResponse } from "next/server";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { isProposalVisibleToViewer } from "@/lib/db/proposals";
import { getProposalInvoiceStatusByTenant } from "@/lib/db/proposal-invoices";
import { isDigestorFiscalEnabledForTenant } from "@/lib/integrations/digestor-fiscal";
import { readInvoiceStamp } from "@/lib/domain/invoice-stamp";

export const runtime = "nodejs";

export async function GET(_: Request, context: { params: Promise<{ proposalId: string }> }) {
  const tenant = await getCurrentTenantContext();
  if (!tenant) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!isDigestorFiscalEnabledForTenant(tenant.id))
    return NextResponse.json({ error: "La facturación no está habilitada para este tenant" }, { status: 403 });
  const { proposalId } = await context.params;
  const canSeeAll = tenant.isSuperAdmin || tenant.userRole === "owner" || tenant.userRole === "admin";
  if (!await isProposalVisibleToViewer(tenant.id, proposalId, tenant.userId, canSeeAll))
    return NextResponse.json({ error: "Propuesta no encontrada" }, { status: 404 });
  const invoice = await getProposalInvoiceStatusByTenant(tenant.id, proposalId);
  if (invoice?.status !== "stamped" || !invoice.uuid || !invoice.xmlBase64)
    return NextResponse.json({ error: "No hay un XML timbrado disponible" }, { status: 404 });
  try {
    const { bytes, uuid } = readInvoiceStamp(invoice.xmlBase64, invoice.uuid);
    return new NextResponse(new Uint8Array(bytes), { headers: {
      "Cache-Control": "no-store", "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="factura_${uuid}.xml"`,
      "X-Content-Type-Options": "nosniff",
    } });
  } catch {
    return NextResponse.json({ error: "El XML no coincide con el UUID registrado. Requiere revisión." }, { status: 409 });
  }
}
