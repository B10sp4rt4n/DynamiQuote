import "server-only";

import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";

import {
  resolveBidirectionalPricing,
  type BidirectionalPricingInput,
} from "@/lib/domain/pricing-engine";
import { prisma } from "@/lib/db/prisma";
import type { QuoteLineEditorInput } from "@/lib/validations/quote-editor";

export type EditableQuoteLine = {
  classification1: "product" | "service";
  classification2: string;
  costUnit: number;
  description: string;
  lineId: string;
  marginPct: number;
  priceUnit: number;
  quantity: number;
  sku: string | null;
};

export type UpdatedQuoteTotals = {
  avgMargin: number;
  grossProfit: number;
  totalCost: number;
  totalRevenue: number;
};

export type UpdatedQuoteVersion = {
  avgMargin: number;
  clientName: string;
  createdAt: string;
  playbookName: string | null;
  proposalName: string;
  quoteGroupId: string;
  quoteId: string;
  status: string;
  totalRevenue: number;
  version: number;
  versionCount: number;
};

export type QuoteVersionHistoryItem = {
  avgMargin: number | null;
  closedAt: string | null;
  createdAt: string | null;
  quoteId: string;
  rejectedAt: string | null;
  sentAt: string | null;
  status: string;
  totalRevenue: number | null;
  version: number;
};

export type QuoteVersionsByGroup = {
  currentQuoteId: string;
  quoteGroupId: string;
  versions: QuoteVersionHistoryItem[];
};

type SourceQuoteLine = {
  created_at: Date | null;
  description_corrections: string | null;
  description_final: string | null;
  description_original: string | null;
  import_batch_id: string | null;
  import_source: string | null;
  line_id: string;
  sku: string | null;
  strategy: string | null;
  warnings: string | null;
};

type ResolvedLine = {
  classification1: "product" | "service";
  classification2: string;
  costUnit: number;
  description: string;
  lineId: string;
  marginPct: number;
  priceUnit: number;
  quantity: number;
  sku: string;
  sourceLine?: SourceQuoteLine;
};

