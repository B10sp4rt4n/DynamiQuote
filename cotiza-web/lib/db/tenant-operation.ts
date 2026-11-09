import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { isOperationMode, type OperationMode } from "@/lib/tenant-operation";

export async function getTenantOperationMode(tenantId: string): Promise<OperationMode> {
  const rows = await prisma.$queryRaw<{ operation_mode: string }[]>`
    SELECT operation_mode FROM tenant_operation_profiles WHERE tenant_id = ${tenantId}`;
  if (!rows.length) return "consultative";
  if (!isOperationMode(rows[0].operation_mode)) throw new Error("Modalidad de operación inválida");
  return rows[0].operation_mode;
}

export async function setTenantOperationMode(input: {
  tenantId: string; mode: OperationMode; actor: { userId: string; isSuperAdmin: boolean };
}): Promise<OperationMode | null> {
  if (!input.actor.isSuperAdmin) throw new Error("Solo superadmin puede configurar la modalidad");
  if (!isOperationMode(input.mode)) throw new Error("Modalidad de operación inválida");
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.tenantId + ":operation-mode"}, 0))::text`;
    const tenant = await tx.tenant.findUnique({ where: { tenant_id: input.tenantId }, select: { active: true } });
    if (!tenant?.active) return null;
    const rows = await tx.$queryRaw<{ operation_mode: OperationMode }[]>`
      SELECT operation_mode FROM tenant_operation_profiles WHERE tenant_id = ${input.tenantId}`;
    const previous = rows[0]?.operation_mode ?? "consultative";
    if (previous === input.mode) return input.mode;
    await tx.$executeRaw`
      INSERT INTO tenant_operation_profiles (tenant_id, operation_mode, updated_by)
      VALUES (${input.tenantId}, ${input.mode}, ${input.actor.userId})
      ON CONFLICT (tenant_id) DO UPDATE SET operation_mode = EXCLUDED.operation_mode,
        updated_by = EXCLUDED.updated_by, updated_at = now()`;
    await tx.$executeRaw`
      INSERT INTO tenant_operation_events (event_id, tenant_id, previous_mode, operation_mode, changed_by)
      VALUES (${randomUUID()}, ${input.tenantId}, ${previous}, ${input.mode}, ${input.actor.userId})`;
    return input.mode;
  });
}
