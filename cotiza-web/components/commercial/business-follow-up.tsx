import Link from "next/link";
import type { BusinessAction, BusinessStage } from "@/lib/domain/business-follow-up";

export function BusinessFollowUp({ stage, action }: { stage: BusinessStage; action: BusinessAction }) {
  const closed = stage === "won" || stage === "lost" || stage === "no_decision";
  return <section aria-label="Siguiente acción del negocio" className={`rounded-xl border p-5 ${stage === "won" ? "border-emerald-200 bg-emerald-50" : "border-zinc-200 bg-white"}`}>
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
      <div className="min-w-0">
        <h2 className="font-semibold">{closed ? "Seguimiento del cierre" : "Siguiente acción"}</h2>
        <p className="mt-1 max-w-3xl text-sm text-zinc-700">{action.message}</p>
      </div>
      <Link href={action.href} className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-zinc-900 px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-700">{action.label} →</Link>
    </div>
  </section>;
}
