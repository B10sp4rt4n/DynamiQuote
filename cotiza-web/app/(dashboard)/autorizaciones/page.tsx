import Link from "next/link";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { getApprovalNotices, listWinCases } from "@/lib/db/won-consolidation";
export const dynamic = "force-dynamic";
export default async function WinApprovalsPage() {
  const tenant = await getCurrentTenantContext();
  if (!tenant?.userId || tenant.authMode !== "clerk") return <p>Inicia sesión para consultar tus autorizaciones.</p>;
  const actor = { ...tenant, userId: tenant.userId };
  const [cases, notices] = await Promise.all([listWinCases(tenant.id, actor), getApprovalNotices(tenant.id, actor)]);
  return <section className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5">
    <h1 className="text-2xl font-semibold">Autorizaciones de ganada</h1>
    <p className="text-sm text-zinc-700">{tenant.name} · Aceptaciones que puedes consultar por tu responsabilidad o acceso comercial.</p>
    {tenant.isSuperAdmin || tenant.userRole === "owner" ? <Link className="block text-sm text-blue-800 underline" href="/configuracion/consolidacion">Configurar reglas de esta empresa</Link> : null}
    <h2 className="font-semibold">Requieren tu aprobación ({notices.length})</h2>
    <ul className="space-y-2">{notices.map(item => <li key={item.key}><Link href={item.href} className="block min-h-11 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950">
      <strong className="block">{item.proposalNumber} · {item.recipientCompany}</strong>{item.requirements.join(" · ")}
    </Link></li>)}</ul>
    {!notices.length ? <p className="text-sm text-zinc-600">No tienes solicitudes de aprobación pendientes.</p> : null}
    <h2 className="font-semibold">Expedientes de consolidación</h2>
    <ul className="space-y-3">{cases.map(item => <li key={item.proposalId}><Link href={`/autorizaciones/${encodeURIComponent(item.proposalId)}`} className="block min-h-11 break-words rounded-lg border border-zinc-300 p-3 hover:border-blue-700">
      <strong className="block">{item.state}</strong><span className="text-sm">Aceptación: {item.acceptedOn} · Propuesta {item.proposalId}</span>
    </Link></li>)}</ul>
    {!cases.length ? <p className="text-sm text-zinc-600">No hay circuitos de aceptación visibles para ti.</p> : null}
  </section>;
}
