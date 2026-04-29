"use client";

import { useEffect, useMemo, useState } from "react";

import type { QuoteGroupSummary } from "@/lib/db/quotes";
import { resolveBidirectionalPricing } from "@/lib/domain/pricing-engine";
import type { PackageSummary } from "@/lib/db/packages";
import type {
  EditableQuoteLineResponse,
  QuoteLinesGetResponse,
  QuoteLinesPutResponse,
  QuoteVersionHistoryItem,
  QuoteVersionResponse,
  QuoteVersionsResponse,
} from "@/lib/validations/quote-editor-response";

type EditableQuoteLine = EditableQuoteLineResponse;

type ApiErrorResponse = {
  error?: string;
};

export type QuoteVersionSaved = QuoteVersionResponse;

type QuoteLineEditorProps = {
  forcedSelectedQuoteId?: string | null;
  onQuoteVersionSaved?: (quote: QuoteVersionSaved) => void;
  quotes: QuoteGroupSummary[];
};

// ---------------------------------------------------------------------------
// Package picker modal
// ---------------------------------------------------------------------------

function PackagePickerModal({
  onClose,
  onInsert,
}: {
  onClose: () => void;
  onInsert: (packageId: string) => void;
}) {
  const [packages, setPackages] = useState<PackageSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/packages")
      .then((r) => r.json())
      .then((d: { packages?: PackageSummary[] }) => setPackages(d.packages?.filter((p) => p.active) ?? []))
      .catch(() => setError("No se pudieron cargar los paquetes"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <button
        aria-label="Cerrar"
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
        type="button"
      />
      <div className="relative w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <h3 className="text-base font-semibold text-zinc-900">Insertar paquete</h3>
          <button className="ml-4 text-zinc-400 hover:text-zinc-700" onClick={onClose} type="button">✕</button>
        </div>
        <p className="mt-1 text-xs text-zinc-500">
          Las líneas se copiarán a la cotización actual y serán editables.
        </p>
        {error && <p className="mt-3 text-sm text-rose-700">{error}</p>}
        {loading && <p className="mt-3 text-sm text-zinc-500">Cargando paquetes...</p>}
        <ul className="mt-4 max-h-72 space-y-2 overflow-y-auto">
          {packages.map((pkg) => (
            <li
              key={pkg.packageId}
              className="flex items-center justify-between rounded-lg border border-zinc-200 px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium text-zinc-900">{pkg.name}</p>
                <p className="text-xs text-zinc-500">
                  {pkg.pkgNumber} · {pkg.lineCount} líneas{pkg.playbookTag ? ` · ${pkg.playbookTag}` : ""}
                </p>
              </div>
              <button
                className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                disabled={pending === pkg.packageId}
                onClick={() => {
                  setPending(pkg.packageId);
                  onInsert(pkg.packageId);
                }}
                type="button"
              >
                {pending === pkg.packageId ? "..." : "Insertar"}
              </button>
            </li>
          ))}
          {!loading && packages.length === 0 && (
            <li className="text-sm text-zinc-500">No hay paquetes activos disponibles.</li>
          )}
        </ul>
      </div>
    </div>
  );
}


type LineFieldKey =
  | "classification1"
  | "classification2"
  | "costUnit"
  | "marginPct"
  | "priceUnit"
  | "quantity";

type LineDiffMap = Record<string, Set<LineFieldKey>>;
type LineDeltaMap = Record<string, Partial<Record<LineFieldKey, string>>>;

type VersionCompareState = {
  baselineQuoteId: string;
  baselineVersion: number;
  targetQuoteId: string;
  targetVersion: number;
};

function getErrorMessage(data: unknown): string | undefined {
  if (typeof data !== "object" || data === null || !("error" in data)) {
    return undefined;
  }

  const maybeError = (data as { error?: unknown }).error;

  return typeof maybeError === "string" ? maybeError : undefined;
}

function toNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("es-MX", {
    currency: "MXN",
    maximumFractionDigits: 2,
    style: "currency",
  }).format(value);
}

function toComparableNumber(value: number): number {
  return Math.round(value * 100) / 100;
}

