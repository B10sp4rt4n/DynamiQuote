import Link from "next/link";

import { ProposalDetailView } from "@/components/propuestas/proposal-detail-view";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import {
  getProposalDerivationInfoByTenant,
  getProposalWorkflowByTenant,
  isProposalVisibleToViewer,
} from "@/lib/db/proposals";
import { getTenantProfileByTenant } from "@/lib/db/tenants";

export const dynamic = "force-dynamic";

type ProposalDetailPageProps = {
  params: Promise<{ proposalId: string }>;
};

function looksLikeOpaqueUserId(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }

  return /^(ser|user|sess|org)_[A-Za-z0-9]+$/.test(value.trim());
}

export default async function ProposalDetailPage({ params }: ProposalDetailPageProps) {
  const tenant = await getCurrentTenantContext();

  if (!tenant) {
    return (
      <section className="rounded-xl border border-dashed border-zinc-300 bg-white p-6 text-zinc-600">
        No hay tenants disponibles en Neon para cargar la propuesta.
      </section>
    );
  }

  const { proposalId } = await params;
  const canSeeAll = tenant.isSuperAdmin || tenant.userRole === "owner" || tenant.userRole === "admin";
  const visible = await isProposalVisibleToViewer(tenant.id, proposalId, tenant.userId, canSeeAll);

  if (!visible) {
    return (
      <section className="rounded-xl border border-dashed border-zinc-300 bg-white p-6 text-zinc-600">
        Propuesta no encontrada.
      </section>
    );
  }

  const [proposal, tenantProfile, derivationInfo] = await Promise.all([
    getProposalWorkflowByTenant(tenant.id, proposalId, { viewerUserId: tenant.userId }),
    getTenantProfileByTenant(tenant.id),
    getProposalDerivationInfoByTenant(tenant.id, proposalId),
  ]);

  if (!proposal) {
    return (
      <section className="rounded-xl border border-dashed border-zinc-300 bg-white p-6 text-zinc-600">
        Propuesta no encontrada.
      </section>
    );
  }

  const issuerContact = proposal.formal?.issuerContactName?.trim().toLowerCase() ?? "";
  const shouldUseSessionName =
    Boolean(tenant.userDisplayName) &&
    (issuerContact.length === 0 || issuerContact === "sin asignar" || looksLikeOpaqueUserId(issuerContact));

  const normalizedProposal = shouldUseSessionName
    ? {
        ...proposal,
        formal: proposal.formal
          ? {
              ...proposal.formal,
              issuerContactName: tenant.userDisplayName ?? proposal.formal.issuerContactName,
            }
          : proposal.formal,
        salesOwner: tenant.userDisplayName ?? proposal.salesOwner,
      }
    : proposal;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link className="text-sm font-medium text-zinc-600 hover:text-zinc-900" href="/propuestas">
          ← Volver a Propuestas
        </Link>
        <div className="flex gap-2">
          <a
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
            href={`/api/proposals/${proposalId}/pdf`}
          >
            Descargar PDF
          </a>
          <Link
            className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-zinc-700"
            href={`/propuestas?proposalId=${proposalId}`}
          >
            Editar
          </Link>
        </div>
      </div>

      <ProposalDetailView
        derivationInfo={derivationInfo}
        proposal={normalizedProposal}
        tenantAddress={tenantProfile?.address ?? null}
        tenantName={tenant.name}
        tenantRfc={tenantProfile?.rfc ?? null}
        tenantWebsite={tenantProfile?.website ?? null}
      />
    </div>
  );
}