function decimalToNumber(value: Prisma.Decimal | null | undefined): number {
  return value ? value.toNumber() : 0;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeQuantity(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.max(1, Math.round(value));
}

function resolveClassificationOne(lineType: string | null): "product" | "service" {
  return lineType?.toLowerCase() === "service" ? "service" : "product";
}

function buildVersionedQuoteId(quoteGroupId: string, version: number): string {
  return `${quoteGroupId}-v${version}-${randomUUID().slice(0, 8)}`;
}

function resolvePricingInput(line: QuoteLineEditorInput): BidirectionalPricingInput {
  if (line.mode === "price") {
    return {
      costUnit: line.costUnit,
      priceUnit: line.priceUnit,
    };
  }

  return {
    costUnit: line.costUnit,
    marginPct: line.marginPct,
  };
}

export async function getEditableQuoteLinesByTenant(
  tenantId: string,
  quoteId: string,
): Promise<EditableQuoteLine[] | null> {
  const quote = await prisma.quote.findFirst({
    select: { quote_id: true },
    where: {
      quote_id: quoteId,
      tenantId,
    },
  });

  if (!quote) {
    return null;
  }

  const lines = await prisma.quote_lines.findMany({
    orderBy: [{ created_at: "asc" }, { line_id: "asc" }],
    select: {
      cost_unit: true,
      description_final: true,
      description_original: true,
      final_price_unit: true,
      line_id: true,
      line_type: true,
      margin_pct: true,
      quantity: true,
      service_origin: true,
      sku: true,
    },
    where: {
      quote_id: quoteId,
    },
  });

  return lines.map((line) => ({
    classification1: resolveClassificationOne(line.line_type),
    classification2: line.service_origin ?? "",
    costUnit: decimalToNumber(line.cost_unit),
    description: line.description_final ?? line.description_original ?? "",
    lineId: line.line_id,
    marginPct: decimalToNumber(line.margin_pct),
    priceUnit: decimalToNumber(line.final_price_unit),
    quantity: normalizeQuantity(decimalToNumber(line.quantity)),
    sku: line.sku,
  }));
}

export async function updateQuoteLinesByTenant(
  tenantId: string,
  quoteId: string,
  inputLines: QuoteLineEditorInput[],
): Promise<
  { lines: EditableQuoteLine[]; quote: UpdatedQuoteVersion; totals: UpdatedQuoteTotals } | null
> {
  const quote = await prisma.quote.findFirst({
    select: {
      client_name: true,
      created_by_user_id: true,
      playbook_name: true,
      proposal_name: true,
      quote_group_id: true,
      quote_id: true,
      quoted_by: true,
      status: true,
      version: true,
    },
    where: {
      quote_id: quoteId,
      tenantId,
    },
  });

  if (!quote) {
    return null;
  }

  const quoteGroupId = quote.quote_group_id ?? quote.quote_id;

  const latestInGroup = await prisma.quote.findFirst({
    orderBy: [{ version: "desc" }, { createdAt: "desc" }],
    select: { version: true },
    where: {
      quote_group_id: quoteGroupId,
      tenantId,
    },
  });

  const nextVersion = (latestInGroup?.version ?? quote.version ?? 1) + 1;
  const newQuoteId = buildVersionedQuoteId(quoteGroupId, nextVersion);
  const quoteCountInGroup = await prisma.quote.count({
    where: {
      quote_group_id: quoteGroupId,
      tenantId,
    },
  });

  const lineIds = inputLines.map((line) => line.lineId);

  const existing = await prisma.quote_lines.findMany({
    select: {
      created_at: true,
      description_corrections: true,
      description_final: true,
      description_original: true,
      import_batch_id: true,
      import_source: true,
      line_id: true,
      sku: true,
      strategy: true,
      warnings: true,
    },
    where: {
      line_id: { in: lineIds },
      quote_id: quoteId,
    },
  });

  const existingById = new Map(existing.map((line) => [line.line_id, line]));

  const resolvedLines: ResolvedLine[] = inputLines.map((line) => {
    const pricing = resolveBidirectionalPricing(resolvePricingInput(line));
    const sourceLine = existingById.get(line.lineId);

    const description =
      line.description?.trim() ?? sourceLine?.description_final ?? sourceLine?.description_original ?? "";
    const sku = line.sku?.trim() ?? sourceLine?.sku ?? "";

    return {
      classification1: line.classification1,
      classification2: line.classification2?.trim() ?? "",
      costUnit: round(pricing.costUnit),
      description,
      lineId: line.lineId,
      marginPct: round(pricing.marginPct),
      priceUnit: round(pricing.priceUnit),
      quantity: normalizeQuantity(line.quantity),
      sku,
      sourceLine,
    };
  });

  const totalCost = round(
    resolvedLines.reduce((sum, line) => sum + line.quantity * line.costUnit, 0),
  );
  const totalRevenue = round(
    resolvedLines.reduce((sum, line) => sum + line.quantity * line.priceUnit, 0),
  );
  const grossProfit = round(totalRevenue - totalCost);
  const avgMargin = totalRevenue > 0 ? round((grossProfit / totalRevenue) * 100) : 0;
  const createdAt = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.quote.create({
      data: {
        avg_margin: avgMargin,
        client_name: quote.client_name,
        created_by_user_id: quote.created_by_user_id,
        createdAt,
        gross_profit: grossProfit,
        parent_quote_id: quote.quote_id,
        playbook_name: quote.playbook_name,
        proposal_name: quote.proposal_name,
        quote_group_id: quoteGroupId,
        quote_id: newQuoteId,
        quoted_by: quote.quoted_by,
        status: "draft",
        tenantId,
        total_cost: totalCost,
        total_revenue: totalRevenue,
        version: nextVersion,
      },
    });

    for (const line of resolvedLines) {
      const sourceLine: SourceQuoteLine | undefined = line.sourceLine;

      await tx.quote_lines.create({
        data: {
          cost_unit: line.costUnit,
          created_at: createdAt,
          description_corrections: sourceLine?.description_corrections ?? null,
          description_final: line.description || null,
          description_original: line.description || null,
          final_price_unit: line.priceUnit,
          import_batch_id: sourceLine?.import_batch_id ?? null,
          import_source: sourceLine?.import_source ?? "manual",
          line_id: randomUUID(),
          line_type: line.classification1 === "service" ? "service" : "product",
          margin_pct: line.marginPct,
          quantity: line.quantity,
          quote_id: newQuoteId,
          service_origin: line.classification2 || null,
          sku: line.sku || null,
          strategy: sourceLine?.strategy ?? null,
          warnings: sourceLine?.warnings ?? null,
        },
      });
    }
  });

  const freshLines = await getEditableQuoteLinesByTenant(tenantId, newQuoteId);

  if (!freshLines) {
    return null;
  }

  return {
    lines: freshLines,
    quote: {
      avgMargin,
      clientName: quote.client_name ?? "Sin cliente",
      createdAt: createdAt.toISOString(),
      playbookName: quote.playbook_name ?? null,
      proposalName: quote.proposal_name ?? "Sin propuesta",
      quoteGroupId,
      quoteId: newQuoteId,
      status: "draft",
      totalRevenue,
      version: nextVersion,
      versionCount: quoteCountInGroup + 1,
    },
    totals: {
      avgMargin,
      grossProfit,
      totalCost,
      totalRevenue,
    },
  };
}

