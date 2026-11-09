"use client";

import { useState } from "react";
import { CFDI_USES, CFDI_USE_GROUPS, clientCfdiUseIssue, isCfdiUseCompatible } from "@/lib/domain/cfdi-uses";

type Props = { value: string; rfc: string; regime: string; onChange: (value: string) => void };

export function CfdiUseSelect({ value, rfc, regime, onChange }: Props) {
  const [showAll, setShowAll] = useState(false);
  const issue = clientCfdiUseIssue(value, rfc, regime);
  const selectable = (code: string) => !clientCfdiUseIssue(code, rfc, regime);
  const entries = CFDI_USES.filter((entry) => showAll || selectable(entry.code) || entry.code === value);
  const knownValue = CFDI_USES.some((entry) => entry.code === value);

  return <div className="min-w-0">
    <label htmlFor="client-cfdi-use" className="mb-1 block text-xs font-medium text-zinc-700">Uso CFDI</label>
    <select id="client-cfdi-use" value={value} aria-describedby="client-cfdi-help" aria-invalid={Boolean(issue)}
      className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
      onChange={(event) => onChange(event.target.value)}>
      <option value="">Pendiente de confirmar con el cliente</option>
      {value && !knownValue ? <option value={value} disabled>{value} — Revisar uso guardado</option> : null}
      {CFDI_USE_GROUPS.map((group) => {
        const grouped = entries.filter((entry) => entry.group === group);
        return grouped.length ? <optgroup label={group} key={group}>
        {grouped.map((entry) => <option key={entry.code} value={entry.code} disabled={!selectable(entry.code)}>
          {entry.code} — {entry.description}{entry.document === "payment" ? " (complemento de pago)" : entry.document === "payroll" ? " (recibo de nómina)" : !isCfdiUseCompatible(entry.code, rfc, regime) ? " (no compatible)" : ""}
        </option>)}
      </optgroup> : null;
      })}
    </select>
    <p id="client-cfdi-help" className="mt-1 text-xs text-zinc-500">El uso lo indica el cliente; no se obtiene de la CSF. Se muestran las claves compatibles con el RFC y régimen capturados.</p>
    <label className="mt-2 flex items-center gap-2 text-xs text-zinc-600">
      <input type="checkbox" checked={showAll} onChange={(event) => setShowAll(event.target.checked)} />
      Ver todo el catálogo (24 claves)
    </label>
    {showAll ? <p className="mt-1 text-xs text-zinc-500">CP01 se asigna en complementos de pago y CN01 en recibos de nómina. Las opciones no compatibles aparecen deshabilitadas.</p> : null}
    {issue ? <p role="alert" className="mt-2 text-xs text-amber-800">{issue}</p> : null}
  </div>;
}
