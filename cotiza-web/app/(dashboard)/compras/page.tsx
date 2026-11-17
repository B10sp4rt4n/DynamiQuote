import Link from "next/link";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { listProcurementDrafts } from "@/lib/db/won-consolidation";
export const dynamic="force-dynamic";
export default async function ProcurementPage({searchParams}:{searchParams:Promise<{offset?:string}>}) {
  const tenant=await getCurrentTenantContext();
  if(!tenant?.userId||tenant.authMode!=="clerk")return <p>Inicia sesión para consultar Compras.</p>;
  const raw=(await searchParams).offset,offset=Math.max(0,Math.min(Number.parseInt(raw??"0",10)||0,100000));
  const page=await listProcurementDrafts(tenant.id,{...tenant,userId:tenant.userId},offset);
  return <section className="space-y-4 rounded-xl border border-zinc-200 bg-white p-4 text-zinc-900 sm:p-6">
    <h1 className="text-2xl font-semibold">Compras · Requisiciones en borrador</h1>
    <p className="text-sm text-zinc-700">{tenant.name}. Preparación interna a partir de una ganada consolidada.</p>
    {!page.enabled?<p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">La generación de requisiciones está desactivada para esta empresa.</p>:null}
    {tenant.isSuperAdmin||tenant.userRole==="owner"?<Link className="block min-h-11 py-3 text-sm text-blue-800 underline" href="/configuracion/consolidacion">Configurar cierre y preparación para Compras</Link>:null}
    {page.enabled&&!page.items.length?<p>No hay requisiciones preparadas en esta página.</p>:null}
    <ul className="space-y-3">{page.items.map(item=><li key={item.id}><Link href={`/compras/propuestas/${encodeURIComponent(item.proposalId)}`}
      className="block min-h-11 break-words rounded-lg border border-zinc-300 p-3 hover:border-blue-700"><strong>{item.folio} · {item.customer}</strong>
      <span className="mt-1 block text-sm">{item.proposalNumber} · {item.state==="review_required"?"Requiere revisión":"Borrador"}</span></Link></li>)}</ul>
    <div className="flex flex-wrap gap-4">{offset>0?<Link className="min-h-11 py-3 text-blue-800 underline" href={`/compras?offset=${Math.max(0,offset-20)}`}>Anterior</Link>:null}
      {page.hasMore?<Link className="min-h-11 py-3 text-blue-800 underline" href={`/compras?offset=${offset+20}`}>Siguiente</Link>:null}</div>
  </section>;
}
