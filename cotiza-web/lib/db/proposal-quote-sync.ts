import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { proposalQuoteSyncToken, type QuoteSyncItem } from "@/lib/domain/proposal-quote-sync-token";

export type QuoteSyncResult = "updated" | "unchanged" | "not_found" | "forbidden" | "not_draft" | "fiscal_document" | "conflict" | "missing_quote";
export async function syncProposalFromQuote(tenantId: string, proposalId: string,
  actor: { userId: string; canSeeAll: boolean }, expectedToken: string): Promise<QuoteSyncResult> {
  return prisma.$transaction(async tx => {
    const initial = await tx.proposals.findFirst({ where: { proposal_id: proposalId, tenant_id: tenantId }, select: { origin: true } });
    if (!initial) return "not_found";
    const quote = initial.origin ? await tx.quote.findFirst({ where: { quote_id: initial.origin, tenantId } }) : null;
    if (!quote) return "missing_quote";
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`quote-group:${tenantId}:${quote.quote_group_id ?? quote.quote_id}`}, 0))`;
    await tx.$queryRaw(Prisma.sql`SELECT proposal_id FROM proposals WHERE proposal_id=${proposalId} AND tenant_id=${tenantId} FOR UPDATE`);
    const proposal = await tx.proposals.findFirst({ where: { proposal_id: proposalId, tenant_id: tenantId } });
    if (!proposal) return "not_found";
    if (!actor.canSeeAll && proposal.created_by_user_id !== actor.userId) return "forbidden";
    const formal = await tx.formal_proposals.findFirst({ where: { proposal_id: proposalId, tenant_id: tenantId }, orderBy: [{ created_at: "desc" }, { proposal_doc_id: "desc" }] });
    if (proposal.status !== "draft" || (formal && formal.status !== "draft")) return "not_draft";
    if (proposal.invoice_draft_id || proposal.invoice_uuid || proposal.invoice_status || proposal.invoice_stamped_at) return "fiscal_document";
    if (proposal.origin !== quote.quote_id || (formal?.quote_id && formal.quote_id !== quote.quote_id)) return "conflict";
    const current = await tx.proposal_items.findMany({ where: { proposal_id: proposalId, tenant_id: tenantId, status: { not: "deleted" } }, orderBy: { item_number: "asc" } });
    const previous = current.map(i => ({ itemNumber: i.item_number, componentType: i.component_type ?? "", costUnit: Number(i.cost_unit), priceUnit: Number(i.price_unit), quantity: Number(i.quantity), description: i.description ?? "", sku: i.sku ?? "", origin: i.origin ?? "", status: i.status }));
    if (proposalQuoteSyncToken(previous) !== expectedToken) return "conflict";
    const lines = await tx.quote_lines.findMany({ where: { quote_id: quote.quote_id }, orderBy: [{ created_at: "asc" }, { line_id: "asc" }] });
    if (!lines.length) return "missing_quote";
    const next: QuoteSyncItem[] = lines.map((l, index) => ({ itemNumber: index + 1, componentType: l.line_type === "service" ? "service" : "product", costUnit: Number(l.cost_unit), priceUnit: Number(l.final_price_unit), quantity: Number(l.quantity), description: l.description_final || l.description_original || "Sin descripcion", sku: l.sku ?? "", origin: l.service_origin || "manual", status: "active" }));
    if (next.some(i => ![i.costUnit, i.priceUnit, i.quantity].every(Number.isFinite) || i.costUnit < 0 || i.priceUnit < 0 || i.quantity <= 0)) return "missing_quote";
    if (proposalQuoteSyncToken(next) === expectedToken) return "unchanged";
    const now = new Date();
    await tx.proposal_items.deleteMany({ where: { proposal_id: proposalId, tenant_id: tenantId } });
    await tx.proposal_items.createMany({ data: next.map(i => ({ item_id: randomUUID(), proposal_id: proposalId, tenant_id: tenantId,
      item_number: i.itemNumber, component_type: i.componentType, cost_unit: i.costUnit, price_unit: i.priceUnit, quantity: i.quantity,
      description: i.description, sku: i.sku || null, origin: i.origin, status: i.status,
      subtotal_cost: i.costUnit * i.quantity, subtotal_price: i.priceUnit * i.quantity, created_at: now, updated_at: now })) });
    await tx.proposal_approvals.deleteMany({ where: { proposal_id: proposalId, tenant_id: tenantId } });
    await tx.proposals.update({ where: { proposal_id: proposalId }, data: { issuance_status: "normal", margin_override_target_user_id: null } });
    await tx.formal_proposals.updateMany({ where: { proposal_id: proposalId, tenant_id: tenantId }, data: { updated_at: now } });
    await tx.proposal_audit_events.create({ data: { event_id: randomUUID(), event_hash: randomUUID(), proposal_id: proposalId, tenant_id: tenantId,
      event_type: "proposal_synced_from_quote", created_at: now, payload: JSON.stringify({ actorUserId: actor.userId, quoteId: quote.quote_id,
        previousToken: expectedToken, nextToken: proposalQuoteSyncToken(next), previousItems: previous, nextItems: next }) } });
    return "updated";
  });
}
