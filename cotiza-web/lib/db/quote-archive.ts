import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
export async function setQuoteArchived(tenantId: string, quoteId: string, userId: string, canSeeAll: boolean, archive: boolean, reason?: string) {
  return prisma.$transaction(async tx => {
    const source = await tx.quote.findFirst({ where: { tenantId, quote_id: quoteId } });
    if (!source) return null;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`quote-group:${tenantId}:${source.quote_group_id ?? quoteId}`}, 0))`;
    const quote = await tx.quote.findFirst({ where: { tenantId, quote_id: quoteId } });
    if (!quote || (!canSeeAll && quote.created_by_user_id !== userId && quote.created_by_user_id !== null)) return null;
    if (quote.status !== (archive ? "draft" : "archived")) return null;
    if (archive && (!reason || reason.trim().length < 3)) return null;
    // A quote with a proposal is no longer a disposable draft. Leave all
    // existing approvals, outcomes and fiscal documents untouched.
    if (archive && (await tx.proposals.count({ where: { tenant_id: tenantId, origin: quoteId } }) ||
      await tx.formal_proposals.count({ where: { tenant_id: tenantId, quote_id: quoteId } }))) return null;
    const metadata = (quote.input_metadata && typeof quote.input_metadata === "object" && !Array.isArray(quote.input_metadata) ? quote.input_metadata : {}) as Prisma.JsonObject;
    const history = Array.isArray(metadata.archiveHistory) ? metadata.archiveHistory : [];
    const event = { action: archive ? "archive" : "restore", reason: reason?.trim() ?? "Reactivar borrador", at: new Date().toISOString(), by: userId };
    const status = archive ? "archived" : "draft";
    const changed = await tx.quote.updateMany({ where: { tenantId, quote_id: quoteId, status: quote.status }, data: { status,
      input_metadata: { ...metadata, archiveHistory: [...history, event] } as Prisma.InputJsonObject } });
    return changed.count === 1 ? { status } : null;
  });
}
