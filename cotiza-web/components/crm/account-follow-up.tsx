"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ClientSummary } from "@/lib/db/clients";
import type { OpportunityWithStage } from "@/lib/db/opportunities";
import type { PendingTask } from "@/lib/db/tasks";
import { accountMatchesFilter, accountNextAction, buildAccountFollowUps, sortAccountsForFilter, type AccountFilter } from "@/lib/domain/crm-account-follow-up";

const filters: { key: AccountFilter; label: string }[] = [
  { key: "attention", label: "Por atender" }, { key: "open", label: "Abiertas" }, { key: "won", label: "Ganadas" }, { key: "all", label: "Todas" },
];
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function AccountFollowUp({ clients, opportunities, tasks, today, asOf }: {
  clients: ClientSummary[]; opportunities: OpportunityWithStage[]; tasks: PendingTask[]; today: string; asOf: string;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<AccountFilter>("attention");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(6);
  const [refreshing, startRefresh] = useTransition();
  const accounts = useMemo(() => buildAccountFollowUps(clients, opportunities, tasks, today), [clients, opportunities, tasks, today]);
  const matching = accounts.filter(account => normalize(account.company).includes(normalize(search.trim())));
  const visible = sortAccountsForFilter(matching.filter(account => accountMatchesFilter(account, filter)), filter);

  return <section className="rounded-xl border border-zinc-300 bg-white p-5" aria-label="Seguimiento de cuentas">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h2 className="text-xl font-semibold">Cuentas y siguiente acción</h2>
        <p className="mt-1 text-sm text-zinc-600">Primero las tareas vencidas, las de hoy y los negocios abiertos. Cada cuenta muestra sus cierres y pendientes reales.</p>
        <p className="mt-1 text-sm text-zinc-600">Actualizado: {new Intl.DateTimeFormat("es-MX", { timeZone: "America/Mexico_City", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(asOf))}</p>
      </div>
      <button type="button" disabled={refreshing} onClick={() => startRefresh(() => router.refresh())} className="min-h-11 rounded-lg border border-zinc-400 px-3 py-2 text-sm font-semibold disabled:opacity-50">{refreshing ? "Actualizando…" : "Actualizar cuentas"}</button>
    </div>
    <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-wrap gap-2" aria-label="Filtrar cuentas">{filters.map(item => <button key={item.key} type="button" aria-pressed={filter === item.key}
        onClick={() => { setFilter(item.key); setLimit(6); }} className={`min-h-11 rounded-lg border px-3 py-2 text-sm font-semibold ${filter === item.key ? "border-indigo-700 bg-indigo-700 text-white" : "border-zinc-300 bg-white text-zinc-900"}`}>
        {item.label} ({matching.filter(account => accountMatchesFilter(account, item.key)).length})
      </button>)}</div>
      <label className="grid min-w-0 gap-1 text-sm font-medium">Buscar empresa<input className="min-h-11 w-full rounded-lg border border-zinc-400 bg-white px-3 py-2 text-zinc-900 placeholder:text-zinc-500"
        value={search} placeholder="Ej. HL Innovación" onChange={event => { setSearch(event.target.value); setLimit(6); }} /></label>
    </div>
    <p className="mt-3 text-sm text-zinc-600">Los filtros cuentan cuentas; una misma cuenta puede tener oportunidades abiertas y ganadas.</p>
    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{visible.slice(0, limit).map(account => {
      const next = accountNextAction(account, filter, today);
      const badge = next.kind === "won" ? "bg-emerald-100 text-emerald-900" : next.kind === "task" ? "bg-amber-100 text-amber-950" : "bg-blue-50 text-blue-950";
      return <article key={account.clientId} aria-label={account.company} className="flex min-w-0 flex-col rounded-lg border border-zinc-300 p-4">
        <h3 className="break-words font-semibold"><Link className="underline decoration-zinc-300 underline-offset-4" href={`/clientes/${encodeURIComponent(account.clientId)}`}>{account.company}</Link></h3>
        <p className="mt-2 text-sm text-zinc-600">{account.open.length} {account.open.length === 1 ? "abierta" : "abiertas"} · {account.won.length} {account.won.length === 1 ? "ganada" : "ganadas"} · {account.tasks.length} {account.tasks.length === 1 ? "tarea pendiente" : "tareas pendientes"}{account.paused.length ? ` · ${account.paused.length} ${account.paused.length === 1 ? "pausada" : "pausadas"}` : ""}</p>
        <span className={`mt-3 self-start rounded-md px-2 py-1 text-sm font-semibold ${badge}`}>{next.label}</span>
        <p className="mt-2 break-words text-sm">{next.detail}</p>
        {next.date ? <p className="mt-1 text-sm text-zinc-600">{next.date}</p> : null}
        <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 pt-4">
          <Link className="inline-flex min-h-11 items-center text-sm font-semibold text-indigo-800 underline" href={next.href}>{next.action}</Link>
          {next.kind !== "account" ? <Link className="inline-flex min-h-11 items-center text-sm text-zinc-700 underline" href={`/clientes/${encodeURIComponent(account.clientId)}`}>Ver cuenta</Link> : null}
        </div>
      </article>;
    })}</div>
    {!visible.length ? <p className="mt-4 text-zinc-600">{filter === "attention" ? "No hay cuentas con tareas u oportunidades abiertas por atender en esta búsqueda. Consulta los cierres en Ganadas o el historial en Todas." : "No hay cuentas que coincidan con este filtro y búsqueda."}</p> :
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-zinc-600">Mostrando {Math.min(limit, visible.length)} de {visible.length} cuentas.</p>
        {visible.length > limit ? <button type="button" onClick={() => setLimit(current => current + 6)} className="min-h-11 rounded-lg border border-zinc-400 px-3 py-2 text-sm font-semibold">Ver más cuentas</button> : null}
      </div>}
  </section>;
}
