"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CommercialOptionsSummary } from "@/lib/domain/commercial-options";
import { PROPOSAL_RELATIONSHIP_LABELS, type ProposalRelationshipSummary } from "@/lib/domain/proposal-relationship";
export function OpportunityAmount({amount,options,relationship,opportunityId,canChoose=false,stage,currency="MXN",showCurrency=false,unknownCurrencyLabel="Moneda por confirmar",multipleCurrencies=false}:{amount:number;options?:CommercialOptionsSummary;relationship?:ProposalRelationshipSummary;opportunityId:string;canChoose?:boolean;stage?:string;currency?:string|null;showCurrency?:boolean;unknownCurrencyLabel?:string;multipleCurrencies?:boolean}) {
  const money = (value: number, code = currency, displayCode = showCurrency) => code
    ? new Intl.NumberFormat("es-MX", { style: "currency", currency: code, currencyDisplay: displayCode ? "code" : "symbol" }).format(value)
    : `${new Intl.NumberFormat("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} · ${unknownCurrencyLabel}`;
  const router=useRouter();const [saving,setSaving]=useState(false);const [error,setError]=useState<string|null>(null);
  async function choose(value:string) {
    setSaving(true);setError(null);
    try {const response=await fetch(`/api/opportunities/${encodeURIComponent(opportunityId)}/commercial-option`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({optionId:value||null})});const result=await response.json();if(!response.ok)throw Error(result.error??"No se pudo seleccionar");router.refresh();}
    catch(e){setError(e instanceof Error?e.message:"No se pudo seleccionar");}finally{setSaving(false);}
  }
  if (relationship) {
    const { range, amounts, pendingChoice, reviewRequired, unclassifiedCount } = relationship;
    return <div className="space-y-1">
      {range ? <span className="block font-semibold">
        {money(range.minimum, range.currency, true)}{range.maximum !== range.minimum ? ` a ${money(range.maximum, range.currency, true)}` : ""}
      </span> : amounts.length ? amounts.map(entry => <span key={entry.currency ?? "unknown"} className="block font-semibold">{money(entry.value, entry.currency, true)}</span>)
        : <span className="block font-semibold">{pendingChoice ? "Consulta los importes de las alternativas" : "Importe por confirmar"}</span>}
      <span className="block text-xs text-zinc-600">{PROPOSAL_RELATIONSHIP_LABELS[relationship.mode]}{pendingChoice ? " · por elegir" : ""}</span>
      {reviewRequired ? <span className="block text-xs text-amber-800">Revisa la relación o los importes de las propuestas.</span> : null}
      {unclassifiedCount ? <span className="block text-xs text-amber-800">{unclassifiedCount} {unclassifiedCount === 1 ? "propuesta sin clasificar" : "propuestas sin clasificar"}</span> : null}
    </div>;
  }
  if (!options) return multipleCurrencies ? <span>Importes en varias monedas · revisa cada propuesta</span> : <>{money(amount)}</>;

  const pending = stage !== "won" && !options.selectedOptionId;
  const hasProposalCurrency = options.options.some(option => option.currency !== undefined);
  const optionCurrency = (option: CommercialOptionsSummary["options"][number]) =>
    option.currency === undefined ? (hasProposalCurrency ? null : currency) : option.currency;
  const optionMoney = (option: CommercialOptionsSummary["options"][number]) => money(option.amount, optionCurrency(option), showCurrency || hasProposalCurrency);
  const currencies = new Set(options.options.map(optionCurrency));
  const rangeCurrency = currencies.values().next().value ?? null;
  const formatRangeAmount = (value: number) => money(value, rangeCurrency, showCurrency || hasProposalCurrency);
  const cannotCompare = currencies.size > 1 || (multipleCurrencies && !hasProposalCurrency);
  const range = cannotCompare ? "Consulta el importe de cada opción" : options.minimum === options.maximum
    ? formatRangeAmount(options.minimum)
    : `${formatRangeAmount(options.minimum)} a ${formatRangeAmount(options.maximum)}`;
  const selectedAmount = options.amountCurrency === undefined && multipleCurrencies
    ? "Consulta el importe de la propuesta"
    : money(amount, options.amountCurrency === undefined ? currency : options.amountCurrency, showCurrency || options.amountCurrency !== undefined);

  return <div className="space-y-2 text-zinc-900"><span className="block font-semibold">{options.reviewRequired ? "Revisar decisiones de alternativas" : pending ? range : selectedAmount}</span>
    {options.optionCount > 0 ? <span className="block text-xs text-zinc-600">{options.optionCount} {options.optionCount === 1 ? "opción" : "opciones alternativas"}{pending ? " · por elegir" : " · se cuenta una sola opción"}</span> : null}
    {canChoose && stage === "open" && !options.reviewRequired ? <label className="block text-xs font-medium">
      Opción en negociación
      <select aria-label="Opción en negociación" className="mt-1 block max-w-full rounded-lg border border-zinc-400 bg-white p-2 text-zinc-900" disabled={saving} value={options.selectedOptionId ?? ""} onChange={event => void choose(event.target.value)}>
        <option value="">Sin elegir · mostrar rango</option>
        {options.options.map(option => <option key={option.id} value={option.id}>{option.label} · {optionMoney(option)}</option>)}
      </select>
      <span className="mt-1 block text-zinc-600">La preferencia solo se usa para estimar el negocio.</span>
    </label> : null}
    {options.optionCount > 0 ? <details><summary className="cursor-pointer text-xs font-semibold text-indigo-800">Ver opciones cotizadas</summary>{options.options.map(o=><Link key={o.id} className="mt-1 block text-xs text-indigo-800 underline" href={`/cotizaciones?quoteId=${encodeURIComponent(o.quoteId)}`}>{o.label} · {optionMoney(o)}</Link>)}</details> : null}
    {error?<span role="alert" className="block text-xs text-red-800">{error}</span>:null}
  </div>;
}
