import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { recordiaPilotVisible } from "@/lib/integrations/recordia/access";
import { listRecordiaCases } from "@/lib/integrations/recordia/reader";
export const dynamic="force-dynamic";
export default async function RecordiaArchivePage() {
  const tenant=await getCurrentTenantContext();
  if(!tenant?.userId||!await recordiaPilotVisible(tenant))notFound();
  const cases=await listRecordiaCases({tenantId:tenant.id,actorId:tenant.userId});
  return <div className="space-y-4 text-zinc-900"><h1 className="text-2xl font-semibold">Archivo persistente Recordia</h1>
    <p className="text-sm text-zinc-600">Premium · Piloto SynAppsSys. Cada expediente conserva sus versiones, aunque la oportunidad original se haya eliminado.</p>
    {cases.length===200?<p className="text-sm text-amber-900">Esta vista muestra hasta 200 expedientes.</p>:null}
    <ul className="space-y-3">{cases.map(item=><li key={item.id} className="rounded-xl border border-zinc-300 bg-white p-4">
      <Link href={`/recordia/${encodeURIComponent(item.id)}`} className="inline-flex min-h-11 items-center font-semibold text-blue-800 underline">{item.folio} · {item.title}</Link>
      <p className="text-sm text-zinc-600">{item.versions} versiones de la oportunidad · {item.deleted?"Fuente original eliminada o retirada":"Fuente original registrada"}</p>
    </li>)}</ul>
    {!cases.length?<p>No hay expedientes conservados todavía.</p>:null}
  </div>;
}
