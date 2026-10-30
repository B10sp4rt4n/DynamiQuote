"use client";
import Link from "next/link";
import { useState } from "react";
import { ClientShell } from "@/components/configuracion/client-shell";
import { PipelineDashboard, type PipelineVendor } from "@/components/pipeline/pipeline-dashboard";
import { PendingTasksPanel } from "@/components/inicio/pending-tasks-panel";
import type { ClientSummary } from "@/lib/db/clients";
import type { OpportunityWithStage } from "@/lib/db/opportunities";
import type { PendingTask } from "@/lib/db/tasks";

type Tab = "day" | "opportunities" | "clients";
type Props = { canSeeAll: boolean; tenantName: string; viewerUserId: string; clients: ClientSummary[]; opportunities: OpportunityWithStage[]; tasks: PendingTask[];
  clientLogos: { companyName: string | null; logoId: string; logoName: string }[]; vendors: PipelineVendor[] };
const tabs: { key: Tab; label: string }[] = [{ key: "day", label: "Mi día" }, { key: "opportunities", label: "Oportunidades" }, { key: "clients", label: "Clientes y seguimiento" }];
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export function CrmWorkspace({ canSeeAll, tenantName, viewerUserId, clients, opportunities, tasks, clientLogos, vendors }: Props) {
  const [tab, setTab] = useState<Tab>("day");
  const [search, setSearch] = useState("");
  const [hasOpenedClients, setHasOpenedClients] = useState(false);
  function openTab(next: Tab) {
    if (next === "clients") setHasOpenedClients(true);
    setTab(next);
  }
  const visibleTabs = canSeeAll ? tabs : tabs.filter(item => item.key !== "clients");
  const open = opportunities.filter(opp => opp.stage === "open");
  const matchingClients = clients.filter(client => normalize(client.company).includes(normalize(search.trim())));
  return <div className="space-y-6 text-zinc-900">
    <header className="rounded-xl border border-indigo-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-sm font-semibold text-indigo-800">PILOTO CRM · {tenantName}</p><h1 className="mt-1 text-3xl font-bold">Tu espacio comercial</h1><p className="mt-2 text-zinc-700">Revisa tus pendientes, retoma una oportunidad y registra el siguiente paso.</p></div><Link className="rounded-lg bg-indigo-700 px-5 py-3 font-semibold text-white hover:bg-indigo-800" href="/cotizaciones">Ir a cotizar</Link></div>
      <p className="mt-4 rounded-lg bg-indigo-50 p-3 text-sm text-indigo-950">{canSeeAll ? `Vista de administración de ${tenantName}. Registrar un seguimiento es opcional.` : "Aquí ves tus oportunidades y pendientes. Puedes completar los datos comerciales sin detener tu cotización."}</p>
    </header>
    <nav aria-label="Secciones del CRM" className="flex flex-wrap gap-2">{visibleTabs.map(item => <button key={item.key} type="button" aria-pressed={tab === item.key} onClick={() => openTab(item.key)} className={`rounded-lg border px-5 py-3 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700 ${tab === item.key ? "border-indigo-700 bg-indigo-700 text-white" : "border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-100"}`}>{item.label}</button>)}</nav>
    {tab === "day" ? <div className="space-y-6">
      {canSeeAll ? <>
      <div className="grid gap-4 sm:grid-cols-3">{[{ label: "Cuentas activas", value: clients.length, next: "clients" as Tab }, { label: "Oportunidades abiertas", value: open.length, next: "opportunities" as Tab }].map(card => <button type="button" key={card.label} onClick={() => openTab(card.next)} className="rounded-xl border border-zinc-300 bg-white p-5 text-left text-zinc-900 hover:border-indigo-500"><span className="block text-sm text-zinc-600">{card.label}</span><strong className="mt-2 block text-3xl">{card.value}</strong></button>)}<div className="rounded-xl border border-zinc-300 bg-white p-5"><span className="text-sm text-zinc-600">Seguimiento</span><button className="mt-3 block rounded-lg bg-indigo-700 px-4 py-2 font-semibold text-white hover:bg-indigo-800" type="button" onClick={() => openTab("clients")}>Registrar próximo paso</button></div></div>
      <section className="rounded-xl border border-zinc-300 bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">Retomar una cuenta</h2><label className="text-sm font-medium">Buscar empresa<input className="ml-3 rounded-lg border border-zinc-400 bg-white p-2 text-zinc-900 placeholder:text-zinc-500" value={search} placeholder="Ej. HL Innovación" onChange={e => setSearch(e.target.value)} /></label></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{matchingClients.slice(0,6).map(client => <Link className="rounded-lg border border-zinc-300 p-4 hover:border-indigo-500 hover:bg-indigo-50" key={client.clientId} href={`/clientes/${encodeURIComponent(client.clientId)}`}><span className="block font-semibold text-zinc-900">{client.company}</span><span className="mt-2 block text-sm font-semibold text-indigo-800">Ver historial y pendientes →</span></Link>)}</div>{matchingClients.length === 0 ? <p className="mt-4 text-zinc-600">No hay cuentas que coincidan. Puedes revisar o registrar clientes en “Clientes y seguimiento”.</p> : <p className="mt-3 text-sm text-zinc-600">Mostrando {Math.min(6, matchingClients.length)} de {matchingClients.length} cuentas. Busca por nombre o abre Clientes y seguimiento para ver todas.</p>}</section>
      </> : <section className="rounded-xl border border-zinc-300 bg-white p-5"><h2 className="text-xl font-semibold">Mis oportunidades</h2><p className="mt-2 text-zinc-700">Tienes {open.length} oportunidades abiertas. Retoma una cotización para guardar avances o completar los datos pendientes.</p><button className="mt-4 rounded-lg bg-indigo-700 px-4 py-2 font-semibold text-white" type="button" onClick={() => openTab("opportunities")}>Ver mis oportunidades</button></section>}
      <PendingTasksPanel tasks={tasks} linkClients={canSeeAll} />
    </div> : null}
    {tab === "opportunities" ? <section className="space-y-4"><div className="rounded-xl border border-zinc-300 bg-white p-5"><h2 className="text-xl font-semibold">Oportunidades</h2><p className="mt-2 text-zinc-700">{canSeeAll ? "Las decisiones de las propuestas y el seguimiento comercial determinan el estado. Puedes pausar o cerrar sin decisión desde cada oportunidad. Revisa una cuenta para consultar sus cotizaciones y propuestas." : "Estas son tus oportunidades. Usa Completar datos de oportunidad para retomar su cotización, guardar avances y terminar el registro comercial."}</p></div><PipelineDashboard canSeeAll={canSeeAll} linkClients={canSeeAll} opportunities={opportunities} vendors={vendors} viewerUserId={viewerUserId} /></section> : null}
    {canSeeAll && hasOpenedClients ? <section hidden={tab !== "clients"} className="space-y-4"><div className="rounded-xl border border-zinc-300 bg-indigo-50 p-5 text-indigo-950"><h2 className="text-xl font-semibold">Clientes y seguimiento</h2><p className="mt-2">Para dejar un próximo paso, busca la cuenta y pulsa <strong>Tarea</strong>: escribe qué sigue y cuándo. Usa <strong>Ver 360°</strong> para revisar su historial.</p></div><ClientShell clientLogos={clientLogos} initialClients={clients} /></section> : null}
  </div>;
}
