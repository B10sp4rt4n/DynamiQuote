"use client";
import { useState } from "react";
import { z } from "zod";
import { previewGuidedQuote, previewSavedQuote } from "@/lib/domain/guided-quote";
import type { EditableQuoteLine } from "@/lib/db/quote-editor";

const format = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
const fieldClass = "mt-1 block w-full rounded-lg border border-zinc-400 bg-white p-2 text-zinc-900 placeholder:text-zinc-500 focus:outline-2 focus:outline-indigo-700";
function optionsFromLine(line?: EditableQuoteLine) {
  return ["Opción actual", "Opción 2", "Opción 3"].map(name => ({ name, quantity: String(line?.quantity ?? 1), sku: line?.sku ?? "", costUnit: String(line?.costUnit ?? 0), priceUnit: String(line?.priceUnit ?? 0) }));
}
export function GuidedQuotePreview({ lines, minMarginPct, asOf, sourceQuoteId }: { lines: EditableQuoteLine[]; minMarginPct: number; asOf: string; sourceQuoteId: string }) {
  const [variable, setVariable] = useState(lines[lines.length - 1]?.lineId ?? "");
  const [basis, setBasis] = useState("saved");
  const [source, setSource] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [term, setTerm] = useState("Mismo plazo que la versión guardada");
  const [alternatives, setAlternatives] = useState(() => optionsFromLine(lines[lines.length - 1]));
  const [results, setResults] = useState<ReturnType<typeof previewGuidedQuote> | null>(null);
  const [error, setError] = useState<string | null>(null);
  function invalidate() { setResults(null); setError(null); }
  function calculate() {
    try {
      if (!lines.some(l => l.lineId === variable)) throw new Error("Selecciona el producto que quieres comparar.");
      if (alternatives.some(a => !a.sku.trim())) throw new Error("Completa el SKU de cada opción.");
      if (alternatives.some(a => !a.costUnit.trim() || !a.priceUnit.trim())) throw new Error("Completa el costo y precio de cada opción.");
      if (basis === "reference" && (!source.trim() || !validUntil)) throw new Error("Completa la referencia de precios y su fecha de vigencia.");
      if (basis === "reference" && validUntil < asOf) throw new Error("La referencia de precios está vencida. Revisa su vigencia.");
      const input = { currency: "MXN", term, source: basis === "saved" ? `Simulación basada en ${sourceQuoteId}; importes editables, sin validar vigencia` : source, validUntil, asOf, minMarginPct,
        fixed: lines.filter(l => l.lineId !== variable),
        alternatives: alternatives.map(a => ({ ...a, quantity: Number(a.quantity), costUnit: Number(a.costUnit), priceUnit: Number(a.priceUnit) })) };
      setResults(basis === "saved" ? previewSavedQuote(input) : previewGuidedQuote(input));
      setError(null);
    } catch (e) {
      setResults(null);
      setError(e instanceof z.ZodError ? "Revisa que las cantidades sean enteros mayores que cero, los importes tengan hasta dos decimales y todos los campos estén completos." : e instanceof Error ? e.message : "Revisa los datos.");
    }
  }
  return <section className="space-y-6 rounded-xl border border-zinc-300 bg-white p-6 text-zinc-900 shadow-sm">
    <div><h1 className="text-2xl font-bold">Comparar opciones de cotización</h1><p className="mt-2 text-zinc-700">Cambia cantidades o precios para ver cuánto venderías y qué margen quedaría. Esta comparación no modifica la cotización.</p></div>
    <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 text-indigo-950"><p className="font-semibold">1. Elige el producto · 2. Ajusta las opciones · 3. Compara resultados</p><p className="mt-2 text-sm">Las tres opciones empiezan con los mismos valores guardados. Cambia los que quieras probar. Los importes son MXN y corresponden al plazo completo, antes de impuestos.</p></div>
    <label className="block font-semibold">Producto que quieres comparar<select className={fieldClass} value={variable} onChange={e => { invalidate(); setVariable(e.target.value); setAlternatives(optionsFromLine(lines.find(l => l.lineId === e.target.value))); }}>{lines.map(l => <option key={l.lineId} value={l.lineId}>{l.sku} · {l.description}</option>)}</select></label>
    <div className="grid gap-4 sm:grid-cols-2"><label className="font-semibold">Precios para la simulación<select className={fieldClass} value={basis} onChange={e => { invalidate(); setBasis(e.target.value); }}><option value="saved">Partir de los precios guardados</option><option value="reference">Usar una nueva referencia de precios</option></select></label><label className="font-semibold">Plazo del servicio<input className={fieldClass} value={term} onChange={e => { invalidate(); setTerm(e.target.value); }} /></label></div>
    {basis === "reference" ? <div className="grid gap-4 sm:grid-cols-2"><label>Referencia de precios<input className={fieldClass} value={source} onChange={e => { invalidate(); setSource(e.target.value); }} placeholder="Número de cotización del fabricante o tarifario" /></label><label>Referencia válida hasta<input className={fieldClass} type="date" value={validUntil} onChange={e => { invalidate(); setValidUntil(e.target.value); }} /></label></div> : <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">Se copiaron los precios de esta versión como punto de partida. Puedes editarlos para simular; su vigencia no está verificada. Cambiar cantidad no aplica descuentos por volumen ni cambia el SKU.</p>}
    {alternatives.map((a,i) => <fieldset key={i} className="grid gap-3 rounded-xl border border-zinc-300 bg-zinc-50 p-4 sm:grid-cols-2 lg:grid-cols-5"><legend className="px-2 font-semibold text-indigo-900">{i === 0 ? "Opción 1 · Punto de partida" : `Opción ${i+1} · Ajusta los valores`}</legend>{(["name","sku","quantity","costUnit","priceUnit"] as const).map((field,index) => <label key={field} className="text-sm font-medium">{["Nombre","SKU","Cantidad","Costo unitario MXN","Precio unitario MXN"][index]}<input className={fieldClass} type={index >= 2 ? "number" : "text"} min={index === 2 ? 1 : index > 2 ? 0 : undefined} step={index === 2 ? 1 : index > 2 ? "0.01" : undefined} value={a[field]} onChange={e => { invalidate(); setAlternatives(old => old.map((item,j) => j === i ? { ...item, [field]: e.target.value } : item)); }} /></label>)}</fieldset>)}
    <button className="rounded-lg bg-indigo-700 px-6 py-3 font-semibold text-white hover:bg-indigo-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700" onClick={calculate} type="button">Comparar resultados</button>
    {error ? <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 font-medium text-red-900">{error}</p> : null}
    {results ? <div aria-live="polite" className="space-y-3 rounded-xl border border-zinc-300 p-4"><h2 className="text-xl font-bold">Resultado de la comparación</h2><p className="text-sm text-zinc-700">{results[0]?.source} · {term}{basis === "reference" ? ` · válida hasta ${validUntil}` : ""}</p><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-zinc-100"><tr>{["Opción","Costo total","Venta total","Utilidad","Margen","Revisión de margen"].map(h => <th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{results.map((r,i) => <tr key={i} className="border-t border-zinc-200"><td className="p-3 font-semibold">{r.name}</td><td className="p-3 whitespace-nowrap">{format(r.totalCost)}</td><td className="p-3 whitespace-nowrap">{format(r.totalRevenue)}</td><td className="p-3 whitespace-nowrap">{format(r.profit)}</td><td className="p-3">{r.marginPct.toFixed(4)}%</td><td className={`p-3 font-semibold ${r.belowMinimum ? "text-amber-900" : "text-emerald-800"}`}>{r.belowMinimum ? `Requiere revisión: mínimo ${minMarginPct}%` : "Cumple mínimo de margen"}</td></tr>)}</tbody></table></div><p className="text-sm text-zinc-700">El costo y la venta incluyen las demás partidas de esta versión. Este resultado no autoriza una propuesta. Para usar una opción, registra los cambios en el editor y sigue el flujo habitual de autorización.</p></div> : null}
    <details className="rounded-lg border border-zinc-300 p-4"><summary className="cursor-pointer font-semibold">Ver las demás partidas incluidas en todas las opciones</summary><div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["SKU","Cantidad","Costo unitario MXN","Precio unitario MXN"].map(h => <th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>{lines.filter(l => l.lineId !== variable).map(l => <tr key={l.lineId} className="border-t"><td className="p-2">{l.sku}</td><td className="p-2">{l.quantity}</td><td className="p-2">{format(l.costUnit)}</td><td className="p-2">{format(l.priceUnit)}</td></tr>)}</tbody></table></div></details>
  </section>;
}
