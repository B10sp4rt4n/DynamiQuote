import { ProposalShell } from "@/components/propuestas/proposal-shell";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { getProposalSummariesByTenant } from "@/lib/db/proposals";

export const dynamic = "force-dynamic";

export default async function ProposalsPage() {
  const tenant = await getCurrentTenantContext();

  if (!tenant) {
    return (
      <section className="rounded-xl border border-dashed border-zinc-300 bg-white p-6 text-zinc-600">
        No hay tenants disponibles en Neon para cargar propuestas.
      </section>
    );
  }

  const canSeeAll = tenant.isSuperAdmin || tenant.userRole === "owner" || tenant.userRole === "admin";
  const proposals = await getProposalSummariesByTenant(tenant.id, 20, tenant.userId, canSeeAll);

  return <ProposalShell proposals={proposals} tenantName={tenant.name} />;
}
