import { ProposalShell } from "@/components/propuestas/proposal-shell";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { getProposalListCountsByTenant, getProposalListPageByTenant } from "@/lib/db/proposals";
import { isForceIssuanceEligibleRole } from "@/lib/domain/proposal-issuance-gate";
import { normalizeProposalListFilter } from "@/lib/domain/proposal-list-state";

export const dynamic = "force-dynamic";

type ProposalsPageProps = {
  searchParams: Promise<{ filter?: string }>;
};

export default async function ProposalsPage({ searchParams }: ProposalsPageProps) {
  const tenant = await getCurrentTenantContext();

  if (!tenant) {
    return (
      <section className="rounded-xl border border-dashed border-zinc-300 bg-white p-6 text-zinc-600">
        No hay tenants disponibles en Neon para cargar propuestas.
      </section>
    );
  }

  const canSeeAll = tenant.isSuperAdmin || tenant.userRole === "owner" || tenant.userRole === "admin";
  const params = await searchParams;
  const initialFilter = normalizeProposalListFilter(params.filter);

  const [page, counts] = await Promise.all([
    getProposalListPageByTenant(tenant.id, tenant.userId, canSeeAll, initialFilter),
    getProposalListCountsByTenant(tenant.id, tenant.userId, canSeeAll),
  ]);

  const canForceIssuance = isForceIssuanceEligibleRole(tenant.userRole);

  return (
    <ProposalShell
      canForceIssuance={canForceIssuance}
      counts={counts}
      hasMore={page.hasMore}
      initialFilter={initialFilter}
      proposals={page.items}
      tenantName={tenant.name}
    />
  );
}
