import "server-only";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db/prisma";

// Deliberately no lazy DDL. Apply the versioned migration before deployment.
// A failed audit prevents issuing the tenant-selection cookie.
export async function recordTenantContextChange(actorUserId: string, fromTenantId: string, toTenantId: string) {
  await prisma.$executeRaw`
    INSERT INTO tenant_context_events (event_id, actor_user_id, from_tenant_id, to_tenant_id, created_at)
    VALUES (${randomUUID()}, ${actorUserId}, ${fromTenantId}, ${toTenantId}, CURRENT_TIMESTAMP)
  `;
}
