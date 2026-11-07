import Link from "next/link";

export function CommercialFlow({ current, completed = [], next, attention }: { current: 1 | 2 | 3; completed?: number[]; next: string; attention?: string }) {
  const steps = [{ name: "Oportunidad", description: "Define el negocio", href: "/pipeline" }, { name: "Cotización", description: "Prepara productos y precios", href: "/cotizaciones" }, { name: "Propuesta", description: "Revisa, autoriza y presenta", href: "/propuestas" }];
  return <section aria-label="Recorrido comercial" className="rounded-xl border border-zinc-200 bg-white p-4 text-zinc-900">
    <ol className="grid gap-3 sm:grid-cols-3">{steps.map((step, i) => {
      const number = i + 1; const active = number === current; const done = completed.includes(number);
      return <li key={step.name} aria-current={active ? "step" : undefined} className={`rounded-lg border p-3 ${active && attention ? "border-amber-400 bg-amber-50 text-amber-950" : active ? "border-blue-600 bg-blue-50 text-blue-950" : done ? "border-emerald-300 bg-emerald-50 text-emerald-950" : "border-zinc-200 bg-zinc-50 text-zinc-700"}`}>
        <Link href={step.href} className="font-semibold underline-offset-4 hover:underline"><span aria-hidden="true">{done ? "✓ " : ""}</span>{number}. {step.name}</Link>
        <p className="mt-1 text-sm">{step.description}</p><p className="mt-1 text-xs font-semibold">{active && attention ? "Requiere atención" : active ? "Estás aquí" : done ? "Completado" : number < current ? "Paso anterior" : "Pendiente"}</p>
      </li>;
    })}</ol>
    {attention ? <p role="status" className="mt-3 text-sm font-medium text-amber-900">Requiere atención: {attention}</p> : null}
    <p className="mt-3 text-sm"><strong>Siguiente paso:</strong> {next}</p>
    <p className="mt-1 text-xs text-zinc-600">El avance de estos pasos es independiente del resultado comercial de la oportunidad.</p>
  </section>;
}
