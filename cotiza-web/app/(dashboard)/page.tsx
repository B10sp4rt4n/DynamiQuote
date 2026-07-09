import { getPackagesSummaryByTenant } from "@/lib/db/packages";
import {
  getProposalMarginBlockedCountByTenant,
  getProposalStatusCountsByTenant,
} from "@/lib/db/proposals";
import { getQuoteDashboardSnapshotByTenant } from "@/lib/db/quotes";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";

export const dynamic = "force-dynamic";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(value);
}

type StatCardProps = { label: string; value: string | number; sub?: string };

function StatCard({ label, value, sub }: StatCardProps) {
  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-zinc-500">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-zinc-900">{value}</p>
      {sub && <p className="mt-1 text-xs text-zinc-400">{sub}</p>}
    </article>
  );
}

const statusLabel: Record<string, string> = {
  draft: "Borrador",
  sent: "Enviada",
  in_review: "En revision",
  approved: "Aprobada",
  rejected: "Rechazada",
  expired: "Vencida",
};

const statusColor: Record<string, string> = {
  draft: "bg-zinc-200 text-zinc-700",
  sent: "bg-blue-100 text-blue-800",
  in_review: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-rose-100 text-rose-800",
  expired: "bg-zinc-100 text-zinc-500",
};

export default async function DashboardPage() {
  const tenant = await getCurrentTenantContext();

  if (!tenant) {
    return (
      <section className="rounded-xl border border-dashed border-zinc-300 bg-white p-6 text-zinc-600">
        No hay tenants activos disponibles para inicializar el dashboard.
      </section>
    );
  }

  const [snapshot, proposalCounts, packages, marginBlockedCount] = await Promise.all([
    getQuoteDashboardSnapshotByTenant(tenant.id),
    getProposalStatusCountsByTenant(tenant.id),
    getPackagesSummaryByTenant(tenant.id),
    getProposalMarginBlockedCountByTenant(tenant.id),
  ]);

  const activePackages = packages.filter((p) => p.active).length;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <p className="text-sm uppercase tracking-[0.18em] text-zinc-500">Tenant activo</p>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-900">{tenant.name}</h1>
      </section>

      <section>
        <p className="mb-3 text-xs font-medium uppercase tracking-widest text-zinc-400">Cotizaciones</p>
        <div className="grid gap-4 md:grid-cols-3">
          <StatCard label="Grupos registrados" value={snapshot.activeQuoteCount} />
          <StatCard label="Revenue acumulado" value={formatCurrency(snapshot.totalRevenue)} />
          <StatCard
            label="Paquetes disponibles"
            value={activePackages}
            sub={packages.length - activePackages > 0 ? `${packages.length - activePackages} inactivos` : undefined}
          />
        </div>
      </section>

      <section>
        <p className="mb-3 text-xs font-medium uppercase tracking-widest text-zinc-400">
          Propuestas · {proposalCounts.total} total
        </p>
        {marginBlockedCount > 0 ? (
          <div className="mb-3 flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
            <span className="text-rose-700">
              <svg fill="none" height="18" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="18" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <p className="text-sm font-medium text-rose-800">
              {marginBlockedCount === 1
                ? "1 propuesta activa bloqueada por politica de margen"
                : `${marginBlockedCount} propuestas activas bloqueadas por politica de margen`}
            </p>
            <a
              className="ml-auto rounded-lg border border-rose-300 bg-white px-3 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100"
              href="/propuestas?filter=blocked_margin"
            >
              Revisar
            </a>
          </div>
        ) : null}
        <div className="grid gap-3 grid-cols-3 md:grid-cols-6">
          {(["draft", "sent", "in_review", "approved", "rejected", "expired"] as const).map((s) => (
            <a
              className="rounded-xl border border-zinc-200 bg-white p-4 text-center shadow-sm hover:border-zinc-300 hover:shadow-md transition"
              href={`/propuestas?filter=${s}`}
              key={s}
            >
              <span className={"rounded-full px-2 py-0.5 text-xs font-medium " + (statusColor[s] ?? "")}>
                {statusLabel[s]}
              </span>
              <p className="mt-3 text-2xl font-semibold text-zinc-900">{proposalCounts[s]}</p>
            </a>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Actividad reciente</h2>
        <div className="mt-4 space-y-3">
          {snapshot.recentQuotes.map((quote) => (
            <a
              className="block"
              href={`/cotizaciones?panel=open&quoteId=${quote.quoteId}`}
              key={quote.quoteId}
            >
              <article className="flex flex-col gap-2 rounded-lg border border-zinc-200 px-4 py-3 transition hover:border-zinc-300 hover:shadow-sm md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-medium text-zinc-900">{quote.clientName}</p>
                  <p className="text-sm text-zinc-600">{quote.proposalName}</p>
                </div>
                <div className="text-sm text-zinc-500">v{quote.version}</div>
                <div className="font-medium text-zinc-900">{formatCurrency(quote.totalRevenue ?? 0)}</div>
              </article>
            </a>
          ))}
          {snapshot.recentQuotes.length === 0 && (
            <p className="text-sm text-zinc-500">Sin cotizaciones recientes.</p>
          )}
        </div>
      </section>
    </div>
  );
}
