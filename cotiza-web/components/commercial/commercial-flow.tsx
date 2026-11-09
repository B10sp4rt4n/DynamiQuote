import Link from "next/link";
import type { CommercialContext } from "@/lib/domain/business-follow-up";

type Props = {
  current: 1 | 2 | 3; next?: string; attention?: string; context?: CommercialContext;
  summaries?: [string, string, string]; hideContext?: boolean;
};

export function CommercialFlow({ current, next, attention, context, summaries, hideContext = false }: Props) {
  const closed = context?.stage && context.stage !== "open";
  const steps = [
    { name: "Oportunidad", description: "Datos y resultado del negocio", href: "/pipeline" },
    { name: "Cotización", description: "Productos, precios y revisiones", href: "/cotizaciones" },
    { name: "Propuesta", description: "Autorización y documentos del cliente", href: "/propuestas" },
  ];
  if (context) {
    steps[0].href = `/oportunidades/${encodeURIComponent(context.opportunityId)}`;
    steps[1].href = context.quoteId ? `/cotizaciones?quoteId=${encodeURIComponent(context.quoteId)}` : closed ? `/oportunidades/${encodeURIComponent(context.opportunityId)}#cotizaciones` : `/cotizaciones?opportunityId=${encodeURIComponent(context.opportunityId)}`;
    steps[2].href = context.proposalId ? `/propuestas/${encodeURIComponent(context.proposalId)}` : `/oportunidades/${encodeURIComponent(context.opportunityId)}#propuestas`;
  }
  return <section aria-label="Secciones del negocio" className="rounded-xl border border-zinc-200 bg-white p-4 text-zinc-900">
    <h2 className="text-sm font-semibold">Secciones del negocio</h2>
    {context && !hideContext ? <p className="mt-1 break-words text-sm text-zinc-600">{context.opportunityNumber ?? ""} · {context.title ?? ""}</p> : null}
    <ol className="mt-3 grid gap-3 sm:grid-cols-3">{steps.map((step, i) => {
      const active = i + 1 === current;
      return <li key={step.name} className={`rounded-lg border p-3 ${active ? "border-blue-300 bg-blue-50 text-blue-950" : "border-zinc-200 bg-zinc-50 text-zinc-700"}`}>
        <Link href={step.href} aria-current={active ? "page" : undefined} className="inline-flex min-h-11 items-center font-semibold underline-offset-4 hover:underline">{i + 1}. {step.name}</Link>
        <p className="mt-1 text-sm">{summaries?.[i] ?? step.description}</p>
        {active ? <p className="mt-1 text-xs font-semibold">Sección actual</p> : null}
      </li>;
    })}</ol>
    {attention ? <p role="status" className="mt-3 text-sm font-medium text-amber-900">Requiere atención: {attention}</p> : null}
    {next ? <p className="mt-3 text-sm"><strong>{closed ? "Seguimiento:" : "Siguiente acción:"}</strong> {closed ? "Consulta el resultado y el seguimiento en la ficha del negocio." : next}</p> : null}
  </section>;
}
