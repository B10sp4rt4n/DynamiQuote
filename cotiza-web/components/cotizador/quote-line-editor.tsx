"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

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

function normalizeQuantity(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.max(1, Math.round(value));
}

function normalizeLineQuantity(line: EditableQuoteLine): EditableQuoteLine {
  return {
    ...line,
    quantity: normalizeQuantity(line.quantity),
  };
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

type LineDiffMapResult = {
  addedCount: number;
  deltaMap: LineDeltaMap;
  diffMap: LineDiffMap;
  modifiedCount: number;
  removedCount: number;
  unchangedCount: number;
};

function buildLineDiffMap(
  baselineLines: EditableQuoteLine[],
  currentLines: EditableQuoteLine[],
): LineDiffMapResult {
  // Matching semántico: lineId > sku > descripción normalizada.
  // Fallback posicional solo para diff visual (no cuenta como match semántico).
  function normalizeDesc(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, " ");
  }

  const byId = new Map(baselineLines.map((line) => [line.lineId, line]));
  const bySku = new Map<string, EditableQuoteLine>();
  const byDesc = new Map<string, EditableQuoteLine>();

  for (const line of baselineLines) {
    if (line.sku && line.sku.trim().length > 0) {
      bySku.set(line.sku.trim(), line);
    }
    const desc = normalizeDesc(line.description);
    if (desc.length > 0 && !byDesc.has(desc)) {
      byDesc.set(desc, line);
    }
  }

  const semanticMatchedBaselineIds = new Set<string>();

  function findBaseline(
    current: EditableQuoteLine,
    positionIndex: number,
  ): { line: EditableQuoteLine; semantic: boolean } | undefined {
    // 1. Mismo lineId
    if (byId.has(current.lineId)) {
      const match = byId.get(current.lineId)!;
      byId.delete(current.lineId);
      semanticMatchedBaselineIds.add(match.lineId);
      return { line: match, semantic: true };
    }

    // 2. Mismo sku
    const sku = current.sku?.trim();
    if (sku && sku.length > 0 && bySku.has(sku)) {
      const match = bySku.get(sku)!;
      bySku.delete(sku);
      semanticMatchedBaselineIds.add(match.lineId);
      return { line: match, semantic: true };
    }

    // 3. Misma descripción normalizada
    const desc = normalizeDesc(current.description);
    if (desc.length > 0 && byDesc.has(desc)) {
      const match = byDesc.get(desc)!;
      byDesc.delete(desc);
      semanticMatchedBaselineIds.add(match.lineId);
      return { line: match, semantic: true };
    }

    // 4. Fallback posicional (solo visual)
    const positional = baselineLines[positionIndex];
    if (positional) {
      return { line: positional, semantic: false };
    }

    return undefined;
  }

  const nextDiffMap: LineDiffMap = {};
  const nextDeltaMap: LineDeltaMap = {};
  let addedCount = 0;
  let modifiedCount = 0;
  let unchangedCount = 0;

  for (const [index, currentLine] of currentLines.entries()) {
    const found = findBaseline(currentLine, index);

    if (!found) {
      addedCount++;
      continue;
    }

    const { line: baselineLine, semantic } = found;

    if (!semantic) {
      // Sin match semántico: cuenta como línea agregada en el panel comercial.
      // Sigue mostrando diff visual contra fallback posicional.
      addedCount++;
    }

    const changed = getChangedFields(baselineLine, currentLine);

    if (changed.size > 0) {
      if (semantic) modifiedCount++;
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
          ? toDelta(normalizeQuantity(baselineLine.quantity), normalizeQuantity(currentLine.quantity))
          : undefined,
      };
    } else if (semantic) {
      unchangedCount++;
    }
  }

  const removedCount = baselineLines.filter((l) => !semanticMatchedBaselineIds.has(l.lineId)).length;

  return {
    addedCount,
    deltaMap: nextDeltaMap,
    diffMap: nextDiffMap,
    modifiedCount,
    removedCount,
    unchangedCount,
  };
}

// ---------------------------------------------------------------------------
// Panel de resumen comercial de comparación
// ---------------------------------------------------------------------------

