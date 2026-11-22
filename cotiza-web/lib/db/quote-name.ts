import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { normalizeQuoteName } from "@/lib/domain/quote-name";

export async function renameQuoteForTenant(tenantId: string, quoteId: string, userId: string, canSeeAll: boolean, name: string) {
  const proposalName = normalizeQuoteName(name);
  if (!proposalName || proposalName.length > 200) return null;
  const scope = { tenantId, quote_id: quoteId,
    ...(canSeeAll ? {} : { OR: [{ created_by_user_id: userId }, { created_by_user_id: null }] }) };
  return prisma.$transaction(async tx => {
    const source = await tx.quote.findFirst({ where: scope, select: { quote_group_id: true } });
    if (!source) return null;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`quote-group:${tenantId}:${source.quote_group_id ?? quoteId}`}, 0))`;
    const quote = await tx.quote.findFirst({ where: { ...scope, status: "draft" }, select: { proposal_name: true, input_metadata: true } });
    if (!quote) return null;
    if (quote.proposal_name === proposalName) return { quoteId, proposalName };
    const metadata = (quote.input_metadata && typeof quote.input_metadata === "object" && !Array.isArray(quote.input_metadata)
      ? quote.input_metadata : {}) as Prisma.JsonObject;
    const history = Array.isArray(metadata.quoteNameHistory) ? metadata.quoteNameHistory : [];
    const changed = await tx.quote.updateMany({ where: { ...scope, status: "draft", proposal_name: quote.proposal_name }, data: {
      proposal_name: proposalName,
      input_metadata: { ...metadata, quoteNameHistory: [...history, { previousName: quote.proposal_name, name: proposalName,
        at: new Date().toISOString(), by: userId }] } as Prisma.InputJsonObject,
    } });
    return changed.count === 1 ? { quoteId, proposalName } : null;
  });
}
