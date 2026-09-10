import { VendorComparisonPanel, type ComparisonRow } from "@/components/inicio/vendor-comparison-panel";
import type { MarginPolicySummary } from "@/lib/db/margin-policies";
import type { ExpiringProposalAlert } from "@/lib/db/proposal-alerts";
import type { ProposalKpiSummary, SalesRepRankingRow } from "@/lib/db/proposal-kpis";
import type { ProposalStatusCounts, ProposalSummary } from "@/lib/db/proposals";
import type { QuoteDashboardSnapshot } from "@/lib/db/quotes";
import type { AppUserSummary, IssuerProfileSummary } from "@/lib/db/settings";

type PendingItem = {
  action: string;
  cta: string;
  href: string;
  tone: "amber" | "rose";
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(new Date(value));
}

function formatValidUntil(value: string): string {
  return new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", year: "numeric" }).format(
    new Date(value),
  );
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("es-MX", {
    currency: "MXN",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

function MetricCard({ helper, title, value }: { helper: string; title: string; value: number | string }) {
  return (
    <article className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
      <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">{title}</p>
      <p className="mt-2 text-3xl font-semibold text-zinc-900">{value}</p>
      <p className="mt-1 text-xs text-zinc-600">{helper}</p>
    </article>
  );
}

const toneClasses: Record<string, string> = {
  amber: "border-amber-200 bg-amber-50 text-amber-900",
  rose: "border-rose-200 bg-rose-50 text-rose-900",
};

type InicioShellProps = {
  canSeeAll: boolean;
  expiringAlerts: ExpiringProposalAlert[];
  issuerProfiles: IssuerProfileSummary[];
  marginPolicy: MarginPolicySummary;
  overallSummary: ProposalKpiSummary | null;
  proposalMarginBlockedCount: number;
  proposalStatusCounts: ProposalStatusCounts;
  quoteDashboardSnapshot: QuoteDashboardSnapshot;
  ranking: SalesRepRankingRow[];
  recentProposals: ProposalSummary[];
  tenantName: string;
  users: AppUserSummary[];
};

export function InicioShell({
  canSeeAll,
  expiringAlerts,
  issuerProfiles,
  marginPolicy,
  overallSummary,
  proposalMarginBlockedCount,
  proposalStatusCounts,
  quoteDashboardSnapshot,
  ranking,
  recentProposals,
  tenantName,
  users,
}: InicioShellProps) {
  const activeUsers = users.filter((user) => user.active).length;
  const ownerUsers = users.filter((user) => user.active && user.role === "owner").length;
  const defaultIssuerProfiles = issuerProfiles.filter((profile) => profile.isDefault).length;
  const missingSellerCodes = users.filter((user) => user.active && !user.sellerCode).length;

  const recentActivities = [
    ...quoteDashboardSnapshot.recentQuotes.map((quote) => ({
      href: `/cotizaciones?quoteId=${quote.quoteId}`,
      id: `quote:${quote.quoteId}`,
      label: quote.clientName,
      meta: quote.proposalName,
      timestamp: quote.createdAt,
      type: "Cotización",
    })),
    ...recentProposals.map((proposal) => ({
      href: `/propuestas?proposalId=${proposal.proposalId}`,
      id: `proposal:${proposal.proposalId}`,
      label: proposal.formal?.proposalNumber ?? proposal.proposalId,
      meta: proposal.formal?.recipientCompany ?? "Sin destinatario",
      timestamp: proposal.createdAt,
      type: "Propuesta",
    })),
  ]
    .sort((left, right) => {
      const leftTime = left.timestamp ? new Date(left.timestamp).getTime() : 0;
      const rightTime = right.timestamp ? new Date(right.timestamp).getTime() : 0;
      return rightTime - leftTime;
    })
    .slice(0, 8);

  const usesDefaultPolicy =
    marginPolicy.createdAt === null &&
    marginPolicy.minMarginPct === 10 &&
    marginPolicy.maxMarginPct === 35 &&
    marginPolicy.highPreapprovalMarginPct === 55 &&
    marginPolicy.requireObserverApproval === false;

  const pendingItems: PendingItem[] = canSeeAll
    ? [
        ownerUsers === 0
          ? {
              action: "Definir un usuario Owner activo para el tenant.",
              cta: "Ir a usuarios",
              href: "/configuracion?tab=users",
              tone: "rose" as const,
            }
          : null,
        defaultIssuerProfiles === 0
          ? {
              action: "Seleccionar un perfil emisor por default para propuestas y PDFs.",
              cta: "Ir a perfiles",
              href: "/configuracion?tab=issuer",
              tone: "amber" as const,
            }
          : null,
        usesDefaultPolicy
          ? {
              action: "La política de margen sigue en valores por defecto; conviene personalizarla para este tenant.",
              cta: "Ir a política",
              href: "/configuracion?tab=policy",
              tone: "amber" as const,
            }
          : null,
        proposalMarginBlockedCount > 0
          ? {
              action: `Hay ${proposalMarginBlockedCount} propuesta(s) activas bloqueadas por márgenes fuera de política.`,
              cta: "Ver propuestas bloqueadas",
              href: "/propuestas?filter=blocked_margin",
              tone: "rose" as const,
            }
          : null,
        missingSellerCodes > 0
          ? {
              action: `Hay ${missingSellerCodes} usuario(s) activos sin código de vendedor, lo que puede afectar trazabilidad comercial.`,
              cta: "Completar usuarios",
              href: "/configuracion?tab=users",
              tone: "amber" as const,
            }
          : null,
      ].filter((item): item is NonNullable<typeof item> => item !== null)
    : [];

  const comparisonRows: ComparisonRow[] =
    canSeeAll && overallSummary
      ? [
          {
            approvedAmount: overallSummary.approvedAmount,
            approvedCount: overallSummary.approvedCount,
            conversionRatePct: overallSummary.conversionRatePct,
            id: "overall",
            label: "Todo el tenant",
            proposedAmount: overallSummary.proposedAmount,
            totalCount: overallSummary.totalCount,
          },
          ...ranking.map((row) => ({
            approvedAmount: row.approvedAmount,
            approvedCount: row.approvedCount,
            conversionRatePct: row.conversionRatePct,
            id: row.userId,
            label: row.displayName,
            proposedAmount: row.proposedAmount,
            totalCount: row.totalCount,
          })),
        ]
      : [];

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-zinc-200 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-800 p-5 text-white shadow-sm">
        <p className="text-xs uppercase tracking-[0.18em] text-zinc-300">
          {canSeeAll ? "Centro de control" : "Tu actividad"}
        </p>
        <h2 className="mt-2 text-2xl font-semibold">
          {canSeeAll ? `Gobierno operativo de ${tenantName}` : `Bienvenido de vuelta, ${tenantName}`}
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-zinc-300">
          {canSeeAll
            ? "Este espacio concentra lo que depende de Owner o Superadmin para dejar el tenant listo: usuarios clave, política de márgenes, actividad comercial y pendientes de configuración."
            : "Un vistazo rápido a tus cotizaciones y propuestas antes de entrar a trabajar."}
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard helper="Cotizaciones vigentes registradas" title="Cotizaciones" value={quoteDashboardSnapshot.activeQuoteCount} />
        <MetricCard helper="Propuestas actualmente en borrador" title="Borradores" value={proposalStatusCounts.draft} />
        <MetricCard helper="Pendientes de revisión formal" title="En revisión" value={proposalStatusCounts.in_review} />
        <MetricCard helper="Propuestas ya aprobadas" title="Aprobadas" value={proposalStatusCounts.approved} />
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          helper="Monto agregado en cotizaciones"
          title="Ingreso cotizado"
          value={formatCurrency(quoteDashboardSnapshot.totalRevenue)}
        />
        <MetricCard helper="Propuestas ya enviadas" title="Enviadas" value={proposalStatusCounts.sent} />
        <MetricCard helper="Fuera de política de margen" title="Bloqueadas" value={proposalMarginBlockedCount} />
        {canSeeAll ? (
          <MetricCard helper="Usuarios operando dentro del tenant" title="Usuarios activos" value={activeUsers} />
        ) : null}
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-zinc-900">Propuestas por vencer</h3>
            <p className="text-sm text-zinc-600">Vigencia dentro del umbral configurado para el tenant.</p>
          </div>
          <span className="rounded-full bg-zinc-900 px-3 py-1 text-xs font-medium text-white">
            {expiringAlerts.length}
          </span>
        </div>

        <div className="mt-4">
          {expiringAlerts.length === 0 ? (
            <p className="text-sm text-zinc-500">No hay propuestas por vencer en este momento.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-zinc-200 text-sm">
                <thead className="text-left text-zinc-600">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Folio</th>
                    <th className="py-2 pr-4 font-medium">Cliente</th>
                    <th className="py-2 font-medium">Vence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200">
                  {expiringAlerts.map((alert) => (
                    <tr key={alert.proposalId}>
                      <td className="py-2 pr-4">
                        <a className="font-medium text-zinc-900 hover:underline" href={`/propuestas?proposalId=${alert.proposalId}`}>
                          {alert.proposalNumber}
                        </a>
                      </td>
                      <td className="py-2 pr-4 text-zinc-600">{alert.recipientCompany}</td>
                      <td className="py-2 text-rose-600">{formatValidUntil(alert.validUntil)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {canSeeAll ? (
        <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <section className="rounded-xl border border-zinc-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-zinc-900">Actividades pendientes</h3>
                <p className="text-sm text-zinc-600">Acciones que conviene cerrar para madurar el tenant.</p>
              </div>
              <span className="rounded-full bg-zinc-900 px-3 py-1 text-xs font-medium text-white">
                {pendingItems.length} pendiente(s)
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {pendingItems.length > 0 ? (
                pendingItems.map((item) => (
                  <div key={item.action} className={`rounded-xl border p-4 ${toneClasses[item.tone]}`}>
                    <p className="text-sm font-medium">{item.action}</p>
                    <a
                      className="mt-3 inline-block rounded-lg bg-white/80 px-3 py-2 text-xs font-semibold text-zinc-900 transition hover:bg-white"
                      href={item.href}
                    >
                      {item.cta}
                    </a>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
                  <p className="text-sm font-medium">No hay pendientes críticos de configuración.</p>
                  <p className="mt-1 text-xs">
                    El tenant ya tiene owner, perfil emisor por default y política de márgenes ajustada.
                  </p>
                </div>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-4">
            <h3 className="text-lg font-semibold text-zinc-900">Estado del entorno</h3>
            <div className="mt-4 space-y-3 text-sm text-zinc-700">
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                <p className="font-medium text-zinc-900">Política de margen</p>
                <p className="mt-1">Mínimo {marginPolicy.minMarginPct}% · Máximo {marginPolicy.maxMarginPct}%</p>
                <p>Preaprobación alta desde {marginPolicy.highPreapprovalMarginPct}%</p>
              </div>
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                <p className="font-medium text-zinc-900">Gobierno comercial</p>
                <p className="mt-1">Owner activo(s): {ownerUsers}</p>
                <p>Observador adicional: {marginPolicy.requireObserverApproval ? "Activo" : "No requerido"}</p>
              </div>
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                <p className="font-medium text-zinc-900">Documentos emisores</p>
                <p className="mt-1">Perfiles cargados: {issuerProfiles.length}</p>
                <p>Perfil default: {defaultIssuerProfiles > 0 ? "Definido" : "Pendiente"}</p>
              </div>
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                <p className="font-medium text-zinc-900">Actividad comercial</p>
                <p className="mt-1">Aprobadas: {proposalStatusCounts.approved}</p>
                <p>Enviadas: {proposalStatusCounts.sent}</p>
                <p>Ingreso cotizado: {formatCurrency(quoteDashboardSnapshot.totalRevenue)}</p>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {canSeeAll && comparisonRows.length > 0 ? <VendorComparisonPanel rows={comparisonRows} /> : null}

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-zinc-900">Actividad reciente</h3>
            <p className="text-sm text-zinc-600">
              {canSeeAll ? "Últimas cotizaciones y propuestas del tenant." : "Tus últimas cotizaciones y propuestas."}
            </p>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto overflow-y-hidden rounded-xl border border-zinc-200">
          <table className="min-w-full divide-y divide-zinc-200 text-sm">
            <thead className="bg-zinc-50 text-left text-zinc-600">
              <tr>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Referencia</th>
                <th className="px-4 py-3 font-medium">Detalle</th>
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 bg-white">
              {recentActivities.map((activity) => (
                <tr key={activity.id}>
                  <td className="px-4 py-3 text-zinc-700">{activity.type}</td>
                  <td className="px-4 py-3 font-medium text-zinc-900">{activity.label}</td>
                  <td className="px-4 py-3 text-zinc-600">{activity.meta}</td>
                  <td className="px-4 py-3 text-zinc-600">
                    {activity.timestamp ? formatDate(activity.timestamp) : "Sin fecha"}
                  </td>
                  <td className="px-4 py-3">
                    <a
                      className="rounded-lg bg-zinc-100 px-3 py-2 text-xs font-medium text-zinc-800 transition hover:bg-zinc-200"
                      href={activity.href}
                    >
                      Abrir
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {recentActivities.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">Aún no hay actividad reciente para mostrar.</p>
        ) : null}
      </section>
    </div>
  );
}
