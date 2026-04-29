import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { hasClerkCredentials } from "@/lib/auth/clerk";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";

type DashboardLayoutProps = {
  children: React.ReactNode;
};

export default async function DashboardLayout({ children }: DashboardLayoutProps) {
  const clerkEnabled = hasClerkCredentials();

  if (clerkEnabled) {
    const { userId } = await auth();

    if (!userId) {
      redirect("/sign-in");
    }
  }

  const tenant = await getCurrentTenantContext();

  if (!tenant) {
    return (
      <div className="min-h-screen bg-zinc-100 px-6 py-10">
        <section className="mx-auto max-w-3xl rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-zinc-900">Falta contexto de tenant</h1>
          <p className="mt-2 text-zinc-600">
            Si Clerk esta habilitado, agrega `tenantId` o `tenantSlug` en la metadata de la sesion o del usuario para aislar correctamente los datos.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-100">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-lg font-semibold text-zinc-900">Cotiza</p>
            <p className="text-sm text-zinc-500">Tenant activo: {tenant.name}</p>
          </div>
          <nav className="flex items-center gap-4 text-sm text-zinc-600">
            <Link href="/cotizaciones">Cotizaciones</Link>
            <Link href="/propuestas">Propuestas</Link>
            <Link href="/paquetes">Paquetes</Link>
            <Link href="/configuracion">Configuracion</Link>
            {clerkEnabled ? <UserButton /> : <Link href="/sign-in">Activar autenticacion</Link>}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}
