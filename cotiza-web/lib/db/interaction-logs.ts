import "server-only";

import { randomUUID } from "crypto";

import { prisma } from "@/lib/db/prisma";

export type InteractionLog = {
  authorDisplayName: string | null;
  createdAt: string;
  interactionId: string;
  note: string;
  opportunityId: string | null;
  opportunityNumber: string | null;
};

export type CreateInteractionLogInput = {
  createdByUserId: string | null;
  note: string;
  opportunityId?: string | null;
};

// Historial de notas por cliente -- separado de Tareas (que mira hacia
// adelante); esto registra lo que ya pasó (llamadas, reuniones, correos).
export async function listInteractionLogsForTenant(tenantId: string, clientId: string): Promise<InteractionLog[]> {
  const rows = await prisma.interaction_logs.findMany({
    orderBy: { created_at: "desc" },
    where: { client_id: clientId, tenant_id: tenantId },
  });

  if (rows.length === 0) {
    return [];
  }

  const opportunityIds = [
    ...new Set(rows.map((row) => row.opportunity_id).filter((id): id is string => Boolean(id))),
  ];
  const userIds = [
    ...new Set(rows.map((row) => row.created_by_user_id).filter((id): id is string => Boolean(id))),
  ];

  const [opportunities, users] = await Promise.all([
    opportunityIds.length > 0
      ? prisma.opportunities.findMany({
          select: { opportunity_id: true, opportunity_number: true },
          where: { opportunity_id: { in: opportunityIds }, tenant_id: tenantId },
        })
      : Promise.resolve([]),
    userIds.length > 0
      ? prisma.app_users.findMany({
          select: { alias: true, first_name: true, last_name: true, user_id: true },
          where: { user_id: { in: userIds } },
        })
      : Promise.resolve([]),
  ]);

  const opportunityById = new Map(opportunities.map((opp) => [opp.opportunity_id, opp.opportunity_number]));
  const userById = new Map(
    users.map((user) => [user.user_id, `${user.first_name} ${user.last_name}`.trim() || user.alias]),
  );

  return rows.map((row) => ({
    authorDisplayName: row.created_by_user_id ? (userById.get(row.created_by_user_id) ?? null) : null,
    createdAt: row.created_at.toISOString(),
    interactionId: row.interaction_id,
    note: row.note,
    opportunityId: row.opportunity_id,
    opportunityNumber: row.opportunity_id ? (opportunityById.get(row.opportunity_id) ?? null) : null,
  }));
}

export async function createInteractionLogForTenant(
  tenantId: string,
  clientId: string,
  input: CreateInteractionLogInput,
): Promise<InteractionLog> {
  const interactionId = randomUUID();

  const row = await prisma.interaction_logs.create({
    data: {
      client_id: clientId,
      created_at: new Date(),
      created_by_user_id: input.createdByUserId,
      interaction_id: interactionId,
      note: input.note.trim(),
      opportunity_id: input.opportunityId || null,
      tenant_id: tenantId,
    },
  });

  let opportunityNumber: string | null = null;

  if (row.opportunity_id) {
    const opportunity = await prisma.opportunities.findFirst({
      select: { opportunity_number: true },
      where: { opportunity_id: row.opportunity_id, tenant_id: tenantId },
    });
    opportunityNumber = opportunity?.opportunity_number ?? null;
  }

  let authorDisplayName: string | null = null;

  if (row.created_by_user_id) {
    const user = await prisma.app_users.findFirst({
      select: { alias: true, first_name: true, last_name: true },
      where: { user_id: row.created_by_user_id },
    });
    authorDisplayName = user ? `${user.first_name} ${user.last_name}`.trim() || user.alias : null;
  }

  return {
    authorDisplayName,
    createdAt: row.created_at.toISOString(),
    interactionId: row.interaction_id,
    note: row.note,
    opportunityId: row.opportunity_id,
    opportunityNumber,
  };
}

export type DeleteInteractionLogResult = "deleted" | "not_found";

export async function deleteInteractionLogForTenant(
  tenantId: string,
  interactionId: string,
): Promise<DeleteInteractionLogResult> {
  const result = await prisma.interaction_logs.deleteMany({
    where: { interaction_id: interactionId, tenant_id: tenantId },
  });

  return result.count > 0 ? "deleted" : "not_found";
}
