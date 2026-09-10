import type { ProposalWorkflowDetail } from "@/lib/db/proposals";
import type { ProposalStatus } from "@/lib/validations/proposals";

const STATUS_LABELS: Record<ProposalStatus, string> = {
  approved: "Aprobada",
  draft: "Borrador",
  expired: "Vencida",
  in_review: "En revision",
  rejected: "Rechazada",
  sent: "Enviada",
};

const STATUS_BADGE_CLASS: Record<ProposalStatus, string> = {
  approved: "bg-emerald-100 text-emerald-800",
  draft: "bg-zinc-100 text-zinc-700",
  expired: "bg-zinc-200 text-zinc-600",
  in_review: "bg-amber-100 text-amber-800",
  rejected: "bg-rose-100 text-rose-800",
  sent: "bg-blue-100 text-blue-800",
};

function formatCurrency(value: number, currency: string | null): string {
  return new Intl.NumberFormat("es-MX", {
    currency: currency ?? "MXN",
    maximumFractionDigits: 2,
    style: "currency",
  }).format(value);
}

function formatDate(value: string | null): string {
  if (!value) {
    return "N/D";
  }
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(new Date(value));
}

type ProposalDetailViewProps = {
  proposal: ProposalWorkflowDetail;
  tenantAddress: string | null;
  tenantName: string;
  tenantRfc: string | null;
  tenantWebsite: string | null;
};

