import "server-only";

import { prisma } from "@/lib/db/prisma";

export type ProposalInvoiceStatus = "draft" | "stamped" | "rejected" | null;

export type ProposalInvoiceInfo = {
  draftId: string | null;
  stampedAt: string | null;
  status: ProposalInvoiceStatus;
  uuid: string | null;
  xmlBase64: string | null;
};

function normalizeInvoiceStatus(value: string | null): ProposalInvoiceStatus {
  return value === "draft" || value === "stamped" || value === "rejected" ? value : null;
}

export async function getProposalInvoiceStatusByTenant(
  tenantId: string,
  proposalId: string,
): Promise<ProposalInvoiceInfo | null> {
  const row = await prisma.proposals.findFirst({
    select: {
      invoice_draft_id: true,
      invoice_stamped_at: true,
      invoice_status: true,
      invoice_uuid: true,
      invoice_xml_base64: true,
    },
    where: { proposal_id: proposalId, tenant_id: tenantId },
  });

  if (!row) {
    return null;
  }

  return {
    draftId: row.invoice_draft_id,
    stampedAt: row.invoice_stamped_at ? row.invoice_stamped_at.toISOString() : null,
    status: normalizeInvoiceStatus(row.invoice_status),
    uuid: row.invoice_uuid,
    xmlBase64: row.invoice_xml_base64,
  };
}

export async function saveProposalInvoiceDraftByTenant(
  tenantId: string,
  proposalId: string,
  draftId: string,
): Promise<void> {
  await prisma.proposals.updateMany({
    data: { invoice_draft_id: draftId, invoice_status: "draft" },
    where: { proposal_id: proposalId, tenant_id: tenantId },
  });
}

export async function markProposalInvoiceStampedByTenant(
  tenantId: string,
  proposalId: string,
  uuid: string | null,
  xmlBase64: string | null,
): Promise<void> {
  await prisma.proposals.updateMany({
    data: {
      invoice_stamped_at: new Date(),
      invoice_status: uuid ? "stamped" : "rejected",
      invoice_uuid: uuid,
      invoice_xml_base64: xmlBase64,
    },
    where: { proposal_id: proposalId, tenant_id: tenantId },
  });
}

export type ClientFiscalData = {
  cfdiUse: string | null;
  clientId: string;
  company: string;
  fiscalRegime: string | null;
  rfc: string | null;
  zipCode: string | null;
};

// Resuelve el cliente de catalogo ligado a una propuesta (via
// proposals.origin -> quotes.client_id, mismo camino que Vista 360) para
// prellenar el formulario de facturacion con lo que ya se haya capturado.
export async function getClientFiscalDataForProposalByTenant(
  tenantId: string,
  proposalId: string,
): Promise<ClientFiscalData | null> {
  const proposal = await prisma.proposals.findFirst({
    select: {
      origin: true,
      formal_proposals: {
        orderBy: [{ created_at: "desc" }, { proposal_doc_id: "desc" }],
        select: { quote_id: true },
        take: 1,
      },
    },
    where: { proposal_id: proposalId, tenant_id: tenantId },
  });

  if (!proposal) {
    return null;
  }

  const linkedQuoteId = proposal.formal_proposals[0]?.quote_id ?? proposal.origin;
  if (!linkedQuoteId) {
    return null;
  }

  const quote = await prisma.quote.findFirst({
    select: {
      client: {
        select: {
          cfdi_use: true,
          client_id: true,
          company: true,
          fiscal_regime: true,
          rfc: true,
          zip_code: true,
        },
      },
    },
    where: { quote_id: linkedQuoteId, tenantId },
  });

  if (!quote?.client) {
    return null;
  }

  return {
    cfdiUse: quote.client.cfdi_use,
    clientId: quote.client.client_id,
    company: quote.client.company,
    fiscalRegime: quote.client.fiscal_regime,
    rfc: quote.client.rfc,
    zipCode: quote.client.zip_code,
  };
}