type CompareLineCounts = {
  addedCount: number;
  modifiedCount: number;
  removedCount: number;
  unchangedCount: number;
};

function CompareSummaryPanel({
  compareState,
  lineCounts,
  versions,
}: {
  compareState: VersionCompareState;
  lineCounts: CompareLineCounts;
  versions: QuoteVersionHistoryItem[];
}) {
  const base = versions.find((v) => v.quoteId === compareState.baselineQuoteId);
  const target = versions.find((v) => v.quoteId === compareState.targetQuoteId);

  if (!base || !target) return null;

  const baseTotal = base.totalRevenue ?? 0;
  const targetTotal = target.totalRevenue ?? 0;
  const diffAbsolute = targetTotal - baseTotal;
  const diffPct = baseTotal !== 0 ? (diffAbsolute / baseTotal) * 100 : 0;
  const baseMargin = base.avgMargin ?? 0;
  const targetMargin = target.avgMargin ?? 0;
  const diffMarginPp = targetMargin - baseMargin;

  const STATUS_PANEL: Record<string, string> = {
    closed: "Cerrada", draft: "Borrador", rejected: "Rechazada", sent: "Enviada",
  };

  function fmtCur(v: number) {
    return new Intl.NumberFormat("es-MX", { currency: "MXN", maximumFractionDigits: 0, style: "currency" }).format(v);
  }
  function fmtDiff(v: number) { return (v >= 0 ? "+" : "") + fmtCur(v); }
  function fmtPct(v: number) { return (v >= 0 ? "+" : "") + v.toFixed(2) + "%"; }
  function fmtPp(v: number) { return (v >= 0 ? "+" : "") + v.toFixed(1) + " pp"; }

  return (
    <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-sky-700">Resumen de comparación</p>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Versiones */}
        <div className="space-y-2">
          <div>
            <p className="text-xs text-zinc-500">Base</p>
            <p className="text-sm font-semibold text-zinc-900">
              v{base.version}{" "}
              <span className="font-normal text-zinc-600">· {STATUS_PANEL[base.status] ?? base.status}</span>
            </p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Nueva</p>
            <p className="text-sm font-semibold text-zinc-900">
              v{target.version}{" "}
              <span className="font-normal text-zinc-600">· {STATUS_PANEL[target.status] ?? target.status}</span>
            </p>
          </div>
        </div>
        {/* Totales */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500">Total base</span>
            <span className="text-sm font-medium text-zinc-900">{fmtCur(baseTotal)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500">Total nuevo</span>
            <span className="text-sm font-medium text-zinc-900">{fmtCur(targetTotal)}</span>
          </div>
          <div className="flex items-center justify-between border-t border-sky-200 pt-1">
            <span className="text-xs font-medium text-zinc-600">Diferencia</span>
            <span className={`text-sm font-semibold ${diffAbsolute >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
              {fmtDiff(diffAbsolute)} / {fmtPct(diffPct)}
            </span>
          </div>
        </div>
        {/* Márgenes */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500">Margen base</span>
            <span className="text-sm font-medium text-zinc-900">{baseMargin.toFixed(1)}%</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500">Margen nuevo</span>
            <span className="text-sm font-medium text-zinc-900">{targetMargin.toFixed(1)}%</span>
          </div>
          <div className="flex items-center justify-between border-t border-sky-200 pt-1">
            <span className="text-xs font-medium text-zinc-600">Δ Margen</span>
            <span className={`text-sm font-semibold ${diffMarginPp >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
              {fmtPp(diffMarginPp)}
            </span>
          </div>
        </div>
        {/* Líneas */}
        <div>
          <p className="mb-2 text-xs font-medium text-zinc-600">Cambios en líneas</p>
          <div className="flex flex-wrap gap-1.5">
            <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">+{lineCounts.addedCount} agregadas</span>
            <span className="rounded bg-rose-100 px-2 py-0.5 text-xs text-rose-800">−{lineCounts.removedCount} eliminadas</span>
            <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">{lineCounts.modifiedCount} modificadas</span>
            <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">{lineCounts.unchangedCount} sin cambio</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const STATUS_LABELS: Record<string, string> = {
  closed: "Cerrada",
  draft: "Borrador",
  rejected: "Rechazada",
  sent: "Enviada",
};

const STATUS_COLORS: Record<string, string> = {
  closed: "bg-emerald-100 text-emerald-800 border-emerald-300",
  draft: "bg-zinc-100 text-zinc-700 border-zinc-300",
  rejected: "bg-rose-100 text-rose-800 border-rose-300",
  sent: "bg-sky-100 text-sky-800 border-sky-300",
};

function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABELS[status] ?? status;
  const colorClass = STATUS_COLORS[status] ?? "bg-zinc-100 text-zinc-700 border-zinc-300";

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${colorClass}`}>
      {label}
    </span>
  );
}

export function QuoteLineEditor({
  forcedSelectedQuoteId,
  onQuoteVersionSaved,
  quotes,
}: QuoteLineEditorProps) {
  const router = useRouter();
  const [selectedQuoteId, setSelectedQuoteId] = useState<string>(quotes[0]?.quoteId ?? "");
  const [lines, setLines] = useState<EditableQuoteLine[]>([]);
  const [quantityDrafts, setQuantityDrafts] = useState<Record<string, string>>({});
  const [lineDiffMap, setLineDiffMap] = useState<LineDiffMap>({});
  const [lineDeltaMap, setLineDeltaMap] = useState<LineDeltaMap>({});
  const [versions, setVersions] = useState<QuoteVersionHistoryItem[]>([]);
  const [compareState, setCompareState] = useState<VersionCompareState | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [versioningNow, setVersioningNow] = useState(false);
  const [creatingProposal, setCreatingProposal] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showPackagePicker, setShowPackagePicker] = useState(false);
  const [compareLineCounts, setCompareLineCounts] = useState<CompareLineCounts>({
    addedCount: 0,
    modifiedCount: 0,
    removedCount: 0,
    unchangedCount: 0,
  });

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

    // eslint-disable-next-line react-hooks/set-state-in-effect
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
    } catch {
      setVersions([]);
    }
  }

  async function loadLines(quoteId: string) {
    if (!quoteId) {
      setLines([]);
      setQuantityDrafts({});
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
        setQuantityDrafts({});
        return;
      }

      setLines(data.lines.map(normalizeLineQuantity));
      setQuantityDrafts({});
    } catch {
      setMessage("Error de red al cargar lineas");
      setLines([]);
      setQuantityDrafts({});
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
    const digitsOnly = value.replace(/\D/g, "");

    setQuantityDrafts((current) => ({
      ...current,
      [lineId]: digitsOnly,
    }));

    if (digitsOnly.length === 0) {
      return;
    }

    updateLine(lineId, { quantity: normalizeQuantity(toNumber(digitsOnly)) });
  }

  function commitQuantityDraft(lineId: string) {
    const draft = quantityDrafts[lineId];
    const committedValue = normalizeQuantity(toNumber(draft ?? ""));

    updateLine(lineId, { quantity: committedValue });

    setQuantityDrafts((current) => {
      const next = { ...current };
      delete next[lineId];
      return next;
    });
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

  async function saveLines(forceNewVersion = false): Promise<string | null> {
    if (!selectedQuoteId || lines.length === 0) {
      return null;
    }

    if (forceNewVersion) {
      setVersioningNow(true);
    } else {
      setSaving(true);
    }
    setMessage(null);

    const previousLines = lines;

    try {
      const payload = {
        forceNewVersion,
        lines: lines.map((line) => ({
          classification1: line.classification1,
          classification2: line.classification2,
          costUnit: line.costUnit,
          description: line.description,
          lineId: line.lineId,
          marginPct: line.marginPct,
          mode: "price" as const,
          priceUnit: line.priceUnit,
          quantity: normalizeQuantity(line.quantity),
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
        return null;
      }

      const nextDiffResult = buildLineDiffMap(previousLines, data.lines);

      setLines(data.lines.map(normalizeLineQuantity));
      setQuantityDrafts({});
      setLineDiffMap(nextDiffResult.diffMap);
      setLineDeltaMap(nextDiffResult.deltaMap);
      setCompareLineCounts({
        addedCount: nextDiffResult.addedCount,
        modifiedCount: nextDiffResult.modifiedCount,
        removedCount: nextDiffResult.removedCount,
        unchangedCount: nextDiffResult.unchangedCount,
      });
      if (data.versionCreated) {
        setCompareState({
          baselineQuoteId: selectedQuoteId,
          baselineVersion: data.quote.version - 1,
          targetQuoteId: data.quote.quoteId,
          targetVersion: data.quote.version,
        });
      } else {
        setCompareState(null);
      }
      onQuoteVersionSaved?.(data.quote);
      setSelectedQuoteId(data.quote.quoteId);
      void loadVersions(data.quote.quoteId);
      setMessage(
        data.versionCreated
          ? `Version v${data.quote.version} creada y guardada correctamente`
          : `Borrador v${data.quote.version} actualizado correctamente`,
      );
      return data.quote.quoteId;
    } catch {
      setMessage("Error de red al guardar");
      return null;
    } finally {
      setSaving(false);
      setVersioningNow(false);
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

      setLines(targetData.lines.map(normalizeLineQuantity));
      setQuantityDrafts({});
      setSelectedQuoteId(targetQuoteId);
      setLineDiffMap(diffResult.diffMap);
      setLineDeltaMap(diffResult.deltaMap);
      setCompareLineCounts({
        addedCount: diffResult.addedCount,
        modifiedCount: diffResult.modifiedCount,
        removedCount: diffResult.removedCount,
        unchangedCount: diffResult.unchangedCount,
      });
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
      setMessage("Selecciona una cotizacion valida antes de crear la propuesta");
      return;
    }

    let quoteIdForProposal = selectedQuoteId;
    const hasUnsavedRevenueChanges = Math.abs((selectedQuote.totalRevenue ?? 0) - totals.totalRevenue) > 0.01;

    if (hasUnsavedRevenueChanges) {
      setMessage("Guardando cambios antes de generar la propuesta...");
      const savedQuoteId = await saveLines();

      if (!savedQuoteId) {
        return;
      }

      quoteIdForProposal = savedQuoteId;
    }

    setCreatingProposal(true);
    setMessage(null);

    try {
      const response = await fetch("/api/proposals", {
        body: JSON.stringify({
          quoteId: quoteIdForProposal,
          recipientCompany: selectedQuote.clientName,
          subject: selectedQuote.proposalName,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      let data: {
        error?: string;
        proposal?: {
          formal: {
            proposalNumber: string;
          } | null;
          proposalId: string;
        };
      } = {};

      try {
        data = (await response.json()) as {
          error?: string;
          proposal?: {
            formal: {
              proposalNumber: string;
            } | null;
            proposalId: string;
          };
        };
      } catch {
        // Si el backend regresa un HTML de error, mostramos un mensaje claro.
      }

      if (!response.ok || !data.proposal) {
        throw new Error(data.error ?? "No fue posible generar la propuesta");
      }

      const proposalLabel = data.proposal.formal?.proposalNumber ?? data.proposal.proposalId;
      setMessage(`Propuesta ${proposalLabel} creada correctamente. Redirigiendo a Propuestas...`);
      router.push(`/propuestas?proposalId=${encodeURIComponent(data.proposal.proposalId)}`);
      router.refresh();
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

  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [takingAction, setTakingAction] = useState(false);

  async function handleQuoteAction(action: "send" | "close" | "reject", reason?: string) {
    if (!selectedQuoteId) return;

    setTakingAction(true);
    setActionMessage(null);

    try {
      const response = await fetch(`/api/quotes/${selectedQuoteId}`, {
        body: JSON.stringify({ action, reason }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });

      const data = (await response.json()) as {
        affectedProposals?: Array<{ proposalId: string; proposalNumber: string | null; previousStatus: string; newStatus: string }>;
        error?: string;
        status?: string;
      };

      if (!response.ok) {
        setActionMessage(data.error ?? "No se pudo completar la accion");
        return;
      }

      const nudged = data.affectedProposals ?? [];
      const nudgedCount = nudged.length;

      function buildNudgeMessage(): string {
        if (nudgedCount === 0) return "Version cerrada correctamente";
        const allHaveNumber = nudged.every((p) => p.proposalNumber);
        if (allHaveNumber) {
          const folios = nudged.map((p) => p.proposalNumber!).join(", ");
          return `Cotizacion cerrada. ${folios} ${nudgedCount > 1 ? "fueron movidas" : "fue movida"} a En revision.`;
        }
        return `Cotizacion cerrada. ${nudgedCount} propuesta${nudgedCount > 1 ? "s" : ""} vinculada${nudgedCount > 1 ? "s" : ""} ${nudgedCount > 1 ? "fueron movidas" : "fue movida"} a En revision.`;
      }

      setActionMessage(
        action === "send"
          ? "Cotizacion marcada como Enviada"
          : action === "close"
            ? buildNudgeMessage()
            : "Version rechazada",
      );
      await loadVersions(selectedQuoteId);
    } catch {
      setActionMessage("Error de red al ejecutar la accion");
    } finally {
      setTakingAction(false);
    }
  }

  const currentVersion = useMemo(
    () => versions.find((v) => v.quoteId === selectedQuoteId),
    [versions, selectedQuoteId],
  );

  const currentStatus = currentVersion?.status ?? selectedQuote?.status ?? "draft";

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
        String(normalizeQuantity(line.quantity)),
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
                {quote.quoteGroupId} · v{quote.version} · {STATUS_LABELS[quote.status] ?? quote.status} — {quote.clientName}
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
            disabled={saving || versioningNow || loading || lines.length === 0}
            onClick={() => {
              void saveLines();
            }}
            type="button"
          >
            {saving ? "Guardando..." : "Guardar"}
          </button>
          <button
            className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-800 hover:bg-indigo-100 disabled:opacity-50"
            disabled={saving || versioningNow || loading || lines.length === 0}
            onClick={() => {
              const confirmed = window.confirm(
                "Se creara una nueva version en borrador con el estado actual. \n\n¿Deseas continuar?",
              );

              if (!confirmed) {
                return;
              }

              void saveLines(true);
            }}
            type="button"
          >
            {versioningNow ? "Versionando..." : "Versionar ahora"}
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
        {selectedQuote && (
          <div className="flex items-center gap-2 rounded-lg bg-zinc-50 px-3 py-2 text-sm">
            <span className="font-mono text-xs font-semibold text-zinc-900">{selectedQuote.quoteGroupId}</span>
            <span className="text-zinc-400">·</span>
            <span className="text-xs text-zinc-500">v{currentVersion?.version ?? selectedQuote.version} de {selectedQuote.versionCount}</span>
            <StatusBadge status={currentStatus} />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3 border-t border-zinc-100 pt-3">
          <StatusBadge status={currentStatus} />
          {currentStatus === "draft" && (
            <button
              className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-800 hover:bg-sky-100 disabled:opacity-50"
              disabled={takingAction}
              onClick={() => { void handleQuoteAction("send"); }}
              type="button"
            >
              {takingAction ? "..." : "Marcar enviada"}
            </button>
          )}
          {(currentStatus === "draft" || currentStatus === "sent") && (
            <>
              <button
                className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                disabled={takingAction}
                onClick={() => { void handleQuoteAction("close"); }}
                type="button"
              >
                {takingAction ? "..." : "Cerrar version"}
              </button>
              <button
                className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-800 hover:bg-rose-100 disabled:opacity-50"
                disabled={takingAction}
                onClick={() => { void handleQuoteAction("reject"); }}
                type="button"
              >
                {takingAction ? "..." : "Rechazar"}
              </button>
            </>
          )}
          {actionMessage && (
            <p className="text-xs text-zinc-600">{actionMessage}</p>
          )}
        </div>
        {currentStatus === "closed" && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <strong className="font-semibold">Versión cerrada</strong> — Esta versión se conserva como referencia comercial.
            Si guardas cambios, se creará automáticamente una nueva versión en borrador.
          </div>
        )}
        {currentStatus === "rejected" && (
          <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            <strong className="font-semibold">Versión rechazada</strong> — Puedes consultarla como referencia.
            Para generar una nueva versión activa, edita las líneas y guarda.
          </div>
        )}
        {currentStatus === "sent" && (
          <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700">
            <strong className="font-semibold">Versión enviada</strong> — Esta versión fue enviada al cliente.
            Puedes cerrarla (aprobada) o rechazarla, o editarla para crear una nueva versión.
          </div>
        )}
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

      {compareState && (
        <CompareSummaryPanel
          compareState={compareState}
          lineCounts={compareLineCounts}
          versions={versions}
        />
      )}

      {diffSummary.changedLineCount > 0 ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Cambios detectados: {diffSummary.changedLineCount} lineas y {diffSummary.changedFieldCount} campos actualizados.
          {compareState
            ? ` Comparacion: v${compareState.baselineVersion} -> v${compareState.targetVersion}.`
            : ""}
        </div>
      ) : null}

      {versions.length > 0 ? (
        <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-zinc-700">Historial de versiones</p>
            <span className="text-xs text-zinc-400">{versions.length} versión{versions.length !== 1 ? "es" : ""}</span>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-zinc-500">
                  <th className="pb-2 pr-6 font-medium">Versión</th>
                  <th className="pb-2 pr-6 font-medium">Estado</th>
                  <th className="pb-2 pr-6 font-medium">Fecha</th>
                  <th className="pb-2 pr-6 font-medium">Total</th>
                  <th className="pb-2 pr-6 font-medium">Margen</th>
                  <th className="pb-2 font-medium">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {versions.map((version) => {
                  const isActive = version.quoteId === selectedQuoteId;
                  return (
                    <tr key={version.quoteId} className={isActive ? "bg-white" : ""}>
                      <td className="py-2 pr-6">
                        <span className="font-mono text-xs font-semibold text-zinc-900">v{version.version}</span>
                        {isActive && <span className="ml-1.5 text-xs text-zinc-400">(actual)</span>}
                      </td>
                      <td className="py-2 pr-6">
                        <StatusBadge status={version.status} />
                      </td>
                      <td className="py-2 pr-6 text-xs text-zinc-500">
                        {version.createdAt
                          ? new Date(version.createdAt).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })
                          : "—"}
                        {version.sentAt && <span className="ml-1 text-sky-600">· enviada</span>}
                        {version.closedAt && <span className="ml-1 text-emerald-600">· cerrada</span>}
                        {version.rejectedAt && <span className="ml-1 text-rose-600">· rechazada</span>}
                      </td>
                      <td className="py-2 pr-6 text-xs font-semibold text-zinc-900">
                        {version.totalRevenue !== null
                          ? new Intl.NumberFormat("es-MX", { currency: "MXN", maximumFractionDigits: 0, style: "currency" }).format(version.totalRevenue)
                          : "—"}
                      </td>
                      <td className="py-2 pr-6 text-xs text-zinc-600">
                        {version.avgMargin !== null ? `${version.avgMargin.toFixed(1)}%` : "—"}
                      </td>
                      <td className="py-2">
                        <div className="flex gap-1.5">
                          {!isActive && (
                            <button
                              className="rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
                              onClick={() => { void handleQuoteChange(version.quoteId); }}
                              type="button"
                            >
                              Ver
                            </button>
                          )}
                          <button
                            className="rounded border border-sky-200 bg-sky-50 px-2 py-1 text-xs text-sky-700 hover:bg-sky-100 disabled:opacity-40"
                            disabled={isActive}
                            onClick={() => { void compareWithVersion(version.quoteId, selectedQuoteId); }}
                            type="button"
                          >
                            Comparar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
              <th className="px-4 py-3 font-medium">Cantidad (entero)</th>
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
                    inputMode="numeric"
                    pattern="[0-9]*"
                    title={lineDeltaMap[line.lineId]?.quantity}
                    onBlur={() => {
                      commitQuantityDraft(line.lineId);
                    }}
                    onChange={(event) => {
                      onQuantityChange(line.lineId, event.target.value);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        commitQuantityDraft(line.lineId);
                      }
                    }}
                    type="text"
                    value={quantityDrafts[line.lineId] ?? String(normalizeQuantity(line.quantity))}
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
