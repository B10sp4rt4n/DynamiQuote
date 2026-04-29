"use client";

import { useState } from "react";

import {
  QuoteLineEditor,
  type QuoteVersionSaved,
} from "@/components/cotizador/quote-line-editor";
import type { QuoteGroupSummary } from "@/lib/db/quotes";

type QuoteShellProps = {
  items: QuoteGroupSummary[];
  tenantName: string;
};

function formatCurrency(value: number | null): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(value ?? 0);
}

function sortQuotes(items: QuoteGroupSummary[]): QuoteGroupSummary[] {
  return [...items].sort((a, b) => {
    const aTime = a.createdAt ? Date.parse(a.createdAt) : 0;
    const bTime = b.createdAt ? Date.parse(b.createdAt) : 0;

    return bTime - aTime;
  });
}

export function QuoteShell({ items, tenantName }: QuoteShellProps) {
  const [quoteItems, setQuoteItems] = useState<QuoteGroupSummary[]>(() => sortQuotes(items));
  const [activeQuoteId, setActiveQuoteId] = useState<string | null>(items[0]?.quoteId ?? null);
  const [isQuotesPanelOpen, setIsQuotesPanelOpen] = useState(false);
  const [quoteSearch, setQuoteSearch] = useState("");
  const [clientName, setClientName] = useState("");
  const [proposalName, setProposalName] = useState("");
  const [playbookName, setPlaybookName] = useState("General");
  const [quotedBy, setQuotedBy] = useState("");
  const [createState, setCreateState] = useState<"idle" | "saving" | "error">("idle");
  const [createMessage, setCreateMessage] = useState<string | null>(null);

  const normalizedSearch = quoteSearch.trim().toLowerCase();
  const filteredQuoteItems = quoteItems.filter((item) => {
    if (normalizedSearch.length === 0) {
      return true;
    }

    return [item.clientName, item.proposalName, item.quoteGroupId].some((field) =>
      field.toLowerCase().includes(normalizedSearch),
    );
  });

  function handleQuoteVersionSaved(savedQuote: QuoteVersionSaved) {
    setQuoteItems((current) => {
      const updatedItem: QuoteGroupSummary = {
        avgMargin: savedQuote.avgMargin,
        clientName: savedQuote.clientName,
        createdAt: savedQuote.createdAt,
        playbookName: savedQuote.playbookName,
        proposalName: savedQuote.proposalName,
        quoteGroupId: savedQuote.quoteGroupId,
        quoteId: savedQuote.quoteId,
        status: savedQuote.status,
        totalRevenue: savedQuote.totalRevenue,
        version: savedQuote.version,
        versionCount: savedQuote.versionCount,
      };

      const withoutGroup = current.filter((item) => item.quoteGroupId !== savedQuote.quoteGroupId);

      return sortQuotes([updatedItem, ...withoutGroup]);
    });

    setActiveQuoteId(savedQuote.quoteId);
  }

  async function handleCreateQuote() {
    setCreateState("saving");
    setCreateMessage(null);

    try {
      const response = await fetch("/api/quotes", {
        body: JSON.stringify({
          clientName,
          playbookName,
          proposalName,
          quotedBy,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      const data = (await response.json()) as { error?: string; quote?: QuoteGroupSummary };

      if (!response.ok || !data.quote) {
        throw new Error(data.error ?? "No fue posible crear la cotizacion");
      }

      setQuoteItems((current) => sortQuotes([data.quote!, ...current]));
      setActiveQuoteId(data.quote.quoteId);
      setClientName("");
      setProposalName("");
      setPlaybookName("General");
      setQuotedBy("");
      setCreateState("idle");
      setCreateMessage(`Cotizacion ${data.quote.quoteGroupId} creada.`);
    } catch (error) {
      setCreateState("error");
      setCreateMessage(error instanceof Error ? error.message : "Error interno");
    }
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-2 border-b border-zinc-200 pb-4">
        <p className="text-sm uppercase tracking-[0.18em] text-zinc-500">Tenant activo</p>
        <h1 className="text-2xl font-semibold text-zinc-900">Cotizaciones de {tenantName}</h1>
      </div>
      <p className="mt-2 text-zinc-600">
        Esta vista ya consume Neon con aislamiento por tenant y muestra la ultima version de cada
        grupo de cotizacion.
      </p>
      <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold text-zinc-900">Nueva cotizacion</h2>
          <p className="text-sm text-zinc-600">
            Crea la cotizacion base y despues edita lineas o genera su propuesta formal.
          </p>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <input
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
            onChange={(event) => setClientName(event.target.value)}
            placeholder="Cliente"
            value={clientName}
          />
          <input
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
            onChange={(event) => setProposalName(event.target.value)}
            placeholder="Nombre de propuesta"
            value={proposalName}
          />
          <input
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
            onChange={(event) => setPlaybookName(event.target.value)}
            placeholder="Playbook"
            value={playbookName}
          />
          <input
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
            onChange={(event) => setQuotedBy(event.target.value)}
            placeholder="Cotizado por"
            value={quotedBy}
          />
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={createState === "saving" || clientName.trim().length === 0}
            onClick={() => {
              void handleCreateQuote();
            }}
            type="button"
          >
            {createState === "saving" ? "Creando..." : "Crear cotizacion"}
          </button>
          {createMessage ? (
            <p className={createState === "error" ? "text-sm text-rose-700" : "text-sm text-emerald-700"}>
              {createMessage}
            </p>
          ) : null}
        </div>
      </div>
      <div className="mt-6 rounded-xl border border-zinc-200 bg-white">
        <button
          aria-expanded={isQuotesPanelOpen}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
          onClick={() => setIsQuotesPanelOpen((current) => !current)}
          type="button"
        >
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-zinc-700">
              Cotizaciones guardadas
            </h2>
            <p className="text-xs text-zinc-500">
              {quoteItems.length} registradas {isQuotesPanelOpen ? "(click para ocultar)" : "(click para mostrar)"}
            </p>
          </div>
          <span className="text-xl leading-none text-zinc-700">{isQuotesPanelOpen ? "−" : "+"}</span>
        </button>

        {isQuotesPanelOpen ? (
          <div className="border-t border-zinc-200">
            <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">
              <input
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
                onChange={(event) => setQuoteSearch(event.target.value)}
                placeholder="Buscar por cliente, propuesta o folio"
                value={quoteSearch}
              />
            </div>
            <div className="overflow-hidden">
              <table className="min-w-full divide-y divide-zinc-200 text-sm">
                <thead className="bg-zinc-50 text-left text-zinc-600">
                  <tr>
                    <th className="px-4 py-3 font-medium">Cliente</th>
                    <th className="px-4 py-3 font-medium">Propuesta</th>
                    <th className="px-4 py-3 font-medium">Grupo</th>
                    <th className="px-4 py-3 font-medium">Versiones</th>
                    <th className="px-4 py-3 font-medium">Total</th>
                    <th className="px-4 py-3 font-medium">Margen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 bg-white">
                  {filteredQuoteItems.map((item) => (
                    <tr key={item.quoteId}>
                      <td className="px-4 py-3 text-zinc-900">{item.clientName}</td>
                      <td className="px-4 py-3 text-zinc-600">{item.proposalName}</td>
                      <td className="px-4 py-3 font-mono text-xs text-zinc-500">{item.quoteGroupId}</td>
                      <td className="px-4 py-3 text-zinc-600">
                        v{item.version} de {item.versionCount}
                      </td>
                      <td className="px-4 py-3 text-zinc-900">{formatCurrency(item.totalRevenue)}</td>
                      <td className="px-4 py-3 text-zinc-600">
                        {item.avgMargin !== null ? `${item.avgMargin.toFixed(1)}%` : "N/D"}
                      </td>
                    </tr>
                  ))}
                  {quoteItems.length === 0 ? (
                    <tr>
                      <td className="px-4 py-6 text-center text-zinc-500" colSpan={6}>
                        Aun no hay cotizaciones para este tenant.
                      </td>
                    </tr>
                  ) : null}
                  {quoteItems.length > 0 && filteredQuoteItems.length === 0 ? (
                    <tr>
                      <td className="px-4 py-6 text-center text-zinc-500" colSpan={6}>
                        No hay resultados para esa busqueda.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
      {quoteItems.length > 0 ? (
        <QuoteLineEditor
          forcedSelectedQuoteId={activeQuoteId}
          onQuoteVersionSaved={handleQuoteVersionSaved}
          quotes={quoteItems}
        />
      ) : null}
    </section>
  );
}
