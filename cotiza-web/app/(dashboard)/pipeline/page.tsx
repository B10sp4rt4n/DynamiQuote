import { PipelineDashboard } from "@/components/pipeline/pipeline-dashboard";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { getOpportunityPipelineByTenant } from "@/lib/db/opportunities";
import { getAppUsersByTenant } from "@/lib/db/settings";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const tenant = await getCurrentTenantContext();

  if (!tenant) {
    return (
      <section className="rounded-xl border border-dashed border-zinc-300 bg-white p-6 text-zinc-600">
        No hay contexto de tenant disponible.
      </section>
    );
  }

  const canSeeAll = tenant.isSuperAdmin || tenant.userRole === "owner" || tenant.userRole === "admin";
  const [opportunities, appUsers] = await Promise.all([
    getOpportunityPipelineByTenant(tenant.id, tenant.userId, canSeeAll),
    // El selector "ver por vendedor" solo tiene sentido para quien ya puede
    // ver todo el tenant -- para un "user" normal seria redundante (ya solo
    // ve lo suyo) y no debe poder ver el roster de otros usuarios.
    canSeeAll ? getAppUsersByTenant(tenant.id) : Promise.resolve([]),
  ]);

  const vendors = appUsers
    .filter((user) => user.active)
    .map((user) => ({
      label: `${user.firstName} ${user.lastName}`.trim() || user.alias || user.email || user.userId,
      userId: user.userId,
    }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Pipeline</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Todas las oportunidades del tenant, agrupadas por su desenlace real (ganada/perdida según el outcome de sus propuestas).
        </p>
      </div>

      <PipelineDashboard canSeeAll={canSeeAll} opportunities={opportunities} vendors={vendors} viewerUserId={tenant.userId} />
    </div>
  );
}
