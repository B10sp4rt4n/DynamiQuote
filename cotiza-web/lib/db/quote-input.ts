import "server-only";
import { createHash, randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getEditableQuoteLinesByTenant } from "@/lib/db/quote-editor";
import { isOptionPlaceholder } from "@/lib/domain/commercial-options";
import { normalizeQuoteInput, QuoteInputError, type QuoteInputLine, type QuoteInputSource } from "@/lib/domain/quote-input";

export function quoteInputHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function createDraftFromQuoteInput(input: {
  tenantId: string; quoteId: string; operationId: string;
  mode: "append" | "replace"; lines: QuoteInputLine[]; source: QuoteInputSource;
}) {
  const incoming = normalizeQuoteInput(input.lines);
  const inputHash = quoteInputHash({ quoteId: input.quoteId, mode: input.mode, source: input.source, lines: incoming.lines });
  const result = await prisma.$transaction(async (tx) => {
    // Serialize retries by tenant/key, including requests on different source quotes.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`quote-input:${input.tenantId}:${input.operationId}`}, 0))`;
    let base = await tx.quote.findFirst({ where: { quote_id: input.quoteId, tenantId: input.tenantId } });
    if (!base) return null;
    const prior = await tx.quote.findFirst({ where: {
      tenantId: input.tenantId, input_metadata: { path: ["operationId"], equals: input.operationId },
    } });
    if (prior) {
      if ((prior.input_metadata as Record<string, unknown> | null)?.inputHash !== inputHash) {
        throw new QuoteInputError("La solicitud ya se utilizó con datos distintos. Revisa y vuelve a intentarlo.", 409);
      }
      return { quote: prior, replayed: true, versionCreated: false };
    }
    const groupId = base.quote_group_id ?? base.quote_id;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`quote-group:${input.tenantId}:${groupId}`}, 0))`;
    // Refresh after acquiring the shared lock; manual edits use the same lock.
    base = await tx.quote.findFirst({ where: { quote_id: input.quoteId, tenantId: input.tenantId } });
    if (!base) return null;
    if (base.status === "archived") throw new QuoteInputError("Reactiva el borrador antes de importar",409);
    if (isOptionPlaceholder(base.input_metadata,base.quote_id)) throw new QuoteInputError("Este registro inicial vacío es histórico. Abre una opción comercial para trabajar.",409);
    const latest = await tx.quote.findFirst({
      where: { tenantId: input.tenantId, OR: [{ quote_group_id: groupId }, { quote_id: groupId }] },
      orderBy: { version: "desc" }, select: { version: true },
    });
    const loaded = await tx.quote_lines.findMany({
      where: { quote_id: base.quote_id }, orderBy: [{ created_at: "asc" }, { line_id: "asc" }],
    });
    const populated = loaded.filter((l) => (l.description_final || l.description_original || "").trim() || l.sku || Number(l.cost_unit) || Number(l.final_price_unit));
    const existing = input.mode === "append" ? populated : [];
    const combined = normalizeQuoteInput([
      ...existing.map((l) => ({
        sku: l.sku ?? "", description: l.description_final?.trim() || l.description_original?.trim() || "Sin descripción",
        quantity: Number(l.quantity ?? 1), costUnit: Number(l.cost_unit ?? 0), priceUnit: Number(l.final_price_unit ?? 0),
        lineType: l.line_type === "service" ? "service" : "product", serviceOrigin: l.service_origin ?? "",
      })), ...input.lines,
    ]);
    const initialFill = base.status === "draft" && base.version === 1 && latest?.version === 1
      && populated.length === 0 && !base.input_metadata && !base.sent_at && !base.closed_at && !base.rejected_at
      && Number(base.total_cost ?? 0) === 0 && Number(base.total_revenue ?? 0) === 0
      && await tx.quote.count({ where: { tenantId: input.tenantId, quote_group_id: groupId } }) === 1
      && await tx.proposals.count({ where: { tenant_id: input.tenantId, origin: base.quote_id } }) === 0
      && await tx.formal_proposals.count({ where: { tenant_id: input.tenantId, quote_id: base.quote_id } }) === 0;
    const version = initialFill ? 1 : (latest?.version ?? base.version ?? 1) + 1;
    const now = new Date();
    const data = {
      quote_id: `${groupId}-v${version}-${randomUUID().slice(0, 8)}`,
      quote_group_id: groupId, parent_quote_id: base.quote_id, tenantId: input.tenantId, version,
      createdAt: now, status: "draft", client_id: base.client_id, client_name: base.client_name,
      created_by_user_id: base.created_by_user_id, quoted_by: base.quoted_by,
      opportunity_id: base.opportunity_id, playbook_name: base.playbook_name, proposal_name: base.proposal_name,
      total_cost: combined.totals.totalCost, total_revenue: combined.totals.totalRevenue,
      gross_profit: combined.totals.grossProfit, avg_margin: combined.totals.avgMargin,
      input_metadata: { contractVersion: 1, operationId: input.operationId, inputHash,
        source: input.source, resolvedInput: incoming.lines, baseQuoteId: base.quote_id,
        mode: input.mode, capturedAt: now.toISOString() } as Prisma.InputJsonObject,
    };
    const quote = initialFill
      ? await tx.quote.update({ where: { quote_id: base.quote_id, tenantId: input.tenantId }, data: {
          total_cost: data.total_cost, total_revenue: data.total_revenue, gross_profit: data.gross_profit,
          avg_margin: data.avg_margin, input_metadata: data.input_metadata,
        } })
      : await tx.quote.create({ data });
    if (initialFill) await tx.quote_lines.deleteMany({ where: { quote_id: base.quote_id } });
    await tx.quote_lines.createMany({ data: combined.lines.map((l, i) => ({
      line_id: randomUUID(), quote_id: quote.quote_id, sku: l.sku || null,
      description_original: l.description, description_final: l.description,
      quantity: l.quantity, cost_unit: l.costUnit, final_price_unit: l.priceUnit, margin_pct: l.marginPct,
      line_type: l.lineType, service_origin: l.serviceOrigin || null,
      import_source: i < existing.length ? existing[i].import_source : input.source.kind,
      import_batch_id: i < existing.length ? existing[i].import_batch_id : input.operationId,
      strategy: i < existing.length ? existing[i].strategy : null,
      warnings: i < existing.length ? existing[i].warnings : null,
      description_corrections: i < existing.length ? existing[i].description_corrections : null,
      created_at: new Date(now.getTime() + i),
    })) });
    return { quote, replayed: false, versionCreated: !initialFill };
  });
  if (!result) return null;
  const q = result.quote;
  const lines = await getEditableQuoteLinesByTenant(input.tenantId, q.quote_id);
  const versionCount = await prisma.quote.count({ where: { tenantId: input.tenantId, quote_group_id: q.quote_group_id } });
  return {
    lines: lines ?? [], replayed: result.replayed, versionCreated: result.versionCreated,
    quote: { quoteId: q.quote_id, quoteGroupId: q.quote_group_id ?? q.quote_id, version: q.version ?? 1,
      versionCount, status: q.status ?? "draft", createdAt: q.createdAt!.toISOString(),
      clientName: q.client_name ?? "Sin cliente", proposalName: q.proposal_name ?? "Sin propuesta",
      playbookName: q.playbook_name, totalRevenue: Number(q.total_revenue), avgMargin: Number(q.avg_margin) },
    totals: { totalCost: Number(q.total_cost), totalRevenue: Number(q.total_revenue),
      grossProfit: Number(q.gross_profit), avgMargin: Number(q.avg_margin) },
  };
}
