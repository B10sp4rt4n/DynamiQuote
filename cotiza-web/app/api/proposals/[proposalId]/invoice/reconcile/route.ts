import { NextResponse } from "next/server";

import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import {
  getProposalInvoiceStatusByTenant,
  markProposalInvoiceRejectedByTenant,
  markProposalInvoiceStampedByTenant,
} from "@/lib/db/proposal-invoices";
import {
  getBillingDraftStampResult,
  isDigestorFiscalEnabledForTenant,
} from "@/lib/integrations/digestor-fiscal";

type RouteContext = {
  params: Promise<{ proposalId: string }>;
};

// Solo consulta el resultado persistido en Digestor: NUNCA llama al PAC.
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
  if (invoice.status === "stamped") {
    return NextResponse.json({ status: "stamped", uuid: invoice.uuid }, { status: 200 });
  }
  if (!invoice.draftId || invoice.status !== "stamping") {
    return NextResponse.json({ error: "Esta propuesta no tiene un timbrado pendiente de conciliar" }, { status: 409 });
  }

  try {
    const result = await getBillingDraftStampResult(invoice.draftId);
    if (result.stampStatus === "stamped") {
      if (!result.uuid || !result.xmlBase64) {
        return NextResponse.json(
          { error: "Digestor indica timbrado, pero falta el UUID o XML. Requiere conciliación manual." },
          { status: 409 },
        );
      }
      const saved = await markProposalInvoiceStampedByTenant(
        tenant.id, proposalId, invoice.draftId, result.uuid, result.xmlBase64,
      );
      if (!saved) {
        return NextResponse.json({ error: "No fue posible actualizar el registro local. Vuelve a consultar." }, { status: 409 });
      }
      return NextResponse.json({ status: "stamped", uuid: result.uuid }, { status: 200 });
    }

    if (result.stampStatus === "rejected" || result.stampStatus === "not_sent") {
      const saved = await markProposalInvoiceRejectedByTenant(tenant.id, proposalId, invoice.draftId);
      if (!saved) {
        return NextResponse.json({ error: "El estado cambio mientras se conciliaba. Actualiza la pagina." }, { status: 409 });
      }
      return NextResponse.json({ status: "rejected" }, { status: 200 });
    }

    return NextResponse.json(
      {
        error: result.stampStatus === "processing"
          ? "Digestor sigue procesando el timbrado. Espera y consulta de nuevo."
          : "Digestor no puede confirmar el resultado del PAC. No reintentes: necesita conciliación manual.",
        status: "stamping",
      },
      { status: 409 },
    );
  } catch {
    return NextResponse.json(
      { error: "No fue posible consultar Digestor. La factura permanece protegida; no vuelvas a timbrar." },
      { status: 502 },
    );
  }
}
