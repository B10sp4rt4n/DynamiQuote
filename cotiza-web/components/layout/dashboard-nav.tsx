"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

type Area = "Inicio" | "Comercial" | "Fiscal" | "Inteligencia" | "Administración";
type NavigationItem = { href: string; label: string; area: Area };
type Props = {
  crmWorkspaceEnabled?: boolean;
  recordiaEnabled?: boolean;
  procurementEnabled?: boolean;
  fiscalEnabled?: boolean;
  canAdminister?: boolean;
};

export function DashboardNav({ crmWorkspaceEnabled = false, recordiaEnabled = false, procurementEnabled = false, fiscalEnabled = false, canAdminister = false }: Props) {
  const links: NavigationItem[] = [
    { href: "/inicio", label: "Inicio", area: "Inicio" },
    { href: "/configuracion/clientes", label: "Clientes", area: "Comercial" },
    { href: "/pipeline", label: "Oportunidades", area: "Comercial" },
    { href: "/cotizaciones", label: "Cotizaciones", area: "Comercial" },
    { href: "/propuestas", label: "Propuestas", area: "Comercial" },
    { href: "/paquetes", label: "Paquetes", area: "Comercial" },
    { href: "/autorizaciones", label: "Autorizaciones", area: "Comercial" },
    ...(crmWorkspaceEnabled ? [{ href: "/crm", label: "CRM · Piloto", area: "Comercial" as const }] : []),
    ...(procurementEnabled ? [{ href: "/compras", label: "Compras", area: "Comercial" as const }] : []),
    ...(fiscalEnabled ? [{ href: "/fiscal", label: "Documentos por propuesta", area: "Fiscal" as const }] : []),
    { href: "/propuestas/kpis", label: "KPIs comerciales", area: "Inteligencia" },
    ...(recordiaEnabled ? [{ href: "/recordia", label: "Recordia · Premium", area: "Inteligencia" as const }] : []),
    ...(canAdminister ? [{ href: "/configuracion", label: "Configuración", area: "Administración" as const }] : []),
  ];
  const currentPath = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = currentPath.startsWith("/oportunidades/") ? "/pipeline"
    : currentPath === "/clientes" || currentPath.startsWith("/clientes/") ? "/configuracion/clientes"
    : currentPath.startsWith("/configuracion/facturacion") && fiscalEnabled ? "/fiscal" : currentPath;
  const active = links.filter(({ href }) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
  const area = active?.area ?? "Inicio";
  const areas = (["Inicio", "Comercial", "Fiscal", "Inteligencia", "Administración"] as const)
    .filter(name => links.some(link => link.area === name));
  const linkClass = "inline-flex min-h-11 items-center rounded-lg px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900";

  return <div className="space-y-3">
    <button type="button" aria-expanded={mobileOpen} aria-controls="dashboard-primary-navigation"
      onClick={() => setMobileOpen(open => !open)}
      className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border border-zinc-300 px-3 py-2 text-left text-sm font-semibold text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 md:hidden">
      <span>Menú · {active?.label ?? "CDC Suite"}</span>
      <span aria-hidden="true">{mobileOpen ? "−" : "+"}</span>
    </button>
    <div id="dashboard-primary-navigation" className={`${mobileOpen ? "block" : "hidden"} space-y-2 md:block`}>
      <nav aria-label="Áreas de CDC Suite" className="flex flex-wrap gap-2">
        {areas.map(name => {
          const first = links.find(link => link.area === name)!;
          const href = name === "Comercial" ? "/pipeline" : first.href;
          return <Link key={name} href={href} onClick={() => setMobileOpen(false)}
            aria-current={area === name ? name === "Inicio" ? "page" : "location" : undefined}
            className={`${linkClass} ${area === name ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"}`}>{name}</Link>;
        })}
      </nav>
      {area !== "Inicio" ? <nav aria-label={`Vistas de ${area}`} className="flex flex-wrap gap-1 border-t border-zinc-200 pt-2">
        {links.filter(link => link.area === area).map(({ href, label }) => <Link key={href} href={href}
          onClick={() => setMobileOpen(false)} aria-current={active?.href === href ? "page" : undefined}
          className={`${linkClass} ${active?.href === href ? "bg-zinc-100 text-zinc-950" : "text-zinc-600 hover:bg-zinc-100"}`}>{label}</Link>)}
      </nav> : null}
    </div>
  </div>;
}
