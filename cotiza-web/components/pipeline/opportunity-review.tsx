"use client";

import { useId, useRef } from "react";
import type { OpportunityWithStage } from "@/lib/db/opportunities";
import { DISPOSITION_LABELS } from "@/lib/domain/opportunity-disposition";
import { OpportunityAmount } from "./opportunity-amount";
import { OpportunityDispositionControl } from "./opportunity-disposition";

export function OpportunityReview({ opportunity: opp, canManage }: { opportunity: OpportunityWithStage; canManage: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  return <>
    <button type="button" onClick={() => dialog.current?.showModal()} className="mt-2 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-900">Revisar oportunidad</button>
    <dialog ref={dialog} aria-labelledby={titleId} className="fixed inset-0 m-auto max-h-[calc(100dvh_-_2rem)] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-xl border border-zinc-300 bg-white p-5 text-left whitespace-normal break-words text-zinc-900 shadow-2xl backdrop:bg-black/40">
      <h2 id={titleId} className="text-lg font-semibold">{opp.opportunityNumber} · {opp.title}</h2>
      <p className="mt-2 whitespace-normal text-sm">{opp.clientCompany ?? "Sin cliente"} · {DISPOSITION_LABELS[opp.stage]}</p>
      <div className="mt-4 whitespace-normal text-sm"><OpportunityAmount amount={opp.amount} options={opp.commercialOptions} opportunityId={opp.opportunityId} stage={opp.stage} /></div>
      <OpportunityDispositionControl key={`${opp.opportunityId}:${opp.disposition?.revision ?? 0}`} opportunity={opp} canManage={canManage} />
      <div className="mt-5 border-t border-zinc-200 pt-4"><button type="button" onClick={() => dialog.current?.close()} className="min-h-11 rounded-lg border border-zinc-400 px-4 py-2 text-sm font-semibold">Cerrar revisión</button></div>
    </dialog>
  </>;
}