export async function getQuoteVersionsByTenant(
  tenantId: string,
  quoteId: string,
): Promise<QuoteVersionsByGroup | null> {
  const quote = await prisma.quote.findFirst({
    select: {
      quote_group_id: true,
      quote_id: true,
    },
    where: {
      quote_id: quoteId,
      tenantId,
    },
  });

  if (!quote) {
    return null;
  }

  const quoteGroupId = quote.quote_group_id ?? quote.quote_id;

  const versions = await prisma.quote.findMany({
    orderBy: [{ version: "desc" }, { createdAt: "desc" }],
    select: {
      avg_margin: true,
      closed_at: true,
      createdAt: true,
      quote_id: true,
      rejected_at: true,
      sent_at: true,
      status: true,
      total_revenue: true,
      version: true,
    },
    where: {
      quote_group_id: quoteGroupId,
      tenantId,
    },
  });

  return {
    currentQuoteId: quote.quote_id,
    quoteGroupId,
    versions: versions.map((item) => ({
      avgMargin: item.avg_margin ? item.avg_margin.toNumber() : null,
      closedAt: item.closed_at ? item.closed_at.toISOString() : null,
      createdAt: item.createdAt ? item.createdAt.toISOString() : null,
      quoteId: item.quote_id,
      rejectedAt: item.rejected_at ? item.rejected_at.toISOString() : null,
      sentAt: item.sent_at ? item.sent_at.toISOString() : null,
      status: item.status ?? "draft",
      totalRevenue: item.total_revenue ? item.total_revenue.toNumber() : null,
      version: item.version ?? 1,
    })),
  };
}

// Selecciona los campos de versión extendida reutilizables en varias funciones
const versionSelect = {
  avg_margin: true,
  closed_at: true,
  createdAt: true,
  quote_id: true,
  rejected_at: true,
  sent_at: true,
  status: true,
  total_revenue: true,
  version: true,
} as const;