function getChangedFields(previous: EditableQuoteLine, current: EditableQuoteLine): Set<LineFieldKey> {
  const changed = new Set<LineFieldKey>();

  if (toComparableNumber(previous.quantity) !== toComparableNumber(current.quantity)) {
    changed.add("quantity");
  }

  if (toComparableNumber(previous.costUnit) !== toComparableNumber(current.costUnit)) {
    changed.add("costUnit");
  }

  if (toComparableNumber(previous.priceUnit) !== toComparableNumber(current.priceUnit)) {
    changed.add("priceUnit");
  }

  if (toComparableNumber(previous.marginPct) !== toComparableNumber(current.marginPct)) {
    changed.add("marginPct");
  }

  if (previous.classification1 !== current.classification1) {
    changed.add("classification1");
  }

  if ((previous.classification2 ?? "") !== (current.classification2 ?? "")) {
    changed.add("classification2");
  }

  return changed;
}

function diffCellClass(changed: boolean): string {
  return changed ? "bg-amber-50" : "";
}

function getLineDeltaSummary(
  delta: Partial<Record<LineFieldKey, string>> | undefined,
): string[] {
  if (!delta) {
    return [];
  }

  const labels: Record<LineFieldKey, string> = {
    classification1: "C1",
    classification2: "C2",
    costUnit: "Costo",
    marginPct: "Margen",
    priceUnit: "Precio",
    quantity: "Cantidad",
  };

  return (Object.entries(delta) as Array<[LineFieldKey, string | undefined]>)
    .filter(([, value]) => Boolean(value))
    .map(([key, value]) => `${labels[key]}: ${value}`);
}

function escapeCsv(value: string): string {
  const escaped = value.replaceAll('"', '""');
  return `"${escaped}"`;
}

function toDelta(before: string | number, after: string | number): string {
  return `${before} -> ${after}`;
}

