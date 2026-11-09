"use client";

import { useEffect, useId, useRef, useState } from "react";
import { SALE_NATURES, type ClassificationMemory, type FiscalClassification, type SaleNature, type SatCatalogEntry,
  type SatCatalogInfo, type SatCatalogKind, type SatSearchResult, type SatValidation } from "@/lib/domain/fiscal-classification";

type Selected = { entry: SatCatalogEntry; catalog: SatCatalogInfo };
const control = "mt-1 min-w-0 w-full rounded border border-zinc-300 bg-white p-2 text-sm text-zinc-900";
const button = "rounded border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-900 disabled:opacity-50";

function CatalogSearch({ kind, initialQuery, endpoint, nature, selected, onSelect, onEdit }: {
  kind: SatCatalogKind; initialQuery: string; endpoint: string; nature: SaleNature; selected: Selected | null;
  onSelect: (value: Selected) => void; onEdit: () => void;
}) {
  const id = useId();
  const [query, setQuery] = useState(initialQuery.slice(0, 200));
  const [result, setResult] = useState<SatSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  async function search() {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setLoading(true); setError(""); setResult(null);
    try {
      const res = await fetch(`${endpoint}&${new URLSearchParams({ kind, q: query, nature })}`, { signal: controller.signal });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo buscar");
      if (!controller.signal.aborted) setResult(data);
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "No se pudo buscar");
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }
  return <div data-catalog={kind} className="min-w-0 space-y-2">
    <label htmlFor={id} className="text-xs font-semibold text-zinc-700">{kind === "product" ? "Producto o servicio SAT" : "Unidad SAT"}</label>
    <div className="flex items-start gap-2">
      <input id={id} className={control} maxLength={200} value={query} placeholder={kind === "product" ? "Ej. software de seguridad o clave" : "Ej. unidad de servicio, pieza o E48"}
        onChange={event => { request.current?.abort(); setLoading(false); setResult(null); setQuery(event.target.value); onEdit(); }}
        onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); if (query.trim()) void search(); } }} />
      <button type="button" className={`${button} mt-1`} disabled={loading || !query.trim()} onClick={() => void search()}>{loading ? "Buscando…" : "Buscar"}</button>
    </div>
    {selected ? <div className="rounded border border-emerald-300 bg-emerald-50 p-2 text-sm text-emerald-950"><strong>{selected.entry.code}</strong> · {selected.entry.description}
      {!selected.entry.valid ? <p className="text-rose-800">Esta clave no está vigente.</p> : null}</div> : null}
    {error ? <p role="alert" className="text-xs text-rose-700">{error}</p> : null}
    {result ? <div className="max-h-72 space-y-2 overflow-y-auto rounded border border-zinc-200 p-2" aria-label={`Resultados ${kind === "product" ? "de productos" : "de unidades"}`}>
      <p className="text-xs text-zinc-600">{result.results.length ? "Candidatos para revisar" : "Sin coincidencias. Prueba una descripción más concreta o la clave."}</p>
      {result.results.map(entry => <button key={entry.code} type="button" disabled={!entry.valid} onClick={() => { onSelect({ entry, catalog: result.catalog }); setResult(null); }}
        className="block w-full rounded border border-zinc-200 bg-white p-2 text-left text-zinc-900 hover:border-blue-500 disabled:opacity-50">
        <span className="text-sm"><strong>{entry.code}</strong> · {entry.description}</span>
        {entry.details ? <span className="mt-1 block text-xs text-zinc-600">{entry.details}</span> : null}
        {entry.domainRelations?.length ? <span className="mt-1 block text-xs text-blue-800">Relación de búsqueda: {entry.domainRelations.join("; ")}</span> : null}
        <span className="mt-1 block text-xs text-zinc-500">{entry.valid ? "Vigente" : "Fuera de vigencia"} · desde {entry.validFrom ?? "sin fecha"}{entry.validTo ? ` hasta ${entry.validTo}` : ""}</span>
      </button>)}
      <p className="text-xs text-zinc-500">SAT · archivo del {result.catalog.publishedAt}</p>
    </div> : null}
  </div>;
}

