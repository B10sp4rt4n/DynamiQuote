"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const navigation = [
  { href: "/inicio", label: "Inicio" },
  { href: "/configuracion/clientes", label: "Clientes" },
  { href: "/pipeline", label: "Oportunidades" },
  { href: "/cotizaciones", label: "Cotizaciones" },
  { href: "/propuestas", label: "Propuestas" },
  { href: "/propuestas/kpis", label: "KPIs" },
];

const supportingNavigation = [
  { href: "/paquetes", label: "Paquetes" },
  { href: "/autorizaciones", label: "Autorizaciones" },
  { href: "/configuracion", label: "Configuración" },
];

export function DashboardNav({ crmWorkspaceEnabled = false }: { crmWorkspaceEnabled?: boolean }) {
  const links = [
    ...navigation,
    ...(crmWorkspaceEnabled ? [{ href: "/crm", label: "CRM · Piloto" }] : []),
    ...supportingNavigation,
  ];
  const currentPath = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = currentPath.startsWith("/oportunidades/") ? "/pipeline" : currentPath;
  const activeHref = links
    .filter(({ href }) => pathname === href || pathname.startsWith(`${href}/`))
    .reduce<string | undefined>(
      (active, { href }) => (!active || href.length > active.length ? href : active),
      undefined,
    );

  return (
    <div className="space-y-3">
      <button type="button" aria-expanded={mobileOpen} aria-controls="dashboard-primary-navigation"
        onClick={() => setMobileOpen(open => !open)}
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border border-zinc-300 px-3 py-2 text-left text-sm font-semibold text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 md:hidden">
        <span>Menú · {links.find(link => link.href === activeHref)?.label ?? "Cotiza"}</span>
        <span aria-hidden="true">{mobileOpen ? "−" : "+"}</span>
      </button>
      <nav id="dashboard-primary-navigation" aria-label="Menu principal" className={`${mobileOpen ? "flex" : "hidden"} flex-wrap gap-2 md:flex`}>
        {links.map(({ href, label }) => (
          <Link
            aria-current={activeHref === href ? "page" : undefined}
            className={`inline-flex min-h-11 items-center rounded-lg px-3 py-2 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 ${
              activeHref === href
                ? "bg-zinc-900 text-white"
                : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
            }`}
            href={href}
            onClick={() => setMobileOpen(false)}
            key={href}
          >
            {label}
          </Link>
        ))}
      </nav>
      <details className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-950">
        <summary className="cursor-pointer font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700">
          Actualizamos el orden del menú
        </summary>
        <div className="mt-3 space-y-2">
          <p>El menú ahora sigue tu recorrido comercial: Inicio → Clientes → Oportunidades → Cotizaciones → Propuestas → KPIs.</p>
          <p>Pipeline ahora se llama <strong>Oportunidades</strong>. KPIs está después de Propuestas; Paquetes y Configuración quedan al final.</p>
          <p>Puedes abrir cualquier sección directamente, en el orden que necesites.</p>
        </div>
      </details>
    </div>
  );
}
