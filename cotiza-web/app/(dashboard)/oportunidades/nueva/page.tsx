import { notFound } from "next/navigation";
import { NewOpportunity } from "@/components/commercial/new-opportunity";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { listClientsByTenant } from "@/lib/db/clients";
export const dynamic = "force-dynamic";
export default async function NewOpportunityPage() {
  const tenant = await getCurrentTenantContext(); if (!tenant?.userId) notFound();
  const clients = await listClientsByTenant(tenant.id);
  return <NewOpportunity key={`${tenant.id}:${tenant.userId}`} clients={clients.filter(c=>c.active).map(({clientId,company})=>({clientId,company}))} />;
}
