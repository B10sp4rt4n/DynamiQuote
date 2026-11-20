import { ProposalShell } from "@/components/propuestas/proposal-shell";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { getProposalListCountsByTenant, getProposalListPageByTenant, getProposalSummaryByTenant } from "@/lib/db/proposals";
import { isForceIssuanceEligibleRole } from "@/lib/domain/proposal-issuance-gate";
import {
  normalizeBlockedMarginFilter,
  normalizeProposalOutcomeFilter,
  normalizeProposalStatusFilter,
} from "@/lib/domain/proposal-list-state";

export const dynamic = "force-dynamic";

type ProposalsPageProps = {
  searchParams: Promise<{ blockedMargin?: string; outcome?: string; status?: string; proposalId?: string | string[] }>;
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
  const proposalId = typeof params.proposalId === "string" ? params.proposalId : null;

  const [page, counts, requestedProposal] = await Promise.all([
    getProposalListPageByTenant(tenant.id, tenant.userId, canSeeAll, {
      blockedMargin: initialBlockedMarginFilter,
      outcome: initialOutcomeFilter,
      status: initialStatusFilter,
    }),
    getProposalListCountsByTenant(tenant.id, tenant.userId, canSeeAll),
    proposalId ? getProposalSummaryByTenant(tenant.id, proposalId, tenant.userId, canSeeAll) : null,
  ]);

  if (params.proposalId !== undefined && !requestedProposal) {
    return (
      <section className="rounded-xl border border-amber-300 bg-amber-50 p-6 text-amber-950">
        La propuesta seleccionada no está disponible para tu sesión. Vuelve a Propuestas y selecciona una propuesta disponible.
      </section>
    );
  }

  const canForceIssuance = isForceIssuanceEligibleRole(tenant.userRole);

  return (
    <ProposalShell
      key={`${tenant.id}:${tenant.userId}`}
      canForceIssuance={canForceIssuance}
      counts={counts}
      hasMore={page.hasMore}
      initialBlockedMarginFilter={initialBlockedMarginFilter}
      initialOutcomeFilter={initialOutcomeFilter}
      initialStatusFilter={initialStatusFilter}
      proposals={page.items}
      requestedProposal={requestedProposal}
      tenantName={tenant.name}
    />
  );
}