function mapVersionRow(item: {
  avg_margin: import("@prisma/client").Prisma.Decimal | null;
  closed_at: Date | null;
  createdAt: Date | null;
  quote_id: string;
  rejected_at: Date | null;
  sent_at: Date | null;
  status: string | null;
  total_revenue: import("@prisma/client").Prisma.Decimal | null;
  version: number | null;
}): QuoteVersionHistoryItem {
  return {
    avgMargin: item.avg_margin ? item.avg_margin.toNumber() : null,
    closedAt: item.closed_at ? item.closed_at.toISOString() : null,
    createdAt: item.createdAt ? item.createdAt.toISOString() : null,
    quoteId: item.quote_id,
    rejectedAt: item.rejected_at ? item.rejected_at.toISOString() : null,
    sentAt: item.sent_at ? item.sent_at.toISOString() : null,
    status: item.status ?? "draft",
    totalRevenue: item.total_revenue ? item.total_revenue.toNumber() : null,
    version: item.version ?? 1,
  };
}

// Marca una cotización como enviada. Solo es posible si el estado actual es "draft".
export async function markQuoteAsSentByTenant(
  tenantId: string,
  quoteId: string,
  userId: string,
): Promise<{ sentAt: string; status: string } | null> {
  const quote = await prisma.quote.findFirst({
    select: { quote_id: true, status: true },
    where: { quote_id: quoteId, tenantId },
  });

  if (!quote || quote.status !== "draft") {
    return null;
  }

  const sentAt = new Date();

  await prisma.quote.update({
    data: { sent_at: sentAt, sent_by: userId, status: "sent" },
    where: { quote_id: quoteId },
  });

  return { sentAt: sentAt.toISOString(), status: "sent" };
}

// Cierra una versión de cotización. Solo permite un cierre por grupo.
// Estado previo admitido: draft o sent.
export async function closeQuoteVersionByTenant(
  tenantId: string,
  quoteId: string,
  userId: string,
  reason?: string,
): Promise<{ affectedProposals: NudgedProposalResult[]; closedAt: string; status: string } | null> {
  const quote = await prisma.quote.findFirst({
    select: { quote_group_id: true, quote_id: true, status: true },
    where: { quote_id: quoteId, tenantId },
  });

  if (!quote || (quote.status !== "draft" && quote.status !== "sent")) {
    return null;
  }

  const quoteGroupId = quote.quote_group_id ?? quote.quote_id;

  const existingClosed = await prisma.quote.findFirst({
    select: { quote_id: true },
    where: {
      quote_group_id: quoteGroupId,
      quote_id: { not: quoteId },
      status: "closed",
      tenantId,
    },
  });

  if (existingClosed) {
    return null;
  }

  const closedAt = new Date();

  await prisma.quote.update({
    data: {
      closed_at: closedAt,
      closed_by: userId,
      closed_reason: reason ?? null,
      status: "closed",
    },
    where: { quote_id: quoteId },
  });

  // Efecto secundario: mover propuestas "sent" vinculadas al grupo a "in_review".
  // Si falla, no bloquea el cierre de la cotización.
  let affectedProposals: NudgedProposalResult[] = [];
  try {
    affectedProposals = await nudgeLinkedProposalsOnQuoteClosed(tenantId, quoteGroupId, userId);
  } catch {
    // intencional: el nudge es best-effort
  }

  return { affectedProposals, closedAt: closedAt.toISOString(), status: "closed" };
}

// Rechaza una versión de cotización. Estado previo admitido: draft o sent.
export async function rejectQuoteVersionByTenant(
  tenantId: string,
  quoteId: string,
  userId: string,
  reason?: string,
): Promise<{ rejectedAt: string; status: string } | null> {
  const quote = await prisma.quote.findFirst({
    select: { quote_id: true, status: true },
    where: { quote_id: quoteId, tenantId },
  });

  if (!quote || (quote.status !== "draft" && quote.status !== "sent")) {
    return null;
  }

  const rejectedAt = new Date();

  await prisma.quote.update({
    data: {
      closed_reason: reason ?? null,
      rejected_at: rejectedAt,
      rejected_by: userId,
      status: "rejected",
    },
    where: { quote_id: quoteId },
  });

  return { rejectedAt: rejectedAt.toISOString(), status: "rejected" };
}

