import Link from "next/link";

import { ClientShell } from "@/components/configuracion/client-shell";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { listClientsByTenant } from "@/lib/db/clients";
import { getIssuerProfilesByTenant } from "@/lib/db/settings";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const tenant = await getCurrentTenantContext();

  if (!tenant) {
    return (
      <section className="rounded-xl border border-dashed border-zinc-300 bg-white p-6 text-zinc-600">
        No hay contexto de tenant disponible.
      </section>
    );
  }

  const [clients, clientLogos] = await Promise.all([
    listClientsByTenant(tenant.id),
    getIssuerProfilesByTenant(tenant.id, "client"),
  ]);

  return (
    <div className="space-y-4">
      <nav className="text-sm text-zinc-500">
        <Link className="hover:text-zinc-900" href="/configuracion">Configuración</Link>
        {" / "}
        <span className="text-zinc-900">Clientes</span>
      </nav>
      <ClientShell clientLogos={clientLogos} initialClients={clients} />
    </div>
  );
}
