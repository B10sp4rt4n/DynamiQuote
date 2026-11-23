"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { EvidenceLink } from "@/lib/db/commercial-evidence";

const quoteEndpoint = (quoteId: string) => `/api/quotes/${encodeURIComponent(quoteId)}/commercial-evidence`;

function DocumentLink({ document }: { document: EvidenceLink }) {
  return <div className="min-w-0">
    <p className="break-words text-sm font-medium">{document.supplier}{document.reference ? ` · ${document.reference}` : ""}</p>
    {document.expiresOn ? <p className="text-sm text-zinc-600">Vigencia al <time dateTime={document.expiresOn}>
      {document.expiresOn.split("-").reverse().join("/")}
    </time></p> : null}
    <a className="inline-flex max-w-full items-center break-all py-2 text-sm text-blue-800 underline"
      href={`${quoteEndpoint(document.quoteId)}?evidenceId=${encodeURIComponent(document.evidenceId)}`}>{document.filename}</a>
  </div>;
}

export function QuoteEvidencePanel({ quoteId }: { quoteId: string }) {
  const [documents, setDocuments] = useState<EvidenceLink[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(quoteEndpoint(quoteId), { cache: "no-store", signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error("Evidencia comercial no disponible");
        return response.json() as Promise<{ documents: EvidenceLink[] }>;
      })
      .then(result => setDocuments(result.documents))
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [quoteId]);

  return <details className="rounded-lg border border-zinc-200 px-3 py-2 text-zinc-900">
    <summary className="cursor-pointer py-1 text-sm font-medium">Evidencia comercial{documents ? ` (${documents.length})` : ""}</summary>
    {error ? <p className="py-2 text-sm text-zinc-600">No se pudo consultar la evidencia de esta revisión.</p> : null}
    {!error && !documents ? <p className="py-2 text-sm text-zinc-600">Cargando evidencia…</p> : null}
    {documents?.length === 0 ? <p className="py-2 text-sm text-zinc-600">Esta revisión no tiene documentos adjuntos.</p> : null}
    {documents?.length ? <ul className="space-y-2 pt-2">
      {documents.map(document => <li key={document.evidenceId}><DocumentLink document={document} /></li>)}
    </ul> : null}
  </details>;
}

export function OpportunityEvidencePanel({ tenantId, opportunityId, quotes, links }: {
  tenantId: string;
  opportunityId: string;
  quotes: { id: string; label: string }[];
  links: EvidenceLink[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [documentId, setDocumentId] = useState("");
  const documents = new Map<string, EvidenceLink[]>();
  for (const link of links) {
    const group = documents.get(link.evidenceId) ?? [];
    group.push(link);
    documents.set(link.evidenceId, group);
  }
  const quoteLabels = new Map(quotes.map(quote => [quote.id, quote.label]));
  const linkedQuotes = new Set(documents.get(documentId)?.map(link => link.quoteId));
  const availableQuotes = quotes.filter(quote => !linkedQuotes.has(quote.id));

  async function attach(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = new FormData(form);
    if (!body.getAll("quoteId").length) {
      setError("Selecciona al menos una revisión.");
      return;
    }
    if (documentId) body.set("evidenceId", documentId);
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const response = await fetch(`/api/opportunities/${encodeURIComponent(opportunityId)}/commercial-evidence`, {
        method: "POST", headers: { "X-Tenant-Context": tenantId }, body,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo guardar la evidencia comercial.");
      form.reset();
      setDocumentId("");
      setStatus("Evidencia vinculada.");
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No se pudo guardar la evidencia comercial.");
    } finally { setBusy(false); }
  }

  return <section id="evidencia-comercial" className="scroll-mt-24 rounded-xl border border-zinc-200 bg-white p-5">
    <h2 className="text-xl font-semibold">Evidencia comercial</h2>
    {documents.size ? <ul className="mt-3 space-y-3">
      {[...documents.values()].map(group => <li key={group[0].evidenceId} className="rounded-lg border border-zinc-200 p-3">
        <DocumentLink document={group[0]} />
        <p className="text-sm text-zinc-600">{group.map(link => quoteLabels.get(link.quoteId)).join(" · ")}</p>
      </li>)}
    </ul> : <p className="mt-2 text-sm text-zinc-600">Sin cotizaciones de fabricante adjuntas.</p>}
    {quotes.length ? <details className="mt-4">
      <summary className="cursor-pointer py-2 text-sm font-medium text-blue-800">Adjuntar cotización del fabricante</summary>
      <form onSubmit={attach} className="mt-3 rounded-lg border border-zinc-200 p-4">
        <fieldset disabled={busy} className="space-y-3">
          {documents.size ? <label className="block text-sm font-medium">Documento
            <select className="mt-1 block w-full rounded-lg border border-zinc-300 p-2" value={documentId} onChange={event => setDocumentId(event.target.value)}>
              <option value="">Subir un PDF</option>
              {[...documents.values()].map(([doc]) => <option key={doc.evidenceId} value={doc.evidenceId}>{doc.supplier} · {doc.reference ?? doc.filename}</option>)}
            </select>
          </label> : null}
          {!documentId ? <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium">Fabricante
              <input className="mt-1 block w-full rounded-lg border border-zinc-300 p-2" name="supplier" maxLength={120} required />
            </label>
            <label className="block text-sm font-medium">Folio del fabricante (opcional)
              <input className="mt-1 block w-full rounded-lg border border-zinc-300 p-2" name="reference" maxLength={120} />
            </label>
            <label className="block text-sm font-medium">Vigencia (opcional)
              <input className="mt-1 block w-full rounded-lg border border-zinc-300 p-2" name="expiresOn" type="date" />
            </label>
            <label className="block min-w-0 text-sm font-medium">Archivo PDF (hasta 3 MB)
              <input className="mt-1 block w-full rounded-lg border border-zinc-300 p-2" name="file" type="file" accept="application/pdf,.pdf" required />
            </label>
          </div> : null}
          <fieldset key={documentId} className="space-y-1">
            <legend className="text-sm font-medium">Vincular a revisiones de cotización</legend>
            {availableQuotes.map(quote => <label className="flex items-center gap-2 py-1 text-sm" key={quote.id}>
              <input name="quoteId" value={quote.id} type="checkbox" /><span className="break-words">{quote.label}</span>
            </label>)}
            {!availableQuotes.length ? <p className="text-sm text-zinc-600">El PDF ya está vinculado a todas las revisiones disponibles.</p> : null}
          </fieldset>
          <button type="submit" disabled={!availableQuotes.length} className="min-h-11 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white disabled:opacity-50">
            {busy ? "Guardando…" : "Guardar evidencia"}
          </button>
        </fieldset>
        {error ? <p role="alert" className="mt-2 text-sm text-red-700">{error}</p> : null}
        {status ? <p role="status" className="mt-2 text-sm text-emerald-800">{status}</p> : null}
      </form>
    </details> : null}
  </section>;
}