// Tipo que describe una propuesta que fue movida a in_review como efecto del cierre.
export type NudgedProposalResult = {
  previousStatus: string;
  proposalId: string;
};

// Busca propuestas activas vinculadas al grupo de cotización (por origin o por
// formal_proposals.quote_id) y transiciona aquellas en estado "sent" a "in_review".
// Solo "sent → in_review" es una transición válida según allowedTransitions.
// Draft no puede ir directo a in_review, se deja intacta.
// Escribe un evento de auditoría en proposal_audit_events por cada propuesta tocada.
// Esta función nunca lanza — errores se capturan para no bloquear el cierre de la cotización.
async function nudgeLinkedProposalsOnQuoteClosed(
  tenantId: string,
  quoteGroupId: string,
  closedBy: string,
): Promise<NudgedProposalResult[]> {
  // Obtener todos los quote_ids del grupo
  const quotesInGroup = await prisma.quote.findMany({
    select: { quote_id: true },
    where: { quote_group_id: quoteGroupId, tenantId },
  });

  const quoteIds = quotesInGroup.map((q) => q.quote_id);
  if (quoteIds.length === 0) return [];

  // Buscar propuestas "sent" vinculadas al grupo.
  // Vínculo: proposals.origin ∈ quoteIds  O  formal_proposals.quote_id ∈ quoteIds
  const proposals = await prisma.proposals.findMany({
    select: { proposal_id: true, status: true },
    where: {
      status: "sent", // único estado que puede transicionar a in_review sin pasar por sent
      tenant_id: tenantId,
      OR: [
        { origin: { in: quoteIds } },
        { formal_proposals: { some: { quote_id: { in: quoteIds } } } },
      ],
    },
  });

  if (proposals.length === 0) return [];

  const now = new Date();
  const touched: NudgedProposalResult[] = [];

  for (const proposal of proposals) {
    await prisma.$transaction([
      prisma.proposals.update({
        data: { status: "in_review" },
        where: { proposal_id: proposal.proposal_id },
      }),
      prisma.formal_proposals.updateMany({
        data: { status: "in_review", updated_at: now },
        where: { proposal_id: proposal.proposal_id, tenant_id: tenantId },
      }),
      prisma.proposal_audit_events.create({
        data: {
          created_at: now,
          event_hash: randomUUID(),
          event_id: randomUUID(),
          event_type: "quote_closed_nudge",
          payload: JSON.stringify({
            closedBy,
            quoteGroupId,
            transition: `${proposal.status} → in_review`,
          }),
          proposal_id: proposal.proposal_id,
          tenant_id: tenantId,
        },
      }),
    ]);

    touched.push({ previousStatus: proposal.status, proposalId: proposal.proposal_id });
  }

  return touched;
}

// Retorna la versión base de comparación para un grupo:
// Prioridad: closed → sent → versión anterior más reciente → null.
export async function getComparisonBaseForQuoteGroup(
  tenantId: string,
  quoteGroupId: string,
  excludeQuoteId?: string,
): Promise<QuoteVersionHistoryItem | null> {
  const baseWhere = {
    quote_group_id: quoteGroupId,
    tenantId,
    ...(excludeQuoteId ? { quote_id: { not: excludeQuoteId } } : {}),
  };

  const closed = await prisma.quote.findFirst({
    orderBy: [{ version: "desc" }],
    select: versionSelect,
    where: { ...baseWhere, status: "closed" },
  });

  if (closed) return mapVersionRow(closed);

  const sent = await prisma.quote.findFirst({
    orderBy: [{ version: "desc" }],
    select: versionSelect,
    where: { ...baseWhere, status: "sent" },
  });

  if (sent) return mapVersionRow(sent);

  const latest = await prisma.quote.findFirst({
    orderBy: [{ version: "desc" }],
    select: versionSelect,
    where: baseWhere,
  });

  return latest ? mapVersionRow(latest) : null;
}
