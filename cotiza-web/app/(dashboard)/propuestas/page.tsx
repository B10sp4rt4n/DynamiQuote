import { ProposalShell } from "@/components/propuestas/proposal-shell";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { getProposalListCountsByTenant, getProposalListPageByTenant } from "@/lib/db/proposals";
import { isForceIssuanceEligibleRole } from "@/lib/domain/proposal-issuance-gate";
import {
  normalizeBlockedMarginFilter,
  normalizeProposalOutcomeFilter,
  normalizeProposalStatusFilter,
} from "@/lib/domain/proposal-list-state";

export const dynamic = "force-dynamic";

type ProposalsPageProps = {
  searchParams: Promise<{ blockedMargin?: string; outcome?: string; status?: string }>;
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
  const initialStatusFilter = normalizeProposalStatusFilter(params.status);
  const initialOutcomeFilter = normalizeProposalOutcomeFilter(params.outcome);
  const initialBlockedMarginFilter = normalizeBlockedMarginFilter(params.blockedMargin);

  const [page, counts] = await Promise.all([
    getProposalListPageByTenant(tenant.id, tenant.userId, canSeeAll, {
      blockedMargin: initialBlockedMarginFilter,
      outcome: initialOutcomeFilter,
      status: initialStatusFilter,
    }),
    getProposalListCountsByTenant(tenant.id, tenant.userId, canSeeAll),
  ]);

  const canForceIssuance = isForceIssuanceEligibleRole(tenant.userRole);

  return (
    <ProposalShell
      canForceIssuance={canForceIssuance}
      counts={counts}
      hasMore={page.hasMore}
      initialBlockedMarginFilter={initialBlockedMarginFilter}
      initialOutcomeFilter={initialOutcomeFilter}
      initialStatusFilter={initialStatusFilter}
      proposals={page.items}
      tenantName={tenant.name}
    />
  );
}
