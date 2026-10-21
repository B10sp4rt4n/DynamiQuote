import { ProposalKpisShell } from "@/components/propuestas/proposal-kpis-shell";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { getProposalKpiReportData } from "@/lib/reports/proposal-kpis";

export const dynamic = "force-dynamic";

export default async function ProposalKpisPage() {
  const tenant = await getCurrentTenantContext();

  if (!tenant) {
    return (
      <section className="rounded-xl border border-dashed border-zinc-300 bg-white p-6 text-zinc-600">
        No hay tenants disponibles en Neon para cargar KPIs.
      </section>
    );
  }

  const report = await getProposalKpiReportData(tenant);
  return <ProposalKpisShell {...report} />;
}
