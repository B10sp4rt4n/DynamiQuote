import { notFound } from "next/navigation";
import { CrmWorkspace } from "@/components/crm/crm-workspace";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { isTenantCapabilityEnabled } from "@/lib/db/tenant-capabilities";
import { listClientsByTenant } from "@/lib/db/clients";
import { getOpportunityPipelineByTenant } from "@/lib/db/opportunities";
import { getPendingTasksByTenant } from "@/lib/db/tasks";
import { getAppUsersByTenant, getIssuerProfilesByTenant } from "@/lib/db/settings";

export const dynamic = "force-dynamic";
export default async function CrmPage() {
  const tenant = await getCurrentTenantContext();
  // First pilot is for superadmin only; enabling a tenant never grants seller access.
  if (!tenant?.isSuperAdmin || !tenant.userId) notFound();
  if (!await isTenantCapabilityEnabled(tenant.id, "crm_workspace_pilot")) notFound();
  const [clients, opportunities, tasks, logos, users] = await Promise.all([
    listClientsByTenant(tenant.id),
    getOpportunityPipelineByTenant(tenant.id, tenant.userId, true),
    getPendingTasksByTenant(tenant.id, tenant.userId, true),
    getIssuerProfilesByTenant(tenant.id, "client"),
    getAppUsersByTenant(tenant.id),
  ]);
  const vendors = users.filter(user => user.active).map(user => ({ userId: user.userId,
    label: `${user.firstName} ${user.lastName}`.trim() || user.alias || "Vendedor" }));
  return <CrmWorkspace tenantName={tenant.name} viewerUserId={tenant.userId} clients={clients} opportunities={opportunities} tasks={tasks}
    clientLogos={logos.map(({ companyName, logoId, logoName }) => ({ companyName, logoId, logoName }))} vendors={vendors} />;
}