function createLocalLineId(): string {
  if (typeof globalThis !== "undefined" && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `tmp-${Date.now()}-${Math.floor(Math.random() * 100_000)}`;
}

function getLineMatchKey(line: EditableQuoteLine, index: number): string {
  return `${index}`;
}

function buildLineDiffMap(
  baselineLines: EditableQuoteLine[],
  currentLines: EditableQuoteLine[],
): { deltaMap: LineDeltaMap; diffMap: LineDiffMap } {
  const baselineByKey = new Map(
    baselineLines.map((line, index) => [getLineMatchKey(line, index), line]),
  );

  const nextDiffMap: LineDiffMap = {};
  const nextDeltaMap: LineDeltaMap = {};

  for (const [index, currentLine] of currentLines.entries()) {
    const baselineLine = baselineByKey.get(getLineMatchKey(currentLine, index));

    if (!baselineLine) {
      continue;
    }

    const changed = getChangedFields(baselineLine, currentLine);

    if (changed.size > 0) {
      nextDiffMap[currentLine.lineId] = changed;
      nextDeltaMap[currentLine.lineId] = {
        classification1: changed.has("classification1")
          ? toDelta(baselineLine.classification1, currentLine.classification1)
          : undefined,
        classification2: changed.has("classification2")
          ? toDelta(baselineLine.classification2 || "-", currentLine.classification2 || "-")
          : undefined,
        costUnit: changed.has("costUnit")
          ? toDelta(baselineLine.costUnit.toFixed(2), currentLine.costUnit.toFixed(2))
          : undefined,
        marginPct: changed.has("marginPct")
          ? toDelta(`${baselineLine.marginPct.toFixed(2)}%`, `${currentLine.marginPct.toFixed(2)}%`)
          : undefined,
        priceUnit: changed.has("priceUnit")
          ? toDelta(baselineLine.priceUnit.toFixed(2), currentLine.priceUnit.toFixed(2))
          : undefined,
        quantity: changed.has("quantity")
          ? toDelta(baselineLine.quantity.toFixed(2), currentLine.quantity.toFixed(2))
          : undefined,
      };
    }
  }

  return {
    deltaMap: nextDeltaMap,
    diffMap: nextDiffMap,
  };
}

export function QuoteLineEditor({
  forcedSelectedQuoteId,
  onQuoteVersionSaved,
  quotes,
}: QuoteLineEditorProps) {
  const [selectedQuoteId, setSelectedQuoteId] = useState<string>(quotes[0]?.quoteId ?? "");
  const [lines, setLines] = useState<EditableQuoteLine[]>([]);
  const [lineDiffMap, setLineDiffMap] = useState<LineDiffMap>({});
  const [lineDeltaMap, setLineDeltaMap] = useState<LineDeltaMap>({});
  const [versions, setVersions] = useState<QuoteVersionHistoryItem[]>([]);
  const [compareState, setCompareState] = useState<VersionCompareState | null>(null);
  const [compareBaseQuoteId, setCompareBaseQuoteId] = useState<string>("");
  const [compareTargetQuoteId, setCompareTargetQuoteId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creatingProposal, setCreatingProposal] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showPackagePicker, setShowPackagePicker] = useState(false);

  const selectedQuote = useMemo(
    () => quotes.find((quote) => quote.quoteId === selectedQuoteId) ?? null,
    [quotes, selectedQuoteId],
  );

  useEffect(() => {
    if (!selectedQuoteId) {
      return;
    }

    void loadLines(selectedQuoteId);
    void loadVersions(selectedQuoteId);
  }, [selectedQuoteId]);

  useEffect(() => {
    if (!forcedSelectedQuoteId || forcedSelectedQuoteId === selectedQuoteId) {
      return;
    }

    setCompareState(null);
    setLineDeltaMap({});
    setSelectedQuoteId(forcedSelectedQuoteId);
  }, [forcedSelectedQuoteId, selectedQuoteId]);

  async function loadVersions(quoteId: string) {
    try {
      const response = await fetch(`/api/quotes/${quoteId}/versions`, { method: "GET" });
      const data = (await response.json()) as QuoteVersionsResponse | ApiErrorResponse;
      const hasVersions = "versions" in data;

      if (!response.ok || !hasVersions) {
        return;
      }

      setVersions(data.versions);
      if (data.versions.length > 0) {
        setCompareTargetQuoteId(data.currentQuoteId);
        const defaultBase =
          data.versions.find((version) => version.quoteId !== data.currentQuoteId)?.quoteId ??
          data.currentQuoteId;
        setCompareBaseQuoteId(defaultBase);
      }
    } catch {
      setVersions([]);
    }
  }

  async function loadLines(quoteId: string) {
    if (!quoteId) {
      setLines([]);
      return;
    }

    setLoading(true);
    setMessage(null);
    setLineDiffMap({});
    setLineDeltaMap({});

    try {
      const response = await fetch(`/api/quotes/${quoteId}/lines`, { method: "GET" });
      const data = (await response.json()) as QuoteLinesGetResponse | ApiErrorResponse;
      const hasLines = "lines" in data;

      if (!response.ok || !hasLines) {
        setMessage(getErrorMessage(data) ?? "No se pudieron cargar las lineas");
        setLines([]);
        return;
      }

      setLines(data.lines);
    } catch {
      setMessage("Error de red al cargar lineas");
      setLines([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleQuoteChange(nextQuoteId: string) {
    setCompareState(null);
    setLineDeltaMap({});
    setSelectedQuoteId(nextQuoteId);
  }

  function updateLine(lineId: string, patch: Partial<EditableQuoteLine>) {
    setLines((current) => current.map((line) => (line.lineId === lineId ? { ...line, ...patch } : line)));
  }

  function onQuantityChange(lineId: string, value: string) {
    updateLine(lineId, { quantity: Math.max(0.01, toNumber(value)) });
  }

  function addPartida() {
    setLines((current) => [
      ...current,
      {
        classification1: "product",
        classification2: "",
        costUnit: 0,
        description: "",
        lineId: createLocalLineId(),
        marginPct: 0,
        priceUnit: 0,
        quantity: 1,
        sku: null,
      },
    ]);
  }

  function removePartida(lineId: string) {
    setLines((current) => {
      if (current.length <= 1) {
        return current;
      }

      return current.filter((line) => line.lineId !== lineId);
    });
  }

  function onCostChange(lineId: string, value: string) {
    setLines((current) =>
      current.map((line) => {
        if (line.lineId !== lineId) {
          return line;
        }

        const costUnit = Math.max(0, toNumber(value));
        if (line.priceUnit <= 0) {
          const pricing = resolveBidirectionalPricing({
            costUnit,
            marginPct: line.marginPct,
          });

          return {
            ...line,
            costUnit,
            marginPct: pricing.marginPct,
            priceUnit: pricing.priceUnit,
          };
        }

        const pricing = resolveBidirectionalPricing({
          costUnit,
          priceUnit: line.priceUnit,
        });

        return {
          ...line,
          costUnit,
          marginPct: pricing.marginPct,
          priceUnit: pricing.priceUnit,
        };
      }),
    );
  }

  function onMarginChange(lineId: string, value: string) {
    setLines((current) =>
      current.map((line) => {
        if (line.lineId !== lineId) {
          return line;
        }

        const marginPct = Math.min(99.99, Math.max(0, toNumber(value)));
        const pricing = resolveBidirectionalPricing({
          costUnit: line.costUnit,
          marginPct,
        });

        return {
          ...line,
          marginPct: pricing.marginPct,
          priceUnit: pricing.priceUnit,
        };
      }),
    );
  }

  function onPriceChange(lineId: string, value: string) {
    setLines((current) =>
      current.map((line) => {
        if (line.lineId !== lineId) {
          return line;
        }

        const priceUnit = Math.max(0, toNumber(value));
        if (priceUnit <= 0) {
          return {
            ...line,
            marginPct: 0,
            priceUnit,
          };
        }

        const pricing = resolveBidirectionalPricing({
          costUnit: line.costUnit,
          priceUnit,
        });

        return {
          ...line,
          marginPct: pricing.marginPct,
          priceUnit: pricing.priceUnit,
        };
      }),
    );
  }

  async function saveLines() {
    if (!selectedQuoteId || lines.length === 0) {
      return;
    }

    setSaving(true);
    setMessage(null);

    const previousLines = lines;

    try {
      const payload = {
        lines: lines.map((line) => ({
          classification1: line.classification1,
          classification2: line.classification2,
          costUnit: line.costUnit,
          description: line.description,
          lineId: line.lineId,
          marginPct: line.marginPct,
          mode: "price" as const,
          priceUnit: line.priceUnit,
          quantity: line.quantity,
          sku: line.sku ?? "",
        })),
      };

      const response = await fetch(`/api/quotes/${selectedQuoteId}/lines`, {
        body: JSON.stringify(payload),
        headers: {
          "Content-Type": "application/json",
        },
        method: "PUT",
      });

      const data = (await response.json()) as QuoteLinesPutResponse | ApiErrorResponse;
      const hasLines = "lines" in data;
      const hasQuote = "quote" in data;

      if (!response.ok || !hasLines || !hasQuote) {
        setMessage(getErrorMessage(data) ?? "No se pudieron guardar las lineas");
        return;
      }

      const nextDiffResult = buildLineDiffMap(previousLines, data.lines);

      setLines(data.lines);
      setLineDiffMap(nextDiffResult.diffMap);
      setLineDeltaMap(nextDiffResult.deltaMap);
      setCompareState({
        baselineQuoteId: selectedQuoteId,
        baselineVersion: data.quote.version - 1,
        targetQuoteId: data.quote.quoteId,
        targetVersion: data.quote.version,
      });
      onQuoteVersionSaved?.(data.quote);
      setSelectedQuoteId(data.quote.quoteId);
      setMessage(`Version v${data.quote.version} creada y guardada correctamente`);
    } catch {
      setMessage("Error de red al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function compareWithVersion(baseQuoteId: string, targetQuoteId: string) {
    if (!baseQuoteId || !targetQuoteId || baseQuoteId === targetQuoteId) {
      return;
    }

    try {
      const [baseResponse, targetResponse] = await Promise.all([
        fetch(`/api/quotes/${baseQuoteId}/lines`, { method: "GET" }),
        fetch(`/api/quotes/${targetQuoteId}/lines`, { method: "GET" }),
      ]);

      const baseData = (await baseResponse.json()) as QuoteLinesGetResponse | ApiErrorResponse;
      const targetData = (await targetResponse.json()) as QuoteLinesGetResponse | ApiErrorResponse;

      const baseHasLines = "lines" in baseData;
      const targetHasLines = "lines" in targetData;

      if (!baseResponse.ok || !targetResponse.ok || !baseHasLines || !targetHasLines) {
        setMessage("No se pudo cargar una de las versiones para comparar");
        return;
      }

      const targetVersion = versions.find((version) => version.quoteId === targetQuoteId);
      const baseVersion = versions.find((version) => version.quoteId === baseQuoteId);
      const diffResult = buildLineDiffMap(baseData.lines, targetData.lines);

      setLines(targetData.lines);
      setSelectedQuoteId(targetQuoteId);
      setLineDiffMap(diffResult.diffMap);
      setLineDeltaMap(diffResult.deltaMap);
      setCompareState({
        baselineQuoteId: baseQuoteId,
        baselineVersion: baseVersion?.version ?? 0,
        targetQuoteId,
        targetVersion: targetVersion?.version ?? 0,
      });
      setMessage(
        `Comparando v${baseVersion?.version ?? "?"} contra v${targetVersion?.version ?? "?"}`,
      );
    } catch {
      setMessage("Error de red al comparar versiones");
    }
  }

  async function createProposalFromSelectedQuote() {
    if (!selectedQuoteId || !selectedQuote) {
      return;
    }

    setCreatingProposal(true);
    setMessage(null);

    try {
      const response = await fetch("/api/proposals", {
        body: JSON.stringify({
          quoteId: selectedQuoteId,
          recipientCompany: selectedQuote.clientName,
          subject: selectedQuote.proposalName,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      const data = (await response.json()) as {
        error?: string;
        proposal?: {
          formal: {
            proposalNumber: string;
          } | null;
          proposalId: string;
        };
      };

      if (!response.ok || !data.proposal) {
        throw new Error(data.error ?? "No fue posible generar la propuesta");
      }

      setMessage(
        `Propuesta ${data.proposal.formal?.proposalNumber ?? data.proposal.proposalId} creada correctamente. Revisa la seccion de propuestas.`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Error interno al generar la propuesta");
    } finally {
      setCreatingProposal(false);
    }
  }

  const totals = useMemo(() => {
    const totalCost = lines.reduce((sum, line) => sum + line.quantity * line.costUnit, 0);
    const totalRevenue = lines.reduce((sum, line) => sum + line.quantity * line.priceUnit, 0);
    const grossProfit = totalRevenue - totalCost;
    const avgMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

    return {
      avgMargin,
      grossProfit,
      totalCost,
      totalRevenue,
    };
  }, [lines]);

  const lineAccumulationById = useMemo(() => {
    let runningCost = 0;
    let runningRevenue = 0;

    const rows = new Map<
      string,
      {
        runningCost: number;
        runningProfit: number;
        runningRevenue: number;
        subtotalCost: number;
        subtotalProfit: number;
        subtotalRevenue: number;
      }
    >();

    for (const line of lines) {
      const subtotalCost = line.quantity * line.costUnit;
      const subtotalRevenue = line.quantity * line.priceUnit;
      const subtotalProfit = subtotalRevenue - subtotalCost;

      runningCost += subtotalCost;
      runningRevenue += subtotalRevenue;

      rows.set(line.lineId, {
        runningCost,
        runningProfit: runningRevenue - runningCost,
        runningRevenue,
        subtotalCost,
        subtotalProfit,
        subtotalRevenue,
      });
    }

    return rows;
  }, [lines]);

  const diffSummary = useMemo(() => {
    const changedLineCount = Object.keys(lineDiffMap).length;
    const changedFieldCount = Object.values(lineDiffMap).reduce(
      (sum, changedFields) => sum + changedFields.size,
      0,
    );

    return {
      changedFieldCount,
      changedLineCount,
    };
  }, [lineDiffMap]);

  function exportComparisonCsv() {
    if (lines.length === 0) {
      setMessage("No hay lineas para exportar");
      return;
    }

    const headers = [
      "lineId",
      "sku",
      "description",
      "quantity",
      "costUnit",
      "priceUnit",
      "marginPct",
      "classification1",
      "classification2",
      "deltaSummary",
    ];

    const rows = lines.map((line) => {
      const deltaSummary = getLineDeltaSummary(lineDeltaMap[line.lineId]).join(" | ");

      return [
        line.lineId,
        line.sku ?? "",
        line.description,
        line.quantity.toFixed(2),
        line.costUnit.toFixed(2),
        line.priceUnit.toFixed(2),
        line.marginPct.toFixed(2),
        line.classification1,
        line.classification2,
        deltaSummary,
      ].map((value) => escapeCsv(String(value)));
    });

    const metaRows = [
      [
        escapeCsv("comparison"),
        escapeCsv(
          compareState
            ? `v${compareState.baselineVersion} -> v${compareState.targetVersion}`
            : "sin comparacion activa",
        ),
      ],
      [escapeCsv("quoteId"), escapeCsv(selectedQuoteId)],
      [escapeCsv("exportedAt"), escapeCsv(new Date().toISOString())],
      ["", ""],
    ];

    const csvContent = [
      ...metaRows.map((row) => row.join(",")),
      headers.map((header) => escapeCsv(header)).join(","),
      ...rows.map((row) => row.join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const suffix = compareState
      ? `v${compareState.baselineVersion}-a-v${compareState.targetVersion}`
      : "sin-comparacion";

    link.href = url;
    link.setAttribute("download", `cotizacion-${selectedQuoteId}-${suffix}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setMessage("CSV de comparacion exportado correctamente");
  }

  return (
    <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm text-zinc-900">
      <div className="space-y-4">
        <div className="max-w-2xl">
          <h2 className="text-xl font-semibold text-zinc-900">Editor de lineas</h2>
          <p className="text-sm text-zinc-600">
            Ajusta cantidad, costo, precio o margen. El calculo precio/margen es bidireccional.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm text-zinc-600" htmlFor="quote-selector">
            Cotizacion
          </label>
          <select
            className="min-w-[320px] flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 lg:min-w-[520px]"
            id="quote-selector"
            onChange={(event) => {
              void handleQuoteChange(event.target.value);
            }}
            value={selectedQuoteId}
          >
            {quotes.map((quote) => (
              <option key={quote.quoteId} value={quote.quoteId}>
                {quote.clientName} - {quote.proposalName} ({quote.quoteId})
              </option>
            ))}
          </select>
          <button
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-100"
            disabled={loading || !selectedQuoteId}
            onClick={() => {
              void loadLines(selectedQuoteId);
            }}
            type="button"
          >
            Recargar
          </button>
          <button
            className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-60"
            disabled={saving || loading || lines.length === 0}
            onClick={() => {
              void saveLines();
            }}
            type="button"
          >
            {saving ? "Guardando..." : "Guardar"}
          </button>
          <button
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-100"
            disabled={loading || lines.length === 0}
            onClick={exportComparisonCsv}
            type="button"
          >
            Exportar CSV
          </button>
          <button
            className="rounded-lg border border-sky-300 px-3 py-2 text-sm font-medium text-sky-700 hover:bg-sky-50 disabled:opacity-50"
            disabled={creatingProposal || !selectedQuoteId}
            onClick={() => {
              void createProposalFromSelectedQuote();
            }}
            type="button"
          >
            {creatingProposal ? "Generando..." : "Crear propuesta"}
          </button>
          <button
            className="rounded-lg border border-emerald-400 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
            disabled={!selectedQuoteId}
            onClick={() => setShowPackagePicker(true)}
            type="button"
          >
            + Paquete
          </button>
          <button
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
            disabled={!selectedQuoteId}
            onClick={addPartida}
            type="button"
          >
            + Partida
          </button>
        </div>
      </div>

      {showPackagePicker && (
        <PackagePickerModal
          onClose={() => setShowPackagePicker(false)}
          onInsert={async (packageId) => {
            try {
              const res = await fetch(`/api/packages/${packageId}`, {
                body: JSON.stringify({ action: "insert", quoteId: selectedQuoteId }),
                headers: { "Content-Type": "application/json" },
                method: "PATCH",
              });
              const data = (await res.json()) as { error?: string; inserted?: number };
              if (!res.ok) throw new Error(data.error ?? "Error al insertar");
              setShowPackagePicker(false);
              await loadLines(selectedQuoteId);
              setMessage(`Paquete insertado: ${data.inserted} líneas agregadas.`);
            } catch (err) {
              setMessage(err instanceof Error ? err.message : "Error al insertar paquete");
              setShowPackagePicker(false);
            }
          }}
        />
      )}

      {message ? <p className="mt-4 text-sm text-zinc-600">{message}</p> : null}

      {diffSummary.changedLineCount > 0 ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Cambios detectados: {diffSummary.changedLineCount} lineas y {diffSummary.changedFieldCount} campos actualizados.
          {compareState
            ? ` Comparacion: v${compareState.baselineVersion} -> v${compareState.targetVersion}.`
            : ""}
        </div>
      ) : null}

      {versions.length > 0 ? (
        <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
          <p className="text-sm font-medium text-zinc-700">Historial de versiones</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-xs text-zinc-600">Base</span>
            <select
              className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700"
              onChange={(event) => {
                setCompareBaseQuoteId(event.target.value);
              }}
              value={compareBaseQuoteId}
            >
              {versions.map((version) => (
                <option key={`base-${version.quoteId}`} value={version.quoteId}>
                  v{version.version}
                </option>
              ))}
            </select>
            <span className="text-xs text-zinc-600">Objetivo</span>
            <select
              className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700"
              onChange={(event) => {
                setCompareTargetQuoteId(event.target.value);
              }}
              value={compareTargetQuoteId}
            >
              {versions.map((version) => (
                <option key={`target-${version.quoteId}`} value={version.quoteId}>
                  v{version.version} {version.quoteId === selectedQuoteId ? "(actual)" : ""}
                </option>
              ))}
            </select>
            <button
              className="rounded-md border border-zinc-300 bg-white px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-100"
              onClick={() => {
                void compareWithVersion(compareBaseQuoteId, compareTargetQuoteId);
              }}
              type="button"
            >
              Comparar A vs B
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {versions.map((version) => (
              <button
                className="rounded-md border border-zinc-300 bg-white px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-100"
                key={version.quoteId}
                onClick={() => {
                  void compareWithVersion(version.quoteId, selectedQuoteId);
                }}
                type="button"
              >
                comparar v{version.version} {"->"} actual
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        <article className="rounded-lg border border-zinc-200 p-3 text-sm">
          <p className="text-zinc-500">Costo total</p>
          <p className="mt-1 font-semibold text-zinc-900">{formatCurrency(totals.totalCost)}</p>
        </article>
        <article className="rounded-lg border border-zinc-200 p-3 text-sm">
          <p className="text-zinc-500">Revenue total</p>
          <p className="mt-1 font-semibold text-zinc-900">{formatCurrency(totals.totalRevenue)}</p>
        </article>
        <article className="rounded-lg border border-zinc-200 p-3 text-sm">
          <p className="text-zinc-500">Utilidad</p>
          <p className="mt-1 font-semibold text-zinc-900">{formatCurrency(totals.grossProfit)}</p>
        </article>
        <article className="rounded-lg border border-zinc-200 p-3 text-sm">
          <p className="text-zinc-500">Margen promedio</p>
          <p className="mt-1 font-semibold text-zinc-900">{totals.avgMargin.toFixed(2)}%</p>
        </article>
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-zinc-200">
        <table className="min-w-full divide-y divide-zinc-200 text-sm">
          <thead className="bg-zinc-50 text-left text-zinc-600">
            <tr>
              <th className="px-4 py-3 font-medium">Partida</th>
              <th className="px-4 py-3 font-medium">SKU</th>
              <th className="px-4 py-3 font-medium">Descripcion</th>
              <th className="px-4 py-3 font-medium">Cantidad</th>
              <th className="px-4 py-3 font-medium">Costo unitario</th>
              <th className="px-4 py-3 font-medium">Precio unitario</th>
              <th className="px-4 py-3 font-medium">Subtotal</th>
              <th className="px-4 py-3 font-medium">Acumulado</th>
              <th className="px-4 py-3 font-medium">Margen</th>
              <th className="px-4 py-3 font-medium">Clasificacion 1</th>
              <th className="px-4 py-3 font-medium">Clasificacion 2</th>
              <th className="px-4 py-3 font-medium">Delta</th>
              <th className="px-4 py-3 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 bg-white">
            {lines.map((line, index) => {
              const accumulation = lineAccumulationById.get(line.lineId);

              return (
              <tr key={line.lineId}>
                <td className="px-4 py-3 font-mono text-xs text-zinc-600">{String(index + 1).padStart(3, "0")}</td>
                <td className="px-4 py-3">
                  <input
                    className="w-28 rounded border border-zinc-300 px-2 py-1"
                    onChange={(event) => {
                      updateLine(line.lineId, { sku: event.target.value || null });
                    }}
                    placeholder="SKU"
                    type="text"
                    value={line.sku ?? ""}
                  />
                </td>
                <td className="px-4 py-3">
                  <input
                    className="w-72 rounded border border-zinc-300 px-2 py-1 text-zinc-900"
                    onChange={(event) => {
                      updateLine(line.lineId, { description: event.target.value });
                    }}
                    placeholder="Descripcion de la partida"
                    type="text"
                    value={line.description}
                  />
                </td>
                <td className={`px-4 py-3 ${diffCellClass(Boolean(lineDiffMap[line.lineId]?.has("quantity")))}`}>
                  <input
                    className="w-24 rounded border border-zinc-300 px-2 py-1"
                    title={lineDeltaMap[line.lineId]?.quantity}
                    min={0.01}
                    onChange={(event) => {
                      onQuantityChange(line.lineId, event.target.value);
                    }}
                    step={0.01}
                    type="number"
                    value={line.quantity}
                  />
                </td>
                <td className={`px-4 py-3 ${diffCellClass(Boolean(lineDiffMap[line.lineId]?.has("costUnit")))}`}>
                  <input
                    className="w-28 rounded border border-zinc-300 px-2 py-1"
                    title={lineDeltaMap[line.lineId]?.costUnit}
                    min={0}
                    onChange={(event) => {
                      onCostChange(line.lineId, event.target.value);
                    }}
                    step={0.01}
                    type="number"
                    value={line.costUnit}
                  />
                </td>
                <td className={`px-4 py-3 ${diffCellClass(Boolean(lineDiffMap[line.lineId]?.has("priceUnit")))}`}>
                  <input
                    className="w-28 rounded border border-zinc-300 px-2 py-1"
                    title={lineDeltaMap[line.lineId]?.priceUnit}
                    min={0}
                    onChange={(event) => {
                      onPriceChange(line.lineId, event.target.value);
                    }}
                    step={0.01}
                    type="number"
                    value={line.priceUnit}
                  />
                </td>
                <td className="px-4 py-3 text-zinc-700">
                  <div className="space-y-0.5 text-xs">
                    <div>C: {formatCurrency(accumulation?.subtotalCost ?? 0)}</div>
                    <div>R: {formatCurrency(accumulation?.subtotalRevenue ?? 0)}</div>
                    <div>U: {formatCurrency(accumulation?.subtotalProfit ?? 0)}</div>
                  </div>
                </td>
                <td className="px-4 py-3 font-medium text-zinc-900">
                  <div className="space-y-0.5 text-xs">
                    <div>C: {formatCurrency(accumulation?.runningCost ?? 0)}</div>
                    <div>R: {formatCurrency(accumulation?.runningRevenue ?? 0)}</div>
                    <div>U: {formatCurrency(accumulation?.runningProfit ?? 0)}</div>
                  </div>
                </td>
                <td className={`px-4 py-3 ${diffCellClass(Boolean(lineDiffMap[line.lineId]?.has("marginPct")))}`}>
                  <input
                    className="w-24 rounded border border-zinc-300 px-2 py-1"
                    title={lineDeltaMap[line.lineId]?.marginPct}
                    max={99.99}
                    min={0}
                    onChange={(event) => {
                      onMarginChange(line.lineId, event.target.value);
                    }}
                    step={0.01}
                    type="number"
                    value={line.marginPct}
                  />
                </td>
                <td className={`px-4 py-3 ${diffCellClass(Boolean(lineDiffMap[line.lineId]?.has("classification1")))}`}>
                  <select
                    className="w-28 rounded border border-zinc-300 px-2 py-1"
                    title={lineDeltaMap[line.lineId]?.classification1}
                    onChange={(event) => {
                      updateLine(line.lineId, {
                        classification1:
                          event.target.value === "service" ? "service" : "product",
                      });
                    }}
                    value={line.classification1}
                  >
                    <option value="product">Producto</option>
                    <option value="service">Servicio</option>
                  </select>
                </td>
                <td className={`px-4 py-3 ${diffCellClass(Boolean(lineDiffMap[line.lineId]?.has("classification2")))}`}>
                  <input
                    className="w-36 rounded border border-zinc-300 px-2 py-1"
                    title={lineDeltaMap[line.lineId]?.classification2}
                    onChange={(event) => {
                      updateLine(line.lineId, { classification2: event.target.value });
                    }}
                    placeholder="Ej. Implementacion"
                    type="text"
                    value={line.classification2}
                  />
                </td>
                <td className="px-4 py-3 text-xs text-zinc-600">
                  {getLineDeltaSummary(lineDeltaMap[line.lineId]).length > 0 ? (
                    <div className="space-y-1">
                      {getLineDeltaSummary(lineDeltaMap[line.lineId]).map((deltaText) => (
                        <div key={`${line.lineId}-${deltaText}`}>{deltaText}</div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-zinc-400">Sin cambios</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <button
                    className="rounded border border-rose-300 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={lines.length <= 1}
                    onClick={() => {
                      removePartida(line.lineId);
                    }}
                    type="button"
                  >
                    Eliminar
                  </button>
                </td>
              </tr>
              );
            })}
            {lines.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-center text-zinc-500" colSpan={13}>
                  {loading
                    ? "Cargando lineas..."
                    : selectedQuote
                      ? "No hay lineas para esta cotizacion"
                      : "Selecciona una cotizacion"}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
