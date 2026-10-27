"use client";
import { useState } from "react";
import { previewGuidedQuote } from "@/lib/domain/guided-quote";
import type { EditableQuoteLine } from "@/lib/db/quote-editor";

const format = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
export function GuidedQuotePreview({ lines, minMarginPct, asOf }: { lines: EditableQuoteLine[]; minMarginPct: number; asOf: string }) {
  const [variable, setVariable] = useState(lines[lines.length - 1]?.lineId ?? "");
  const [source, setSource] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [term, setTerm] = useState("Anual");
  const [alternatives, setAlternatives] = useState([100,250,500].map(quantity => ({ name: `${quantity} unidades`, quantity: String(quantity), sku: "", costUnit: "", priceUnit: "" })));
  const [results, setResults] = useState<ReturnType<typeof previewGuidedQuote> | null>(null);
  const [error, setError] = useState<string | null>(null);
  function invalidate() { setResults(null); setError(null); }
  function calculate() {
    try {
      if (!lines.some(l => l.lineId === variable)) throw new Error("Selecciona la partida que varía");
      if (alternatives.some(a => !a.costUnit.trim() || !a.priceUnit.trim())) throw new Error("Captura costo y precio para cada alternativa");
      setResults(previewGuidedQuote({ currency: "MXN", term, source, validUntil, asOf, minMarginPct,
        fixed: lines.filter(l => l.lineId !== variable),
        alternatives: alternatives.map(a => ({ ...a, quantity: Number(a.quantity), costUnit: Number(a.costUnit), priceUnit: Number(a.priceUnit) })) }));
      setError(null);
    } catch (e) { setResults(null); setError(e instanceof Error ? e.message : "Revisa los datos"); }
  }
  return <section className="space-y-5 rounded-xl border bg-white p-6">
    <h1 className="text-xl font-semibold">Cotización guiada · Comparar alternativas</h1>
    <p>Simulación en MXN con precios por la vigencia completa. La referencia capturada debe revisarse con el fabricante. La simulación no guarda cambios ni concede autorizaciones.</p>
    <label className="block">Partida que cambia entre alternativas<select className="block w-full border p-2" value={variable} onChange={e => { invalidate(); setVariable(e.target.value); }}>{lines.map(l => <option key={l.lineId} value={l.lineId}>{l.sku} · {l.description}</option>)}</select></label>
    <p>Las demás partidas conservan cantidades, costos y precios de esta versión guardada.</p>
    <div className="overflow-x-auto"><table className="w-full text-left"><caption>Base fija de todas las alternativas</caption><thead><tr><th>SKU</th><th>Cantidad</th><th>Costo unitario MXN</th><th>Precio unitario MXN</th></tr></thead><tbody>{lines.filter(l => l.lineId !== variable).map(l => <tr key={l.lineId}><td>{l.sku}</td><td>{l.quantity}</td><td>{format(l.costUnit)}</td><td>{format(l.priceUnit)}</td></tr>)}</tbody></table></div>
    <div className="grid gap-3 sm:grid-cols-3">
      <label>Referencia de precios<input className="block w-full border p-2" value={source} onChange={e => { invalidate(); setSource(e.target.value); }} placeholder="Cotización del fabricante o tarifario" /></label>
      <label>Referencia válida hasta<input className="block w-full border p-2" type="date" value={validUntil} onChange={e => { invalidate(); setValidUntil(e.target.value); }} /></label>
      <label>Vigencia del servicio<input className="block w-full border p-2" value={term} onChange={e => { invalidate(); setTerm(e.target.value); }} /></label>
    </div>
    <p>Confirma el SKU y los precios de cada alternativa. Cambiar la cantidad no selecciona automáticamente otro SKU o tramo de precios.</p>
    {alternatives.map((a,i) => <fieldset key={i} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-5"><legend>Alternativa {i+1}</legend>{(["name","sku","quantity","costUnit","priceUnit"] as const).map((field,index) => <label key={field}>{["Nombre","SKU","Cantidad","Costo unitario MXN","Precio unitario MXN"][index]}<input className="block w-full border p-2" value={a[field]} onChange={e => { invalidate(); setAlternatives(old => old.map((item,j) => j === i ? { ...item, [field]: e.target.value } : item)); }} /></label>)}</fieldset>)}
    <button className="rounded-lg bg-zinc-900 px-4 py-2 text-white" onClick={calculate} type="button">Comparar alternativas</button>
    {error ? <p role="alert">Revisa la referencia, la vigencia y los importes. {error}</p> : null}
    {results ? <div className="overflow-x-auto"><p>Referencia: {source} · {term} · válida hasta {validUntil}</p><table className="w-full text-left"><thead><tr>{["Alternativa","Costo","Venta","Utilidad","Margen","Evaluación orientativa"].map(h => <th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>{results.map((r,i) => <tr key={i}><td className="p-2">{r.name}</td><td>{format(r.totalCost)}</td><td>{format(r.totalRevenue)}</td><td>{format(r.profit)}</td><td>{r.marginPct.toFixed(4)}%</td><td>{r.belowMinimum ? `Debajo del mínimo ${minMarginPct}%` : "Evaluar aprobación formal"}</td></tr>)}</tbody></table><p>La autorización final se resuelve en la propuesta y sus reglas vigentes.</p></div> : null}
  </section>;
}
