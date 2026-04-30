import type { Prisma } from "@prisma/client";

import type {
  EmisorProfileEntity,
  ProposalEntity,
  QuoteClassificationOne,
  QuoteEntity,
  QuoteLineEntity,
} from "@/lib/domain/entities";

type QuoteRecord = Prisma.QuoteGetPayload<{}>;
type QuoteLineRecord = Prisma.quote_linesGetPayload<{}>;
type ProposalRecord = Prisma.proposalsGetPayload<{}>;
type FormalProposalRecord = Prisma.formal_proposalsGetPayload<{}>;
type CompanyLogoRecord = Prisma.company_logosGetPayload<{}>;

function parseDecimal(value: { toNumber: () => number } | null | undefined): number | null {
  return value ? value.toNumber() : null;
}

function resolveClassificationOne(lineType: string | null): QuoteClassificationOne {
  return lineType?.toLowerCase() === "service" ? "service" : "product";
}

export function mapQuoteToDomain(quote: QuoteRecord): QuoteEntity {
  return {
    id: quote.quote_id,
    groupId: quote.quote_group_id ?? quote.quote_id,
    tenantId: quote.tenantId ?? "",
    code: quote.quote_id,
    version: quote.version ?? 1,
    clientName: quote.client_name,
    proposalName: quote.proposal_name,
    quotedBy: quote.quoted_by,
    totalCost: parseDecimal(quote.total_cost),
    totalRevenue: parseDecimal(quote.total_revenue),
    grossProfit: parseDecimal(quote.gross_profit),
    avgMargin: parseDecimal(quote.avg_margin),
    createdAt: quote.createdAt?.toISOString() ?? null,
  };
}

export function mapQuoteLineToDomain(line: QuoteLineRecord): QuoteLineEntity {
  return {
    id: line.line_id,
    quoteId: line.quote_id ?? "",
    sku: line.sku,
    description: line.description_final ?? line.description_original ?? "Sin descripcion",
    quantity: parseDecimal(line.quantity) ?? 1,
    costUnit: parseDecimal(line.cost_unit) ?? 0,
    priceUnit: parseDecimal(line.final_price_unit),
    marginPct: parseDecimal(line.margin_pct),
    classification1: resolveClassificationOne(line.line_type),
    classification2: line.service_origin,
  };
}

export function mapProposalToDomain(proposal: ProposalRecord): ProposalEntity {
  return {
    id: proposal.proposal_id,
    tenantId: proposal.tenant_id,
    code: proposal.proposal_id,
    origin: proposal.origin,
    status: normalizeProposalStatus(proposal.status),
    createdBy: proposal.created_by,
    createdAt: proposal.created_at.toISOString(),
    closedAt: proposal.closed_at?.toISOString() ?? null,
  };
}

export function mapFormalProposalToEmisorProfile(
  proposal: FormalProposalRecord,
  logo: CompanyLogoRecord | null,
): EmisorProfileEntity | null {
  if (!proposal.tenant_id || !proposal.issuer_company) {
    return null;
  }

  return {
    id: logo?.logo_id ?? proposal.proposal_doc_id,
    tenantId: proposal.tenant_id,
    name: logo?.logo_name ?? proposal.issuer_company,
    companyName: proposal.issuer_company,
    logoFormat: logo?.logo_format ?? null,
    isDefault: logo?.is_default ?? false,
  };
}

function normalizeProposalStatus(status: string): ProposalEntity["status"] {
  const normalized = status.toLowerCase();

  if (normalized === "enviada" || normalized === "sent") {
    return "sent";
  }

  if (normalized === "en_revision" || normalized === "in_review") {
    return "in_review";
  }

  if (normalized === "aprobada" || normalized === "approved") {
    return "approved";
  }

  if (normalized === "rechazada" || normalized === "rejected") {
    return "rejected";
  }

  if (normalized === "vencida" || normalized === "expired") {
    return "expired";
  }

  return "draft";
}
