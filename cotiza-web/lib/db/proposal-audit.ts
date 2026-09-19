import "server-only";

import { randomUUID } from "crypto";

import { prisma } from "@/lib/db/prisma";
import { getProposalApprovalsByTenant } from "@/lib/db/proposal-approvals";

// Auditoria de solicitudes y emision de documentos de una propuesta. Reusa
// proposal_audit_events (sin DDL nuevo): la tabla no tiene columna de actor,
// asi que quien lo hizo va dentro del payload (actorUserId).
export type ProposalAuditEventType = "document_blocked" | "document_issued" | "status_change_requested";

// Nunca lanza: la auditoria es un registro de lo que ya paso, no puede
// romper la accion del usuario (bajar un PDF, pedir aprobacion) si falla.
export async function recordProposalAuditEvent(input: {
  actorUserId: string | null;
  eventType: ProposalAuditEventType;
  payload: Record<string, unknown>;
  proposalId: string;
  tenantId: string;
}): Promise<void> {
  try {
    await prisma.proposal_audit_events.create({
      data: {
        created_at: new Date(),
        event_hash: randomUUID(),
        event_id: randomUUID(),
        event_type: input.eventType,
        payload: JSON.stringify({ actorUserId: input.actorUserId, ...input.payload }),
        proposal_id: input.proposalId,
        tenant_id: input.tenantId,
      },
    });
  } catch (error) {
    console.error("[proposal-audit] No se pudo registrar el evento", {
      eventType: input.eventType,
      message: error instanceof Error ? error.message : String(error),
      proposalId: input.proposalId,
    });
  }
}

// Estatus crudo actual (antes de aplicar un cambio) para documentar el "de
// donde venia" de una solicitud. Nunca lanza -- null si no se pudo leer.
export async function getProposalStatusForAudit(tenantId: string, proposalId: string): Promise<string | null> {
  try {
    const row = await prisma.proposals.findFirst({
      select: { status: true },
      where: { proposal_id: proposalId, tenant_id: tenantId },
    });
    return row?.status ?? null;
  } catch {
    return null;
  }
}

export type ProposalAuditTimelineItem = {
  actorName: string | null;
  createdAt: string;
  details: Record<string, unknown>;
  id: string;
  type: string;
};

function parsePayload(payload: string | null): Record<string, unknown> {
  if (!payload) return {};
  try {
    const parsed: unknown = JSON.parse(payload);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

// Linea de tiempo unificada: eventos de proposal_audit_events (solicitudes,
// documentos, forzamientos/overrides) + decisiones de proposal_approvals,
// mas reciente primero. Solo para owner/admin/superadmin (la pagina lo
// restringe) -- nombres de actor resueltos contra app_users del mismo tenant.
export async function getProposalAuditTimelineByTenant(
  tenantId: string,
  proposalId: string,
  limit = 100,
): Promise<ProposalAuditTimelineItem[]> {
  const [events, approvals] = await Promise.all([
    prisma.proposal_audit_events.findMany({
      orderBy: { created_at: "desc" },
      take: limit,
      where: { proposal_id: proposalId, tenant_id: tenantId },
    }),
    getProposalApprovalsByTenant(tenantId, proposalId),
  ]);

  const rawItems = [
    ...events.map((event) => {
      const details = parsePayload(event.payload);
      const actor = details["actorUserId"] ?? details["consumedBy"] ?? details["approverUserId"];
      return {
        actorUserId: typeof actor === "string" ? actor : null,
        createdAt: event.created_at,
        details,
        id: event.event_id,
        type: event.event_type,
      };
    }),
    ...approvals.map((approval) => ({
      actorUserId: approval.approverUserId,
      createdAt: new Date(approval.createdAt),
      details: {
        approverRole: approval.approverRole,
        decision: approval.decision,
        reason: approval.reason,
      } as Record<string, unknown>,
      id: approval.approvalId,
      type: "approval_decision",
    })),
  ];

  const actorIds = [...new Set(rawItems.map((item) => item.actorUserId).filter((id): id is string => Boolean(id)))];
  const users =
    actorIds.length > 0
      ? await prisma.app_users.findMany({
          select: { alias: true, first_name: true, last_name: true, user_id: true },
          where: { tenant_id: tenantId, user_id: { in: actorIds } },
        })
      : [];
  const nameById = new Map(
    users.map((user) => [
      user.user_id,
      `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() || user.alias || null,
    ]),
  );

  return rawItems
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((item) => ({
      actorName: item.actorUserId ? (nameById.get(item.actorUserId) ?? null) : null,
      createdAt: item.createdAt.toISOString(),
      details: item.details,
      id: item.id,
      type: item.type,
    }));
}
