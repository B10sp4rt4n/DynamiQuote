"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type ExpiringProposalAlert = {
  proposalId: string;
  proposalNumber: string;
  recipientCompany: string;
  validUntil: string;
};

function formatValidUntil(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", year: "numeric" }).format(
    new Date(iso),
  );
}

export function ExpiryAlertsBell() {
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState<ExpiringProposalAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadAlerts() {
      setLoading(true);
      try {
        const res = await fetch("/api/proposals/expiring-alerts");
        const data = (await res.json()) as { alerts?: ExpiringProposalAlert[] };
        if (!cancelled) {
          setAlerts(data.alerts ?? []);
        }
      } catch {
        // Silencioso: no bloquear la navegacion por un fallo de alertas.
      } finally {
        if (!cancelled) {
          setLoading(false);
          setLoaded(true);
        }
      }
    }

    void loadAlerts();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={containerRef}>
      <button
        aria-label="Notificaciones de vigencia"
        className="relative rounded-full p-2 text-zinc-600 transition hover:bg-zinc-100"
        onClick={() => setOpen((prev) => !prev)}
        type="button"
      >
        <svg fill="none" height="20" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" width="20">
          <path
            d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5m6 0v1a3 3 0 1 1-6 0v-1m6 0H9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {loaded && alerts.length > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
            {alerts.length}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-20 mt-2 w-80 rounded-xl border border-zinc-200 bg-white p-3 shadow-lg">
          <p className="px-1 text-sm font-semibold text-zinc-900">Propuestas por vencer</p>
          {loading ? (
            <p className="px-1 py-3 text-sm text-zinc-500">Cargando...</p>
          ) : alerts.length === 0 ? (
            <p className="px-1 py-3 text-sm text-zinc-500">No hay propuestas por vencer.</p>
          ) : (
            <ul className="mt-2 max-h-80 space-y-1 overflow-y-auto">
              {alerts.map((alert) => (
                <li key={alert.proposalId}>
                  <Link
                    className="block rounded-lg px-2 py-2 text-sm transition hover:bg-zinc-50"
                    href={`/propuestas?proposalId=${alert.proposalId}`}
                    onClick={() => setOpen(false)}
                  >
                    <span className="block font-medium text-zinc-900">{alert.proposalNumber}</span>
                    <span className="block text-zinc-500">{alert.recipientCompany}</span>
                    <span className="block text-xs text-red-600">
                      Vence {formatValidUntil(alert.validUntil)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
