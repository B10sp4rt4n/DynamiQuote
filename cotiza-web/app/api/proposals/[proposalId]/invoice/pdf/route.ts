import { isProposalVisibleToViewer } from "@/lib/db/proposals";
import { renderToBuffer } from "@react-pdf/renderer";
import { NextResponse } from "next/server";

import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { fetchBillingDraftPdf, isDigestorFiscalEnabledForTenant, getFiscalCorrection, liveCancellation, getBillingCancellation } from "@/lib/integrations/digestor-fiscal";
import { getProposalInvoiceStatusByTenant } from "@/lib/db/proposal-invoices";
import { CfdiDocument } from "@/lib/pdf/cfdi-document";
import { buildCfdiQrDataUrl } from "@/lib/pdf/cfdi-qr";
import { parseCfdiXml } from "@/lib/pdf/cfdi-xml";
import { readInvoiceStamp } from "@/lib/domain/invoice-stamp";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ proposalId: string }>;
};

export async function GET(_: Request, context: RouteContext) {
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

  if (!invoice?.draftId) {
    return NextResponse.json({ error: "Esta propuesta no tiene una prefactura generada" }, { status: 404 });
  }

  // Ya timbrada: Cotiza arma su propia representacion impresa (con sellos,
  // QR, cadena original, etc.) a partir del XML real -- ya no depende del
  // PDF simplificado de Digestor Fiscal, que no trae esos elementos.
  if (invoice.status === "stamped" && invoice.xmlBase64) {
    try {
      if (!invoice.uuid) throw new Error("Falta el UUID de la factura");
      readInvoiceStamp(invoice.xmlBase64, invoice.uuid);
      const cfdi = parseCfdiXml(invoice.xmlBase64);
      const correction = process.env['DIGESTOR_FISCAL_CORRECTIONS_ENABLED'] === 'true'
        ? await getFiscalCorrection(invoice.draftId) : null;
      const sourceRevision = correction?.history.find(row => row.source_uuid.toLowerCase() === cfdi.timbre.uuid.toLowerCase());
      const pilot = process.env['DIGESTOR_FISCAL_LIVE_CANCEL_UUID']?.toLowerCase() === invoice.uuid?.toLowerCase()
        ? await liveCancellation(invoice.draftId,'read',invoice.uuid!) : null;
      const cancellation = process.env['DIGESTOR_FISCAL_CANCELLATION_ENABLED'] === 'true'
        ? await getBillingCancellation(invoice.draftId) : null;
      const qrDataUrl = await buildCfdiQrDataUrl(cfdi);
      const pdfBuffer = await renderToBuffer(CfdiDocument({ cfdi, proposalNumber: proposalId, qrDataUrl,
        fiscalStatus: sourceRevision?.source_cancellation_status ?? cancellation?.status ?? pilot?.status }));

      return new NextResponse(new Uint8Array(pdfBuffer), {
        headers: {
          "Cache-Control": "no-store",
          "Content-Disposition": `inline; filename="factura_${cfdi.timbre.uuid}.pdf"`,
          "Content-Type": "application/pdf",
        },
        status: 200,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error desconocido";
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  // Aun no timbrada: mostrar el preview/borrador que ya arma Digestor Fiscal
  // (marcado "PREFACTURA"), no hay datos oficiales que representar todavia.
  try {
    const pdfBuffer = await fetchBillingDraftPdf(invoice.draftId);
    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `inline; filename="prefactura_${proposalId}.pdf"`,
        "Content-Type": "application/pdf",
      },
      status: 200,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
