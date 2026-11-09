import Link from "next/link";
import { MercadoLibreInbox } from "@/components/integraciones/mercadolibre-inbox";
import { authorizeMercadoLibre } from "@/lib/integrations/mercadolibre/access";
import { mercadoLibreReady } from "@/lib/integrations/mercadolibre/config";
import { readInbox } from "@/lib/integrations/mercadolibre/store";

export const dynamic = "force-dynamic";
export default async function MercadoLibrePage({ searchParams }: { searchParams: Promise<{ connection?: string }> }) {
  let actor;
  try { actor = await authorizeMercadoLibre(); } catch {
    return <section className="rounded-xl border bg-white p-6"><h1 className="text-xl font-semibold">Mercado Libre</h1>
      <p className="mt-2">La integración requiere acceso administrativo y habilitación para esta empresa.</p>
      <Link href="/configuracion" className="mt-4 inline-block underline">Volver a Configuración</Link></section>;
  }
  let data;
  try { data = await readInbox(actor.tenantId); } catch {
    return <section className="rounded-xl border bg-white p-6"><h1 className="text-xl font-semibold">Mercado Libre · {actor.tenantName}</h1>
      <p className="mt-2">La bandeja todavía no está disponible. Falta completar la preparación de la integración.</p>
      <Link href="/configuracion" className="mt-4 inline-block underline">Volver a Configuración</Link></section>;
  }
  const params = await searchParams;
  return <MercadoLibreInbox key={actor.tenantId} initial={data} ready={mercadoLibreReady()} tenantName={actor.tenantName}
    callback={params.connection === "failed" ? "failed" : params.connection === "connected" ? "connected" : undefined} />;
}
