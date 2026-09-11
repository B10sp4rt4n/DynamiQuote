"use client";

import Link from "next/link";
import { useState } from "react";

import type { PendingTask } from "@/lib/db/tasks";

function formatDueDate(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", year: "numeric" }).format(
    new Date(iso),
  );
}

export function PendingTasksPanel({ tasks: initialTasks }: { tasks: PendingTask[] }) {
  const [tasks, setTasks] = useState(initialTasks);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleComplete(taskId: string) {
    setCompletingId(taskId);
    setError(null);

    try {
      const response = await fetch(`/api/tasks/${taskId}`, { method: "PATCH" });
      const data = (await response.json()) as { error?: string; ok?: boolean };

      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "No se pudo completar la tarea");
      }

      setTasks((prev) => prev.filter((task) => task.taskId !== taskId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setCompletingId(null);
    }
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-zinc-900">Tus pendientes</h3>
          <p className="text-sm text-zinc-600">Tareas y recordatorios abiertos, ordenados por fecha.</p>
        </div>
        <span className="rounded-full bg-zinc-900 px-3 py-1 text-xs font-medium text-white">{tasks.length}</span>
      </div>

      {error ? <p className="mt-2 text-sm font-medium text-rose-700">{error}</p> : null}

      <div className="mt-4">
        {tasks.length === 0 ? (
          <p className="text-sm text-zinc-500">No tienes tareas pendientes.</p>
        ) : (
          <ul className="divide-y divide-zinc-200">
            {tasks.map((task) => (
              <li className="flex items-center justify-between gap-3 py-3" key={task.taskId}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-zinc-900">{task.description}</p>
                  <p className="text-xs text-zinc-500">
                    <Link className="hover:underline" href={`/configuracion/clientes`}>
                      {task.clientCompany}
                    </Link>
                    {task.opportunityNumber ? ` · ${task.opportunityNumber}` : ""}
                    {" · vence "}
                    {formatDueDate(task.dueDate)}
                  </p>
                </div>
                <button
                  className="shrink-0 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-60"
                  disabled={completingId === task.taskId}
                  onClick={() => void handleComplete(task.taskId)}
                  type="button"
                >
                  {completingId === task.taskId ? "..." : "Marcar hecha"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
