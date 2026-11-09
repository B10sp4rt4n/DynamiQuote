import { NextResponse } from "next/server";
import { z } from "zod";
import { INVOICE_UUID_PATTERN, readInvoiceStamp } from "@/lib/domain/invoice-stamp";

import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { isProposalVisibleToViewer } from "@/lib/db/proposals";
import {
  getProposalInvoiceStatusByTenant,
  markProposalInvoiceRejectedByTenant,
  markProposalInvoiceStampedByTenant,
} from "@/lib/db/proposal-invoices";
import {
  getBillingDraftStampResult,
  isDigestorFiscalEnabledForTenant,
  recoverBillingDraftStampResult,
} from "@/lib/integrations/digestor-fiscal";

type RouteContext = {
  params: Promise<{ proposalId: string }>;
};

// Consulta Digestor sin solicitar otro timbre y concilia el estado local.
export async function POST(request: Request, context: RouteContext) {
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
  const raw = await request.text();
  const input = z.object({ expectedDraftId: z.string().min(1).max(128), invoiceUuid: z.string().regex(INVOICE_UUID_PATTERN), confirm: z.literal(true) }).strict()
    .safeParse(raw ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : null);
  if (raw && !input.success) return NextResponse.json({ error: "Revisa el UUID y confirma la recuperación" }, { status: 422 });
  if (input.success && input.data.expectedDraftId !== invoice.draftId) return NextResponse.json({ error: "La prefactura cambió. Recarga antes de recuperar" }, { status: 409 });
  if (invoice.status === "stamped") {
    if (input.success && invoice.uuid?.toLowerCase() !== input.data.invoiceUuid.toLowerCase())
      return NextResponse.json({ error: "Esta factura ya tiene otro UUID" }, { status: 409 });
    return NextResponse.json({ status: "stamped", uuid: invoice.uuid }, { status: 200 });
  }
  if (!invoice.draftId || invoice.status !== "stamping") {
    return NextResponse.json({ error: "Esta propuesta no tiene un timbrado pendiente de conciliar" }, { status: 409 });
  }

  try {
    const recovered = input.success ? await recoverBillingDraftStampResult(invoice.draftId, input.data.invoiceUuid) : null;
    const result = recovered ? { stampStatus: recovered.stamp_status, uuid: recovered.uuid, xmlBase64: recovered.xml_base64 }
      : await getBillingDraftStampResult(invoice.draftId);
    if (result.stampStatus === "stamped") {
      if (!result.uuid || !result.xmlBase64) {
        return NextResponse.json(
          { error: "Digestor indica timbrado, pero falta el UUID o XML. Requiere conciliación manual." },
          { status: 409 },
        );
      }
      if (input.success && result.uuid.toLowerCase() !== input.data.invoiceUuid.toLowerCase()) {
        return NextResponse.json({ error: "El proveedor devolvió un UUID diferente al confirmado. La factura permanece protegida." }, { status: 502 });
      }
      readInvoiceStamp(result.xmlBase64, result.uuid);
      const saved = await markProposalInvoiceStampedByTenant(
        tenant.id, proposalId, invoice.draftId, result.uuid, result.xmlBase64,
      );
      if (!saved) {
        return NextResponse.json({ error: "No fue posible actualizar el registro local. Vuelve a consultar." }, { status: 409 });
      }
      return NextResponse.json({ status: "stamped", uuid: result.uuid }, { status: 200 });
    }

    if (result.stampStatus === "rejected" && !result.uuid && !result.xmlBase64) {
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