export function FiscalClassificationPicker({ proposalId, itemNumber, description, sku, fingerprint, onChange, anchorId, initialEventId }: {
  proposalId: string; itemNumber: number; description: string; sku?: string; fingerprint: string; anchorId?: string;
  onChange: (classification: FiscalClassification | null, restored?: boolean) => void;
  initialEventId?: string;
}) {
  const id = useId();
  const fieldset = useRef<HTMLFieldSetElement>(null);
  const endpoint = `/api/proposals/${proposalId}/fiscal-classifications?itemNumber=${itemNumber}`;
  const [nature, setNature] = useState<SaleNature | "">("");
  const [product, setProduct] = useState<Selected | null>(null), [unit, setUnit] = useState<Selected | null>(null);
  const [reviewed, setReviewed] = useState(false), [remember, setRemember] = useState(true);
  const [confirmed, setConfirmed] = useState(false), [pending, setPending] = useState(false), [error, setError] = useState("");
  const confirming = useRef(false);
  const editRevision = useRef(0);
  const initialReceipt = useRef(initialEventId);
  const changeCallback = useRef(onChange);
  useEffect(() => { changeCallback.current = onChange; }, [onChange]);
  useEffect(() => {
    const controller = new AbortController(), revision = editRevision.current;
    void fetch(`${endpoint}&mode=resume&expectedFingerprint=${fingerprint}${initialReceipt.current ? `&eventId=${initialReceipt.current}` : ""}`, { signal: controller.signal, cache: "no-store" }).then(async res => {
      const data = await res.json();
      if (controller.signal.aborted || editRevision.current !== revision) return;
      if (!res.ok) { changeCallback.current(null); setError("No se pudo recuperar la clasificación guardada. Puedes revisar y confirmar las claves nuevamente."); return; }
      if (!data.saved) { if (data.reviewRequired || initialReceipt.current) { changeCallback.current(null); setError(data.message ?? "La revisión guardada ya no se puede recuperar. Revisa y confirma las claves nuevamente."); } return; }
      const row = data.validation?.items?.find((entry: { itemNumber: number }) => entry.itemNumber === itemNumber);
      if (!row?.product || !row?.unit) return;
      setNature(data.saved.nature); setRemember(data.saved.remember);
      setProduct({ entry: row.product, catalog: data.validation.catalog });
      setUnit({ entry: row.unit, catalog: data.validation.catalog });
      setReviewed(true); setConfirmed(true);
      changeCallback.current(data.saved.classification, true);
    }).catch(() => {
      if (!controller.signal.aborted && editRevision.current === revision)
        { changeCallback.current(null); setError("No se pudo recuperar la clasificación guardada. Puedes revisar y confirmar las claves nuevamente."); }
    });
    return () => controller.abort();
  }, [endpoint, fingerprint, itemNumber]);
  const [memory, setMemory] = useState<{ memory: ClassificationMemory; validation: SatValidation } | null>(null);
  const catalog = product?.catalog ?? unit?.catalog;
  // Both selects originate in a single immutable snapshot. Never combine versions.
  const ready = product?.entry.valid && unit?.entry.valid && product.catalog.sourceSha256 === unit.catalog.sourceSha256;
  const nextStep = !nature ? "Selecciona qué estás facturando."
    : !product?.entry.valid ? "Busca y selecciona el producto o servicio SAT."
    : !unit?.entry.valid ? "Busca y selecciona la Unidad SAT."
    : !ready ? "Vuelve a seleccionar las dos claves del mismo catálogo."
    : !reviewed ? "Marca la casilla de revisión de las dos claves."
    : "Pulsa Confirmar clasificación para guardar tu revisión.";
  function focusNextStep() {
    const target = !nature ? "select" : !product?.entry.valid ? '[data-catalog="product"] input'
      : !unit?.entry.valid ? '[data-catalog="unit"] input' : !ready ? '[data-catalog="product"] input'
      : !reviewed ? 'input[type="checkbox"]' : '[data-confirm-classification]';
    fieldset.current?.querySelector<HTMLElement>(target)?.focus();
  }
  useEffect(() => {
    if (!nature || confirmed) return;
    const controller = new AbortController();
    void fetch(`${endpoint}&mode=memory&nature=${nature}`, { signal: controller.signal }).then(async res => {
      const data = await res.json();
      if (res.ok && data.memory && !controller.signal.aborted) setMemory(data);
    }).catch(() => {});
    return () => controller.abort();
  }, [endpoint, nature, confirmed]);
  function invalidate() { editRevision.current++; setReviewed(false); setConfirmed(false); setError(""); onChange(null); }
  async function confirm() {
    if (confirming.current || confirmed || !nature || !ready || !reviewed || !product || !unit) return;
    confirming.current = true;
    setPending(true); setError("");
    try {
      const res = await fetch(`/api/proposals/${proposalId}/fiscal-classifications`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemNumber, expectedFingerprint: fingerprint, nature, satProductCode: product.entry.code, unitCode: unit.entry.code,
          catalogVersion: product.catalog.sourceSha256, confirm: true, remember }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo confirmar");
      setConfirmed(true); onChange(data.classification);
    } catch (err) { invalidate(); setError(err instanceof Error ? err.message : "No se pudo confirmar"); }
    finally { confirming.current = false; setPending(false); }
  }
  return <fieldset ref={fieldset} id={anchorId} tabIndex={-1} disabled={pending} className="min-w-0 space-y-3 rounded-lg border border-zinc-200 p-3">
    <legend className="px-1 text-sm font-semibold text-zinc-900">{itemNumber}. {description}</legend>
    <div className={confirmed ? "rounded bg-emerald-50 p-2 text-xs text-emerald-900" : "rounded bg-amber-50 p-2 text-xs text-amber-900"}>
      <p id={`${id}-next`} role="status">{pending ? "Validando y guardando la clasificación…" : confirmed ? "Partida lista para generar la prefactura." : `Siguiente paso: ${nextStep}`}</p>
      {!confirmed && !pending ? <button type="button" className="mt-2 min-h-9 font-semibold underline" onClick={focusNextStep}>Ir al siguiente paso</button> : null}
    </div>
    {sku ? <p className="text-xs text-zinc-500">SKU: {sku}</p> : null}
    <label htmlFor={id} className="block text-xs font-semibold text-zinc-700">¿Qué estás facturando?
      <select id={id} className={control} value={nature} onChange={event => { invalidate(); setNature(event.target.value as SaleNature | ""); setProduct(null); setUnit(null); setMemory(null); }}>
        <option value="">Selecciona el tipo de operación</option>
        {Object.entries(SALE_NATURES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </label>
    {nature ? <>
      {!confirmed && memory ? <div className="rounded bg-blue-50 p-2 text-xs text-blue-900">
        <p>Selección anterior de tu empresa: {memory.memory.satProductCode} · {memory.memory.unitCode}. Requiere revisión y nueva confirmación.</p>
        {memory.memory.catalogVersion !== memory.validation.catalog.sourceSha256 ? <p>El catálogo se actualizó desde aquella selección.</p> : null}
        {memory.validation.valid ? <button type="button" className={`${button} mt-2`} onClick={() => {
          const row = memory.validation.items[0]; if (!row.product || !row.unit) return;
          invalidate(); setProduct({ entry: row.product, catalog: memory.validation.catalog }); setUnit({ entry: row.unit, catalog: memory.validation.catalog });
        }}>Revisar selección anterior</button> : <p>Las claves anteriores ya no son válidas. Busca otras claves vigentes.</p>}
      </div> : null}
      <div className="grid gap-4 md:grid-cols-2">
        <CatalogSearch key={`${nature}:product`} kind="product" initialQuery={description} endpoint={endpoint} nature={nature} selected={product}
          onEdit={() => { invalidate(); setProduct(null); }} onSelect={value => { invalidate(); setProduct(value); if (unit?.catalog.sourceSha256 !== value.catalog.sourceSha256) setUnit(null); }} />
        <CatalogSearch key={`${nature}:unit`} kind="unit" initialQuery="" endpoint={endpoint} nature={nature} selected={unit}
          onEdit={() => { invalidate(); setUnit(null); }} onSelect={value => { invalidate(); setUnit(value); if (product?.catalog.sourceSha256 !== value.catalog.sourceSha256) setProduct(null); }} />
      </div>
      {catalog ? <p className="text-xs text-zinc-500"><a className="underline" href={catalog.sourceUrl} target="_blank" rel="noreferrer">Catálogo oficial SAT CFDI {catalog.cfdiVersion}</a> · publicado {catalog.publishedAt} · consultado {catalog.checkedAt}</p> : null}
      <p className="text-xs text-zinc-600">La búsqueda relaciona conceptos con descripciones oficiales. Revisa que las claves correspondan a la operación que vendes.</p>
      <label className="flex gap-2 text-xs text-zinc-700"><input type="checkbox" checked={reviewed} onChange={event => { invalidate(); setReviewed(event.target.checked); }} />Revisé la descripción y las dos claves de esta partida.</label>
      <label className="flex gap-2 text-xs text-zinc-700"><input type="checkbox" checked={remember} onChange={event => { invalidate(); setRemember(event.target.checked); }} />Recordar para este producto en esta empresa</label>
      <button type="button" data-confirm-classification aria-describedby={`${id}-next`} className="rounded bg-blue-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50" disabled={!ready || !reviewed || pending || confirmed} onClick={() => void confirm()}>
        {pending ? "Validando y guardando…" : confirmed ? "Clasificación confirmada" : "Confirmar clasificación"}
      </button>
      {confirmed ? <p role="status" className="text-xs font-medium text-emerald-800">Claves vigentes y confirmadas para esta revisión.</p> : null}
    </> : null}
    {error ? <p role="alert" className="text-xs text-rose-700">{error}</p> : null}
  </fieldset>;
}
