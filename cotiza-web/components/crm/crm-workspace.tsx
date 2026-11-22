"use client";
import Link from "next/link";
import { useState } from "react";
import { ClientShell } from "@/components/configuracion/client-shell";
import { PipelineDashboard, type PipelineVendor } from "@/components/pipeline/pipeline-dashboard";
import { AccountFollowUp } from "./account-follow-up";
import { PendingTasksPanel } from "@/components/inicio/pending-tasks-panel";
import type { ClientSummary } from "@/lib/db/clients";
import type { OpportunityWithStage } from "@/lib/db/opportunities";
import type { PendingTask } from "@/lib/db/tasks";

type Tab = "day" | "opportunities" | "clients";
type Props = { today: string; asOf: string; tenantName: string; viewerUserId: string; clients: ClientSummary[]; opportunities: OpportunityWithStage[]; tasks: PendingTask[];
  clientLogos: { companyName: string | null; logoId: string; logoName: string }[]; vendors: PipelineVendor[] };
const tabs: { key: Tab; label: string }[] = [{ key: "day", label: "Mi día" }, { key: "opportunities", label: "Oportunidades" }, { key: "clients", label: "Clientes y seguimiento" }];
export function CrmWorkspace({ tenantName, viewerUserId, clients, opportunities, tasks, clientLogos, vendors, today, asOf }: Props) {
  const [tab, setTab] = useState<Tab>("day");
  const [completedTaskIds, setCompletedTaskIds] = useState<string[]>([]);
  const pendingTasks = tasks.filter(task => !completedTaskIds.includes(task.taskId));
  const [hasOpenedClients, setHasOpenedClients] = useState(false);
  function openTab(next: Tab) {
    if (next === "clients") setHasOpenedClients(true);
    setTab(next);
  }
  const open = opportunities.filter(opp => opp.stage === "open");
  return <div className="space-y-6 text-zinc-900">
    <header className="rounded-xl border border-indigo-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-sm font-semibold text-indigo-800">PILOTO CRM · {tenantName}</p><h1 className="mt-1 text-3xl font-bold">Tu espacio comercial</h1><p className="mt-2 text-zinc-700">Revisa tus pendientes, retoma una oportunidad y registra el siguiente paso.</p></div><Link className="rounded-lg bg-indigo-700 px-5 py-3 font-semibold text-white hover:bg-indigo-800" href="/cotizaciones">Ir a cotizar</Link></div>
      <p className="mt-4 rounded-lg bg-indigo-50 p-3 text-sm text-indigo-950">Piloto para superadmin con los datos actuales de {tenantName}. El equipo conserva su recorrido habitual. Registrar un seguimiento es opcional.</p>
    </header>
    <nav aria-label="Secciones del CRM" className="flex flex-wrap gap-2">{tabs.map(item => <button key={item.key} type="button" aria-pressed={tab === item.key} onClick={() => openTab(item.key)} className={`rounded-lg border px-5 py-3 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700 ${tab === item.key ? "border-indigo-700 bg-indigo-700 text-white" : "border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-100"}`}>{item.label}</button>)}</nav>
    {tab === "day" ? <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">{[{ label: "Cuentas activas", value: clients.length, next: "clients" as Tab }, { label: "Oportunidades abiertas", value: open.length, next: "opportunities" as Tab }].map(card => <button type="button" key={card.label} onClick={() => openTab(card.next)} className="rounded-xl border border-zinc-300 bg-white p-5 text-left text-zinc-900 hover:border-indigo-500"><span className="block text-sm text-zinc-600">{card.label}</span><strong className="mt-2 block text-3xl">{card.value}</strong></button>)}<div className="rounded-xl border border-zinc-300 bg-white p-5"><span className="text-sm text-zinc-600">Seguimiento</span><button className="mt-3 block rounded-lg bg-indigo-700 px-4 py-2 font-semibold text-white hover:bg-indigo-800" type="button" onClick={() => openTab("clients")}>Registrar próximo paso</button></div></div>
      <AccountFollowUp clients={clients} opportunities={opportunities} tasks={pendingTasks} today={today} asOf={asOf} />
      <PendingTasksPanel tasks={pendingTasks} onCompleted={taskId => setCompletedTaskIds(current => [...current, taskId])} />
    </div> : null}
    {tab === "opportunities" ? <section className="space-y-4"><div className="rounded-xl border border-zinc-300 bg-white p-5"><h2 className="text-xl font-semibold">Oportunidades</h2><p className="mt-2 text-zinc-700">Las decisiones de las propuestas y el seguimiento comercial determinan el estado. Puedes pausar o cerrar sin decisión desde cada oportunidad. Revisa una cuenta para consultar sus cotizaciones y propuestas.</p></div><PipelineDashboard canSeeAll opportunities={opportunities} vendors={vendors} viewerUserId={viewerUserId} /></section> : null}
    {hasOpenedClients ? <section hidden={tab !== "clients"} className="space-y-4"><div className="rounded-xl border border-zinc-300 bg-indigo-50 p-5 text-indigo-950"><h2 className="text-xl font-semibold">Clientes y seguimiento</h2><p className="mt-2">Para dejar un próximo paso, busca la cuenta y pulsa <strong>Tarea</strong>: escribe qué sigue y cuándo. Usa <strong>Ver 360°</strong> para revisar su historial.</p></div><ClientShell clientLogos={clientLogos} initialClients={clients} /></section> : null}
  </div>;
}
