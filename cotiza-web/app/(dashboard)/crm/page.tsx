import { notFound } from "next/navigation";
import { CrmWorkspace } from "@/components/crm/crm-workspace";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { getCrmWorkspaceAccess } from "@/lib/auth/crm-workspace";
import { listClientsByTenant } from "@/lib/db/clients";
import { getOpportunityPipelineByTenant } from "@/lib/db/opportunities";
import { getPendingTasksByTenant } from "@/lib/db/tasks";
import { getAppUsersByTenant, getIssuerProfilesByTenant } from "@/lib/db/settings";

export const dynamic = "force-dynamic";
export default async function CrmPage() {
  const tenant = await getCurrentTenantContext();
  const access = await getCrmWorkspaceAccess(tenant);
  if (!tenant || !access) notFound();
  const { userId, canSeeAll } = access;
  const [clients, opportunities, tasks, logos, users] = await Promise.all([
    canSeeAll ? listClientsByTenant(tenant.id) : Promise.resolve([]),
    getOpportunityPipelineByTenant(tenant.id, userId, canSeeAll, false),
    getPendingTasksByTenant(tenant.id, userId, canSeeAll, false),
    canSeeAll ? getIssuerProfilesByTenant(tenant.id, "client") : Promise.resolve([]),
    canSeeAll ? getAppUsersByTenant(tenant.id) : Promise.resolve([]),
  ]);
  const vendors = users.filter(user => user.active).map(user => ({ userId: user.userId,
    label: `${user.firstName} ${user.lastName}`.trim() || user.alias || "Vendedor" }));
  return <CrmWorkspace key={`${tenant.id}:${userId}:${canSeeAll ? "tenant" : "personal"}`} canSeeAll={canSeeAll} tenantName={tenant.name} viewerUserId={userId} clients={clients} opportunities={opportunities} tasks={tasks}
    clientLogos={logos.map(({ companyName, logoId, logoName }) => ({ companyName, logoId, logoName }))} vendors={vendors} />;
}
