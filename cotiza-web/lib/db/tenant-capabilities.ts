import { prisma } from "@/lib/db/prisma";

export const THREATDOWN_PDF_IMPORT = "threatdown_pdf_import";

/** Missing entitlements are disabled, including for superadmins. Never cache across tenants. */
export async function isTenantCapabilityEnabled(tenantId: string, capabilityKey: string): Promise<boolean> {
  const capability = await prisma.tenantCapability.findUnique({
    where: { tenant_id_capability_key: { tenant_id: tenantId, capability_key: capabilityKey } },
    select: { enabled: true },
  });
  return capability?.enabled === true;
}

export async function setTenantCapability(input: {
  tenantId: string;
  capabilityKey: typeof THREATDOWN_PDF_IMPORT;
  enabled: boolean;
  actor: { userId: string; isSuperAdmin: boolean };
}): Promise<boolean | null> {
  if (!input.actor.isSuperAdmin) throw new Error("Solo superadmin puede habilitar capacidades");
  if (input.capabilityKey !== THREATDOWN_PDF_IMPORT) throw new Error("Capacidad no soportada");
  return prisma.$transaction(async (tx) => {
    // Serialize writes per tenant/key so concurrent changes retain the correct previous state.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.tenantId + ":" + input.capabilityKey}, 0))::text`;
    const tenant = await tx.tenant.findUnique({ where: { tenant_id: input.tenantId }, select: { active: true } });
    if (!tenant?.active) return null;
    const where = { tenant_id_capability_key: { tenant_id: input.tenantId, capability_key: input.capabilityKey } };
    const previous = await tx.tenantCapability.findUnique({ where });
    if (previous?.enabled === input.enabled || (!previous && !input.enabled)) return input.enabled;
    const data = { enabled: input.enabled, updated_at: new Date(), updated_by: input.actor.userId };
    await tx.tenantCapability.upsert({ where,
      create: { tenant_id: input.tenantId, capability_key: input.capabilityKey, ...data }, update: data });
    await tx.tenantCapabilityEvent.create({ data: {
      tenant_id: input.tenantId, capability_key: input.capabilityKey,
      previous_enabled: previous?.enabled ?? null, enabled: input.enabled, changed_by: input.actor.userId,
    } });
    return input.enabled;
  });
}
