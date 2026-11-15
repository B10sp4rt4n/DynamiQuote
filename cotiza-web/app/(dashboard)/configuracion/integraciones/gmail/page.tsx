import Link from "next/link";
import { GmailConnection } from "@/components/integraciones/gmail-connection";
import { authorizeGmail } from "@/lib/integrations/gmail/access";
import { gmailReady } from "@/lib/integrations/gmail/config";
import { readConnection } from "@/lib/integrations/gmail/store";
export const dynamic="force-dynamic";
export default async function GmailPage({searchParams}:{searchParams:Promise<{connection?:string}>}) {
  let actor;
  try{actor=await authorizeGmail();}catch{
    return <section className="rounded-xl border bg-white p-5"><h1 className="text-xl font-semibold">Gmail</h1>
      <p className="mt-3">El piloto requiere una sesión autorizada en la empresa habilitada.</p><Link className="mt-3 inline-block underline" href="/configuracion">Volver a configuración</Link></section>;
  }
  let ready=gmailReady(),initial=null;
  if(ready){try{initial=await readConnection(actor);}catch{ready=false;}}
  const params=await searchParams;
  return <GmailConnection key={`${actor.tenantId}:${actor.actorId}`} tenantId={actor.tenantId} ready={ready} initial={initial} callback={params.connection}/>;
}
