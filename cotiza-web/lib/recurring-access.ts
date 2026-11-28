import "server-only";
import { auth } from "@clerk/nextjs/server";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { isTenantCapabilityEnabled } from "@/lib/db/tenant-capabilities";
import { recurringConfigured, type RecurringActor } from "@/lib/db/recurring-services";
import { RECURRING_CAPABILITY, RECURRING_TENANT_ID, RECURRING_TENANT_SLUG, RecurringError } from "@/lib/domain/recurring-services";

type Viewer={id:string;slug:string;userId:string|null;authMode:string};
export async function recurringVisible(viewer:Viewer) {
  return viewer.id===RECURRING_TENANT_ID && viewer.slug===RECURRING_TENANT_SLUG
    && viewer.authMode==='clerk' && recurringConfigured(viewer.userId??undefined)
    && await isTenantCapabilityEnabled(viewer.id,RECURRING_CAPABILITY);
}
export async function authorizeRecurring(request?: Request):Promise<RecurringActor> {
  const {userId}=await auth();
  if(!userId) throw new RecurringError("Inicia sesión para consultar servicios",401);
  const ctx=await getCurrentTenantContext();
  if(!ctx||ctx.userId!==userId||!await recurringVisible(ctx)) throw new RecurringError("Piloto no disponible",404);
  if(request) {
    if(request.headers.get('x-tenant-context')!==ctx.id) throw new RecurringError("Cambió la empresa activa. Recarga",409);
    if(!['GET','HEAD'].includes(request.method)) {
      let origin:string;
      try {
        const value=process.env.VERCEL_ENV==='preview' && process.env.VERCEL_URL?`https://${process.env.VERCEL_URL}`:process.env.COTIZA_RECURRING_APP_ORIGIN;
        const url=new URL(value??'');
        if(url.protocol!=='https:' && !(process.env.NODE_ENV!=='production' && ['localhost','127.0.0.1'].includes(url.hostname))) throw Error();
        origin=url.origin;
      }catch {throw new RecurringError("Origen del piloto no configurado",503);}
      if(request.headers.get('origin')!==origin || new URL(request.url).origin!==origin) throw new RecurringError("Origen no autorizado",403);
    }
  }
  // Every repository operation revalidates active identity/role/capability under transaction locks.
  return {tenantId:ctx.id,actorId:userId};
}
