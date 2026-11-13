"use client";
import { useEffect, useState } from "react";
import type { WinView } from "@/lib/domain/won-consolidation";
import { isSatisfied } from "@/lib/domain/won-consolidation";
export function WinConsolidationSummary({ proposalId }: { proposalId: string }) {
  const [view, setView] = useState<WinView | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/proposals/${encodeURIComponent(proposalId)}/consolidation`, { signal: controller.signal, cache: "no-store" })
      .then(async response => { if (response.ok) { const data = await response.json(); if (!controller.signal.aborted) setView(data); } }).catch(() => {});
    return () => controller.abort();
  }, [proposalId]);
  if (!view?.case || ["legacy", "cancelled", "not_accepted"].includes(view.state)) return null;
  return <span className="mt-2 block text-sm font-medium text-blue-900">{view.state === "consolidated" ? "Ganada consolidada" : view.state === "stale" ? "Documento modificado: revisar aceptación" : view.state === "blocked" ? "Consolidación observada" : "Aceptada: pendiente de consolidación"}
    {" · "}{view.requirements.filter(r => isSatisfied(r.decision)).length}/{view.requirements.length} OK</span>;
}
