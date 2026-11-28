import Link from "next/link";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { getProposalListPageByTenant } from "@/lib/db/proposals";
import { getFiscalWorkspaceAccess } from "@/lib/suite/fiscal-workspace";

export const dynamic = "force-dynamic";

export default async function FiscalPage() {
  const tenant = await getCurrentTenantContext();
  if (!tenant) return <p>No hay una empresa disponible para esta sesión.</p>;
  const access = getFiscalWorkspaceAccess(tenant.id);
  if (!access.visible) {
    return <section className="rounded-xl border border-zinc-200 bg-white p-6">
      <h1 className="text-2xl font-semibold">Fiscal</h1>
      <p className="mt-3 text-zinc-600">La operación fiscal no está habilitada para esta empresa.</p>
    </section>;
  }
  const canSeeAll = tenant.isSuperAdmin || tenant.userRole === "owner" || tenant.userRole === "admin";
  const page = await getProposalListPageByTenant(tenant.id, tenant.userId, canSeeAll, {
    blockedMargin: false, outcome: "won", status: "all",
  });
  return <section className="rounded-xl border border-zinc-200 bg-white p-5 sm:p-6">
    <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">CDC Fiscal · Digestor Fiscal</p>
    <h1 className="mt-2 text-2xl font-semibold text-zinc-900">Documentos de tus propuestas</h1>
    {access.previewOnly ? <p role="status" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">Vista previa de consulta. La emisión fiscal no está disponible en este entorno.</p> : null}
    <p className="mt-3 max-w-3xl text-sm text-zinc-600">{access.operationsEnabled ? "Abre una propuesta ganada para consultar o preparar sus documentos fiscales." : "Abre una propuesta ganada para revisar sus referencias y documentos disponibles."} Cada operación conserva sus permisos y confirmaciones.</p>
    <p className="mt-3 text-xs text-zinc-500">Fuente: propuestas de Cotiza. Esta lista no representa el universo de facturas ni una consulta de estado al SAT.</p>
    {canSeeAll && access.operationsEnabled ? <Link href="/configuracion/facturacion" className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-zinc-300 px-4 text-sm font-medium">Configuración fiscal</Link> : null}
    {page.items.length ? <ul className="mt-5 divide-y divide-zinc-200">
      {page.items.map(item => <li key={item.proposalId} className="py-4">
        <Link href={`/propuestas?proposalId=${encodeURIComponent(item.proposalId)}`} className="inline-flex min-h-11 items-center gap-2 rounded text-sm font-semibold underline underline-offset-4 focus-visible:outline-2">
          {item.formal?.proposalNumber || item.proposalId}
        </Link>
        <p className="break-words text-sm text-zinc-600">{item.formal?.recipientCompany || "Cliente sin nombre"}</p>
      </li>)}
    </ul> : <p className="mt-6 text-sm text-zinc-600">No hay propuestas ganadas disponibles para tu sesión.</p>}
    {page.hasMore ? <p className="mt-4 text-sm text-zinc-600">Se muestran las propuestas ganadas más recientes. <Link className="underline" href="/propuestas?outcome=won">Consultar más propuestas</Link></p> : null}
  </section>;
}
