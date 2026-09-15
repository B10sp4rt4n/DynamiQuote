import { NextResponse } from "next/server";

import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import {
  createBillingDraft,
  isDigestorFiscalEnabledForTenant,
} from "@/lib/integrations/digestor-fiscal";
import { updateClientForTenant } from "@/lib/db/clients";
import {
  getClientFiscalDataForProposalByTenant,
  getProposalInvoiceStatusByTenant,
  saveProposalInvoiceDraftByTenant,
} from "@/lib/db/proposal-invoices";
import { getProposalWorkflowByTenant } from "@/lib/db/proposals";
import { getTenantProfileByTenant } from "@/lib/db/tenants";
import { createProposalInvoiceSchema } from "@/lib/validations/proposal-invoice";

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
  const [invoice, clientFiscalData] = await Promise.all([
    getProposalInvoiceStatusByTenant(tenant.id, proposalId),
    getClientFiscalDataForProposalByTenant(tenant.id, proposalId),
  ]);

  if (!invoice) {
    return NextResponse.json({ error: "Propuesta no encontrada" }, { status: 404 });
  }

  return NextResponse.json({ clientFiscalData, invoice }, { status: 200 });
}

export async function POST(request: Request, context: RouteContext) {
  const tenant = await getCurrentTenantContext();
  if (!tenant) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (!isDigestorFiscalEnabledForTenant(tenant.id)) {
    return NextResponse.json({ error: "La facturación no está habilitada para este tenant" }, { status: 403 });
  }

  const { proposalId } = await context.params;
  const parsed = createProposalInvoiceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Payload invalido" }, { status: 422 });
  }

  const proposal = await getProposalWorkflowByTenant(tenant.id, proposalId);
  if (!proposal) {
    return NextResponse.json({ error: "Propuesta no encontrada" }, { status: 404 });
  }

  if (proposal.outcome !== "won") {
    return NextResponse.json(
      { error: "Solo se puede facturar una propuesta marcada como Ganada" },
      { status: 422 },
    );
  }

  const tenantProfile = await getTenantProfileByTenant(tenant.id);
  const emitterRfc = tenantProfile?.rfc?.trim();
  const emitterRegimen = tenantProfile?.fiscalRegime?.trim();
  const placeOfIssue = tenantProfile?.fiscalZipCode?.trim();
  const emitterName = tenantProfile?.razonSocial?.trim() || tenant.name;

  if (!emitterRfc || !emitterRegimen || !placeOfIssue) {
    return NextResponse.json(
      {
        error:
          "Faltan datos fiscales del emisor (RFC, régimen fiscal o código postal de expedición). Complétalos en Configuración > Datos fiscales del emisor.",
      },
      { status: 422 },
    );
  }

  if (proposal.items.length === 0) {
    return NextResponse.json({ error: "La propuesta no tiene partidas para facturar" }, { status: 422 });
  }

  const currency = proposal.formal?.currency;
  if (!currency) {
    return NextResponse.json(
      { error: "La propuesta no tiene moneda definida. Elígela en el editor de la propuesta antes de facturar." },
      { status: 422 },
    );
  }

  const input = parsed.data;

  try {
    const draft = await createBillingDraft({
      currency,
      customerName: input.customerName,
      customerRegimen: input.customerRegimen,
      customerRfc: input.customerRfc,
      customerUseCfdi: input.customerUseCfdi,
      customerZip: input.customerZip,
      emitterName,
      emitterRegimen,
      emitterRfc,
      items: proposal.items.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.priceUnit,
      })),
      notes: input.notes ?? `Propuesta ${proposal.proposalId}`,
      paymentForm: input.paymentForm,
      paymentMethod: input.paymentMethod,
      placeOfIssue,
    });

    await saveProposalInvoiceDraftByTenant(tenant.id, proposalId, draft.id);

    if (input.saveToClient) {
      const clientFiscalData = await getClientFiscalDataForProposalByTenant(tenant.id, proposalId);
      if (clientFiscalData) {
        await updateClientForTenant(clientFiscalData.clientId, tenant.id, {
          cfdiUse: input.customerUseCfdi,
          fiscalRegime: input.customerRegimen,
          rfc: input.customerRfc,
          zipCode: input.customerZip,
        }).catch(() => null);
      }
    }

    return NextResponse.json({ draft }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido al generar la prefactura";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