export function ProposalDetailView({
  proposal,
  tenantAddress,
  tenantName,
  tenantRfc,
  tenantWebsite,
}: ProposalDetailViewProps) {
  const { formal, items, marginEvaluation, status } = proposal;
  const currency = formal?.currency ?? null;
  const totalPrice = items.reduce((sum, item) => sum + item.subtotalPrice, 0);
  const totalCost = items.reduce((sum, item) => sum + item.subtotalCost, 0);
  const marginPct = totalPrice > 0 ? ((totalPrice - totalCost) / totalPrice) * 100 : 0;

  return (
    <section className="space-y-5 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-200 pb-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Detalle de propuesta</p>
          <h1 className="mt-1 text-2xl font-semibold text-zinc-900">
            {formal?.proposalNumber ?? proposal.proposalId}
          </h1>
          <p className="mt-1 text-zinc-600">{formal?.recipientCompany ?? "Sin cliente"}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className={`rounded-full px-3 py-1 text-sm font-medium ${STATUS_BADGE_CLASS[status]}`}>
            {STATUS_LABELS[status]}
          </span>
          {marginEvaluation && !marginEvaluation.canAuthorizeFinal ? (
            <span className="rounded-full border border-rose-300 bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700">
              Bloqueada por margen
            </span>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
          <p className="text-xs uppercase tracking-[0.12em] text-zinc-500">Vendedor</p>
          <p className="mt-1 text-sm font-medium text-zinc-900">{proposal.salesOwner || "Sin asignar"}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
          <p className="text-xs uppercase tracking-[0.12em] text-zinc-500">Emitida</p>
          <p className="mt-1 text-sm font-medium text-zinc-900">{formatDate(formal?.issuedDate ?? null)}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
          <p className="text-xs uppercase tracking-[0.12em] text-zinc-500">Vigencia</p>
          <p className="mt-1 text-sm font-medium text-zinc-900">{formatDate(formal?.validUntil ?? null)}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
          <p className="text-xs uppercase tracking-[0.12em] text-zinc-500">Moneda</p>
          <p className="mt-1 text-sm font-medium text-zinc-900">{currency ?? "Sin elegir"}</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-zinc-200 p-3">
          <p className="text-xs uppercase tracking-[0.12em] text-zinc-500">Monto propuesto</p>
          <p className="mt-1 text-lg font-semibold text-zinc-900">{formatCurrency(totalPrice, currency)}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 p-3">
          <p className="text-xs uppercase tracking-[0.12em] text-zinc-500">Costo total</p>
          <p className="mt-1 text-lg font-semibold text-zinc-900">{formatCurrency(totalCost, currency)}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 p-3">
          <p className="text-xs uppercase tracking-[0.12em] text-zinc-500">Margen</p>
          <p className="mt-1 text-lg font-semibold text-zinc-900">{marginPct.toFixed(1)}%</p>
        </div>
        <div className="rounded-lg border border-zinc-200 p-3">
          <p className="text-xs uppercase tracking-[0.12em] text-zinc-500">Partidas</p>
          <p className="mt-1 text-lg font-semibold text-zinc-900">{items.length}</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-zinc-200 p-4">
          <p className="text-sm font-semibold text-zinc-900">Emisor</p>
          <p className="mt-2 text-sm text-zinc-700">{formal?.issuerCompany || tenantName}</p>
          <p className="text-sm text-zinc-600">{formal?.issuerContactName || "Sin contacto asignado"}</p>
          <p className="text-sm text-zinc-600">{formal?.issuerEmail || "Sin correo"}</p>
          <p className="text-sm text-zinc-600">{formal?.issuerPhone || "Sin telefono"}</p>
          {tenantRfc || tenantAddress || tenantWebsite ? (
            <div className="mt-2 border-t border-zinc-100 pt-2 text-xs text-zinc-500">
              {tenantRfc ? <p>RFC: {tenantRfc}</p> : null}
              {tenantAddress ? <p>{tenantAddress}</p> : null}
              {tenantWebsite ? <p>{tenantWebsite}</p> : null}
            </div>
          ) : null}
        </div>
        <div className="rounded-lg border border-zinc-200 p-4">
          <p className="text-sm font-semibold text-zinc-900">Receptor</p>
          <p className="mt-2 text-sm text-zinc-700">{formal?.recipientCompany || "Sin cliente"}</p>
          <p className="text-sm text-zinc-600">{formal?.recipientContactName || "Sin contacto"}</p>
          <p className="text-sm text-zinc-600">{formal?.recipientContactTitle || ""}</p>
          <p className="text-sm text-zinc-600">{formal?.recipientEmail || "Sin correo"}</p>
        </div>
      </div>

      {formal?.subject ? (
        <div className="rounded-lg border border-zinc-200 p-4">
          <p className="text-sm font-semibold text-zinc-900">Asunto</p>
          <p className="mt-1 text-sm text-zinc-700">{formal.subject}</p>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-zinc-200">
        <table className="min-w-full divide-y divide-zinc-200 text-sm">
          <thead className="bg-zinc-50 text-left text-zinc-600">
            <tr>
              <th className="px-4 py-3 font-medium">#</th>
              <th className="px-4 py-3 font-medium">SKU</th>
              <th className="px-4 py-3 font-medium">Descripcion</th>
              <th className="px-4 py-3 font-medium text-right">Cantidad</th>
              <th className="px-4 py-3 font-medium text-right">Costo unit.</th>
              <th className="px-4 py-3 font-medium text-right">Precio unit.</th>
              <th className="px-4 py-3 font-medium text-right">Subtotal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 bg-white">
            {items.map((item) => (
              <tr key={`${item.itemNumber}-${item.sku}`}>
                <td className="px-4 py-3 text-zinc-500">{item.itemNumber}</td>
                <td className="px-4 py-3 font-mono text-xs text-zinc-600">{item.sku || "—"}</td>
                <td className="px-4 py-3 text-zinc-900">{item.description}</td>
                <td className="px-4 py-3 text-right text-zinc-600">{item.quantity}</td>
                <td className="px-4 py-3 text-right text-zinc-600">{formatCurrency(item.costUnit, currency)}</td>
                <td className="px-4 py-3 text-right text-zinc-600">{formatCurrency(item.priceUnit, currency)}</td>
                <td className="px-4 py-3 text-right font-medium text-zinc-900">
                  {formatCurrency(item.subtotalPrice, currency)}
                </td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-center text-zinc-500" colSpan={7}>
                  Esta propuesta no tiene partidas.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {formal?.termsAndConditions ? (
        <div className="rounded-lg border border-zinc-200 p-4">
          <p className="text-sm font-semibold text-zinc-900">Condiciones</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-700">{formal.termsAndConditions}</p>
        </div>
      ) : null}
    </section>
  );
}
