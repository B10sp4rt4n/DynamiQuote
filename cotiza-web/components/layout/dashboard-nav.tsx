"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navigation = [
  { href: "/propuestas/kpis", label: "KPIs" },
  { href: "/inicio", label: "Inicio" },
  { href: "/cotizaciones", label: "Cotizaciones" },
  { href: "/propuestas", label: "Propuestas" },
  { href: "/paquetes", label: "Paquetes" },
  { href: "/configuracion/clientes", label: "Clientes" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/configuracion", label: "Configuracion" },
];

export function DashboardNav({ crmWorkspaceEnabled = false }: { crmWorkspaceEnabled?: boolean }) {
  const links = crmWorkspaceEnabled ? [navigation[0], navigation[1], { href: "/crm", label: "CRM · Piloto" }, ...navigation.slice(2)] : navigation;
  const pathname = usePathname();
  const activeHref = links
    .filter(({ href }) => pathname === href || pathname.startsWith(`${href}/`))
    .reduce<string | undefined>(
      (active, { href }) => (!active || href.length > active.length ? href : active),
      undefined,
    );

  return (
    <nav aria-label="Menu principal" className="flex flex-wrap gap-2">
      {links.map(({ href, label }) => (
        <Link
          aria-current={activeHref === href ? "page" : undefined}
          className={`inline-flex min-h-11 items-center rounded-lg px-3 py-2 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 ${
            activeHref === href
              ? "bg-zinc-900 text-white"
              : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
          }`}
          href={href}
          key={href}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
