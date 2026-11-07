import { notFound } from "next/navigation";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { deliveryFlags } from "@/lib/notifications/won-message";
import { WonInbox, WonDeliveryStatus } from "@/components/layout/won-notifications";
export const dynamic="force-dynamic";
export default async function NotificationsPage(){
  const tenant=await getCurrentTenantContext();if(!tenant?.userId || !deliveryFlags().inApp)notFound();
  return <div className="mx-auto max-w-3xl space-y-5 text-zinc-900"><header><h1 className="text-2xl font-semibold">Tus avisos comerciales</h1><p className="mt-2 text-sm text-zinc-600">Cierres ganados de {tenant.name}. Cada aviso conserva la información registrada al cerrar; la propuesta muestra su estado actual.</p></header><WonInbox key={tenant.id}/>{deliveryFlags().email && (tenant.isSuperAdmin || ["owner","admin"].includes(tenant.userRole))?<WonDeliveryStatus key={`email:${tenant.id}`}/>:null}</div>;
}
