import "server-only";

import { randomUUID } from "crypto";

import { prisma } from "@/lib/db/prisma";

export type PendingTask = {
  clientCompany: string;
  clientId: string;
  description: string;
  dueDate: string;
  opportunityId: string | null;
  opportunityNumber: string | null;
  taskId: string;
};

export type CreateTaskInput = {
  clientId: string;
  createdByUserId: string | null;
  description: string;
  dueDate: string;
  opportunityId?: string | null;
};

export async function createTaskForTenant(tenantId: string, input: CreateTaskInput): Promise<string> {
  const taskId = randomUUID();

  await prisma.tasks.create({
    data: {
      client_id: input.clientId,
      completed_at: null,
      created_at: new Date(),
      created_by_user_id: input.createdByUserId,
      description: input.description.trim(),
      due_date: new Date(input.dueDate),
      opportunity_id: input.opportunityId || null,
      task_id: taskId,
      tenant_id: tenantId,
    },
  });

  return taskId;
}

// Tareas abiertas (completed_at IS NULL), ordenadas por fecha -- mismo
// criterio "ve lo tuyo vs ve todo" ya usado en el resto de la app.
export async function getPendingTasksByTenant(
  tenantId: string,
  viewerUserId: string | null = null,
  canSeeAll = true,
): Promise<PendingTask[]> {
  const rows = await prisma.tasks.findMany({
    orderBy: { due_date: "asc" },
    where: {
      completed_at: null,
      tenant_id: tenantId,
      ...(canSeeAll ? {} : { OR: [{ created_by_user_id: viewerUserId }, { created_by_user_id: null }] }),
    },
  });

  if (rows.length === 0) {
    return [];
  }

  const clientIds = [...new Set(rows.map((row) => row.client_id))];
  const opportunityIds = [...new Set(rows.map((row) => row.opportunity_id).filter((id): id is string => Boolean(id)))];

  const [clients, opportunities] = await Promise.all([
    prisma.client.findMany({
      select: { client_id: true, company: true },
      where: { client_id: { in: clientIds }, tenant_id: tenantId },
    }),
    opportunityIds.length > 0
      ? prisma.opportunities.findMany({
          select: { opportunity_id: true, opportunity_number: true },
          where: { opportunity_id: { in: opportunityIds }, tenant_id: tenantId },
        })
      : Promise.resolve([]),
  ]);

  const clientById = new Map(clients.map((client) => [client.client_id, client.company]));
  const opportunityById = new Map(opportunities.map((opp) => [opp.opportunity_id, opp.opportunity_number]));

  return rows.map((row) => ({
    clientCompany: clientById.get(row.client_id) ?? "Cliente eliminado",
    clientId: row.client_id,
    description: row.description,
    dueDate: row.due_date.toISOString(),
    opportunityId: row.opportunity_id,
    opportunityNumber: row.opportunity_id ? (opportunityById.get(row.opportunity_id) ?? null) : null,
    taskId: row.task_id,
  }));
}

export type CompleteTaskResult = "forbidden" | "not_found" | "updated";

export async function completeTaskByTenant(
  tenantId: string,
  taskId: string,
  viewerUserId: string | null,
  canSeeAll: boolean,
): Promise<CompleteTaskResult> {
  const task = await prisma.tasks.findFirst({
    select: { created_by_user_id: true },
    where: { task_id: taskId, tenant_id: tenantId },
  });

  if (!task) {
    return "not_found";
  }

  if (!canSeeAll && task.created_by_user_id !== null && task.created_by_user_id !== viewerUserId) {
    return "forbidden";
  }

  await prisma.tasks.update({
    data: { completed_at: new Date() },
    where: { task_id: taskId },
  });

  return "updated";
}

export type OpenOpportunityOption = {
  opportunityId: string;
  opportunityNumber: string;
  title: string;
};

// Para el selector opcional al crear una tarea -- solo tratos abiertos de
// ese cliente especifico.
export async function getOpenOpportunitiesByClientForTenant(
  tenantId: string,
  clientId: string,
): Promise<OpenOpportunityOption[]> {
  const rows = await prisma.opportunities.findMany({
    orderBy: { created_at: "desc" },
    select: { opportunity_id: true, opportunity_number: true, title: true },
    where: { client_id: clientId, stage: "open", tenant_id: tenantId },
  });

  return rows.map((row) => ({
    opportunityId: row.opportunity_id,
    opportunityNumber: row.opportunity_number,
    title: row.title,
  }));
}
