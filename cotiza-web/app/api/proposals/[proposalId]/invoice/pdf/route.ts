import { renderToBuffer } from "@react-pdf/renderer";
import { NextResponse } from "next/server";

import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { fetchBillingDraftPdf, isDigestorFiscalEnabledForTenant } from "@/lib/integrations/digestor-fiscal";
import { getProposalInvoiceStatusByTenant } from "@/lib/db/proposal-invoices";
import { CfdiDocument } from "@/lib/pdf/cfdi-document";
import { buildCfdiQrDataUrl } from "@/lib/pdf/cfdi-qr";
import { parseCfdiXml } from "@/lib/pdf/cfdi-xml";

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
  const invoice = await getProposalInvoiceStatusByTenant(tenant.id, proposalId);

  if (!invoice?.draftId) {
    return NextResponse.json({ error: "Esta propuesta no tiene una prefactura generada" }, { status: 404 });
  }

  // Ya timbrada: Cotiza arma su propia representacion impresa (con sellos,
  // QR, cadena original, etc.) a partir del XML real -- ya no depende del
  // PDF simplificado de Digestor Fiscal, que no trae esos elementos.
  if (invoice.status === "stamped" && invoice.xmlBase64) {
    try {
      const cfdi = parseCfdiXml(invoice.xmlBase64);
      const qrDataUrl = await buildCfdiQrDataUrl(cfdi);
      const pdfBuffer = await renderToBuffer(CfdiDocument({ cfdi, proposalNumber: proposalId, qrDataUrl }));

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
