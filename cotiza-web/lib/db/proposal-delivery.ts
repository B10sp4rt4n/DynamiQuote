import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

// A provider acceptance is a delivery event, never an authorization decision.
// Bind it to the exact formal revision rendered, not a newer edited document.
export async function recordProposalDeliveryByTenant(input: {
  tenantId: string; proposalId: string; documentId: string; expectedUpdatedAt: string | null;
  actorUserId: string | null; providerId: string | null; pdfSha256: string;
}): Promise<{ sentAt: string | null; recordedForCurrentRevision: boolean }> {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw(Prisma.sql`SELECT proposal_id FROM proposals
      WHERE proposal_id=${input.proposalId} AND tenant_id=${input.tenantId} FOR UPDATE`);
    const proposal = await tx.proposals.findFirst({ where: { proposal_id: input.proposalId, tenant_id: input.tenantId }, select: { status: true } });
    if (!proposal) throw new Error("Propuesta no encontrada al registrar el envío");
    const now = new Date();
    const result = proposal.status === "approved" ? await tx.formal_proposals.updateMany({
      where: { tenant_id: input.tenantId, proposal_id: input.proposalId, proposal_doc_id: input.documentId,
        status: "approved", updated_at: input.expectedUpdatedAt ? new Date(input.expectedUpdatedAt) : null },
      data: { sent_at: now },
    }) : { count: 0 };
    await tx.proposal_audit_events.create({ data: {
      event_id: randomUUID(), event_hash: randomUUID(), event_type: "document_issued",
      proposal_id: input.proposalId, tenant_id: input.tenantId, created_at: now,
      payload: JSON.stringify({ actorUserId: input.actorUserId, via: "email", status: "approved",
        authorizationAtDispatch: "approved", providerAccepted: true, recipientScope: "seller_and_owner",
        documentId: input.documentId, providerId: input.providerId, pdfSha256: input.pdfSha256,
        recordedForCurrentRevision: result.count === 1, watermark: false, forced: false }),
    } });
    return { sentAt: result.count === 1 ? now.toISOString() : null, recordedForCurrentRevision: result.count === 1 };
  });
}

// Recheck after PDF rendering, immediately before dispatching that snapshot.
export async function isProposalDeliveryAuthorizedByTenant(input: {
  tenantId: string; proposalId: string; documentId: string; expectedUpdatedAt: string | null;
}): Promise<boolean> {
  return await prisma.formal_proposals.count({ where: {
    tenant_id: input.tenantId, proposal_id: input.proposalId, proposal_doc_id: input.documentId,
    status: "approved", updated_at: input.expectedUpdatedAt ? new Date(input.expectedUpdatedAt) : null,
    proposals: { tenant_id: input.tenantId, proposal_id: input.proposalId, status: "approved" },
  } }) === 1;
}
