"use client";
import { useState, type FormEvent } from "react";
import { invoiceNumberingInput, invoiceNumberingState, numberingPreview, MAX_INVOICE_NUMBER, type InvoiceNumberingState } from "@/lib/domain/invoice-numbering";

export function InvoiceNumberingPanel({ tenantId, tenantName, initial }: {
  tenantId: string; tenantName: string; initial: InvoiceNumberingState;
}) {
  const [state, setState] = useState(initial);
  const [prefix, setPrefix] = useState(initial.policy?.prefix ?? "FAC");
  const [includeYear, setIncludeYear] = useState(initial.policy?.include_year ?? true);
  const [reset, setReset] = useState(initial.policy?.reset_annually ?? false);
  const [digits, setDigits] = useState(String(initial.policy?.digits ?? 6));
  const [next, setNext] = useState(String(initial.policy?.next_number ?? 1));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);
  const parsed = invoiceNumberingInput.safeParse({ prefix, include_year: includeYear, reset_annually: reset,
    digits: Number(digits), next_number: Number(next), expected_revision: state.policy?.revision ?? 0 });
  const examples = parsed.success ? numberingPreview(parsed.data, state.year) : [];
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!parsed.success || saving || stale) return;
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/settings/invoice-numbering", { method: "PUT",
        headers: { "Content-Type": "application/json", "X-Tenant-Context": tenantId }, body: JSON.stringify(parsed.data) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "No se pudo guardar la numeración");
      const result = invoiceNumberingState.parse(body);
      if (!result.available || !result.policy) throw new Error("No se pudo confirmar la configuración");
      setState(result); setPrefix(result.policy.prefix); setIncludeYear(result.policy.include_year);
      setReset(result.policy.reset_annually); setDigits(String(result.policy.digits)); setNext(String(result.policy.next_number));
      setMessage(`Numeración guardada para ${tenantName}. Próximo folio: ${result.policy.examples[0]}.`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No se pudo confirmar el guardado");
      setStale(true);
    } finally { setSaving(false); }
  }
  return <section className="mx-auto max-w-3xl space-y-5 text-zinc-900">
    <header><h1 className="text-2xl font-semibold">Series y folios de facturas</h1>
      <p className="mt-2 text-sm text-zinc-600">Define la numeración de {tenantName}. El folio fiscal UUID lo genera el timbrado.</p></header>
    {!state.available ? <p role="status" className="rounded-xl border bg-amber-50 p-5 text-sm">La configuración de folios está pendiente de habilitación para esta empresa.</p> :
    <form onSubmit={save} className="space-y-5 rounded-xl border border-zinc-200 bg-white p-5">
      <fieldset disabled={saving || stale} className="grid min-w-0 gap-4 sm:grid-cols-2">
        <legend className="sr-only">Formato del folio</legend>
        <label className="text-sm font-medium">Serie o prefijo
          <input className="mt-1 min-h-11 w-full rounded-lg border border-zinc-300 px-3" value={prefix} maxLength={25}
            onChange={event => { setPrefix(event.target.value.toUpperCase()); setMessage(""); }} placeholder="FAC" />
          <span className="mt-1 block text-xs font-normal text-zinc-600">Puedes dejarlo vacío para usar sólo el consecutivo.</span></label>
        <label className="text-sm font-medium">Próximo número
          <input type="number" min={1} max={MAX_INVOICE_NUMBER} step={1} className="mt-1 min-h-11 w-full rounded-lg border border-zinc-300 px-3"
            value={next} onChange={event => { setNext(event.target.value); setMessage(""); }} />
          <span className="mt-1 block text-xs font-normal text-zinc-600">Continúa desde el último número usado en tu sistema anterior.</span></label>
        <label className="text-sm font-medium">Cantidad mínima de dígitos
          <select className="mt-1 min-h-11 w-full rounded-lg border border-zinc-300 px-3" value={digits} onChange={event => { setDigits(event.target.value); setMessage(""); }}>
            {Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}
          </select></label>
        <div className="space-y-3 text-sm">
          <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={includeYear}
            onChange={event => { setIncludeYear(event.target.checked); if (!event.target.checked) setReset(false); setMessage(""); }} />Incluir año en la serie</label>
          <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={reset} disabled={!includeYear}
            onChange={event => { setReset(event.target.checked); setMessage(""); }} />Reiniciar en 1 cada año</label>
        </div>
      </fieldset>
      <div aria-live="polite" className="min-w-0 rounded-xl bg-indigo-50 p-4">
        <h2 className="font-semibold">Vista previa de los próximos folios</h2>
        <p className="mt-2 break-words font-mono text-sm">{examples.length ? examples.join(" · ") : "Revisa los campos para mostrar la vista previa"}</p>
        <p className="mt-2 text-xs text-zinc-600">Vista estimada. El consecutivo se reserva al timbrar. El cambio de año se calcula con la hora de Ciudad de México.</p>
      </div>
      <p className="text-sm text-zinc-600">Las nuevas prefacturas usarán la configuración vigente al timbrar. Las que ya tienen folio reservado y las anteriores a activar esta función conservan su numeración. Cada factura tiene un folio propio y mantiene la propuesta como referencia.</p>
      <p className="text-sm text-zinc-600">Los folios reservados se conservan ante rechazos o cancelaciones. Los reintentos usan el mismo número. Las notas de crédito y los complementos de pago tendrán su configuración en otra entrega.</p>
      {!parsed.success ? <p role="alert" className="text-sm text-red-700">{parsed.error.issues[0]?.message}</p> : null}
      {message ? <p role="status" className="text-sm text-emerald-800">{message}</p> : null}
      {error ? <p role="alert" className="text-sm text-red-700">{error} Recarga para consultar la configuración vigente.</p> : null}
      {stale ? <a href="/configuracion/facturacion" className="inline-block min-h-11 rounded-lg border px-4 py-3 text-sm">Recargar configuración</a> :
        <button type="submit" disabled={!parsed.success || saving} className="min-h-11 rounded-lg bg-zinc-900 px-4 py-3 text-sm font-medium text-white disabled:opacity-50">
          {saving ? "Guardando…" : "Guardar numeración"}</button>}
    </form>}
  </section>;
}
