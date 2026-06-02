"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  QuoteLineEditor,
  type QuoteVersionSaved,
} from "@/components/cotizador/quote-line-editor";
import type { QuoteGroupSummary } from "@/lib/db/quotes";
import {
  normalizeQuotePanelState,
  normalizeQuoteSort,
  resolveSelectedQuoteId,
  type QuoteSort,
} from "@/lib/domain/quote-list-state";

type TenantOption = {
  id: string;
  name: string;
  slug: string;
};

type QuoteShellProps = {
  currentTenantSlug: string;
  items: QuoteGroupSummary[];
  tenantName: string;
  tenantOptions: TenantOption[];
};

function formatCurrency(value: number | null): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(value ?? 0);
}

const QUOTE_STATUS_LABELS: Record<string, string> = {
  closed: "Cerrada",
  draft: "Borrador",
  rejected: "Rechazada",
  sent: "Enviada",
};

const QUOTE_STATUS_COLORS: Record<string, string> = {
  closed: "bg-emerald-100 text-emerald-800",
  draft: "bg-zinc-100 text-zinc-700",
  rejected: "bg-rose-100 text-rose-800",
  sent: "bg-sky-100 text-sky-800",
};

function QuoteStatusBadge({ status }: { status: string }) {
  const label = QUOTE_STATUS_LABELS[status] ?? status;
  const colorClass = QUOTE_STATUS_COLORS[status] ?? "bg-zinc-100 text-zinc-700";

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colorClass}`}>
      {label}
    </span>
  );
}

function sortQuotes(items: QuoteGroupSummary[]): QuoteGroupSummary[] {
  return [...items].sort((a, b) => {
    const aTime = a.createdAt ? Date.parse(a.createdAt) : 0;
    const bTime = b.createdAt ? Date.parse(b.createdAt) : 0;

    return bTime - aTime;
  });
}

export function QuoteShell({
  currentTenantSlug,
  items,
  tenantName,
  tenantOptions,
}: QuoteShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [quoteItems, setQuoteItems] = useState<QuoteGroupSummary[]>(() => sortQuotes(items));
  const [activeQuoteId, setActiveQuoteId] = useState<string | null>(items[0]?.quoteId ?? null);
  const lastHandledQuoteIdFromQueryRef = useRef<string | null>(null);
  const [isQuotesPanelOpen, setIsQuotesPanelOpen] = useState(false);
  const [quoteSearch, setQuoteSearch] = useState("");
  const [quoteSort, setQuoteSort] = useState<QuoteSort>("date_desc");
  const [selectedTenantSlug, setSelectedTenantSlug] = useState(currentTenantSlug);
  const [switchingTenant, setSwitchingTenant] = useState(false);
  const [clientName, setClientName] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [clientSearch, setClientSearch] = useState("");
  const [clientOptions, setClientOptions] = useState<{ clientId: string; company: string; contactName: string | null }[]>([]);
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [proposalName, setProposalName] = useState("");
  const [playbookName, setPlaybookName] = useState("General");
  const [quotedBy, setQuotedBy] = useState("");
  const [createState, setCreateState] = useState<"idle" | "saving" | "error">("idle");
  const [createMessage, setCreateMessage] = useState<string | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importStatus, setImportStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);
  const clientSearchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clientDropdownRef = useRef<HTMLDivElement>(null);

  const filteredQuoteItems = useMemo(() => {
    const normalizedSearch = quoteSearch.trim().toLowerCase();
    const searchedItems = quoteItems.filter((item) => {
      if (normalizedSearch.length === 0) {
        return true;
      }

      return [item.clientName, item.proposalName, item.quoteGroupId].some((field) =>
        field.toLowerCase().includes(normalizedSearch),
      );
    });

    return [...searchedItems].sort((left, right) => {
      if (quoteSort === "date_asc" || quoteSort === "date_desc") {
        const leftTime = left.createdAt ? Date.parse(left.createdAt) : 0;
        const rightTime = right.createdAt ? Date.parse(right.createdAt) : 0;

        return quoteSort === "date_asc" ? leftTime - rightTime : rightTime - leftTime;
      }

      if (quoteSort === "client_asc") {
        return left.clientName.localeCompare(right.clientName, "es");
      }

      return (right.totalRevenue ?? 0) - (left.totalRevenue ?? 0);
    });
  }, [quoteItems, quoteSearch, quoteSort]);

  // Sincroniza la lista cuando el servidor devuelve datos frescos (ej. post-importación Excel)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQuoteItems(sortQuotes(items));
  }, [items]);

  // Limpia el mensaje de importación exitosa después de 4 segundos
  useEffect(() => {
    if (importStatus !== "success") return;
    const timer = setTimeout(() => {
      setImportStatus("idle");
      setImportMessage(null);
    }, 4000);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importStatus]);

  useEffect(() => {
    const nextQuoteId = searchParams.get("quoteId");

    if (lastHandledQuoteIdFromQueryRef.current === nextQuoteId) {
      return;
    }

    lastHandledQuoteIdFromQueryRef.current = nextQuoteId;
    const validQuoteId = resolveSelectedQuoteId(quoteItems, nextQuoteId);

    setActiveQuoteId((current) => (current === validQuoteId ? current : validQuoteId));
  }, [quoteItems, searchParams]);

  useEffect(() => {
    const nextSearch = searchParams.get("q") ?? "";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQuoteSearch((current) => (current === nextSearch ? current : nextSearch));
  }, [searchParams]);

  useEffect(() => {
    const panelFromQuery = searchParams.get("panel");
    const nextPanelOpen = normalizeQuotePanelState(panelFromQuery);

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsQuotesPanelOpen((current) => (current === nextPanelOpen ? current : nextPanelOpen));
  }, [searchParams]);

  useEffect(() => {
    const sortFromQuery = searchParams.get("sort") ?? "date_desc";
    const nextSort = normalizeQuoteSort(sortFromQuery);

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQuoteSort((current) => (current === nextSort ? current : nextSort));
  }, [searchParams]);

  useEffect(() => {
    const currentQuoteId = searchParams.get("quoteId");

    if ((activeQuoteId ?? null) === (currentQuoteId ?? null)) {
      return;
    }

    const nextParams = new URLSearchParams(searchParams.toString());

    if (activeQuoteId) {
      nextParams.set("quoteId", activeQuoteId);
    } else {
      nextParams.delete("quoteId");
    }

    const nextQuery = nextParams.toString();
    router.replace(nextQuery.length > 0 ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  }, [activeQuoteId, pathname, router, searchParams]);

  useEffect(() => {
    const currentSearch = searchParams.get("q") ?? "";
    const expectedSearch = quoteSearch.trim();

    if (currentSearch === expectedSearch) {
      return;
    }

    const nextParams = new URLSearchParams(searchParams.toString());

    if (expectedSearch.length > 0) {
      nextParams.set("q", expectedSearch);
    } else {
      nextParams.delete("q");
    }

    const nextQuery = nextParams.toString();
    router.replace(nextQuery.length > 0 ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  }, [pathname, quoteSearch, router, searchParams]);

  useEffect(() => {
    const currentPanel = searchParams.get("panel") ?? "closed";
    const expectedPanel = isQuotesPanelOpen ? "open" : "closed";

    if (currentPanel === expectedPanel) {
      return;
    }

    const nextParams = new URLSearchParams(searchParams.toString());

    if (isQuotesPanelOpen) {
      nextParams.set("panel", "open");
    } else {
      nextParams.delete("panel");
    }

    const nextQuery = nextParams.toString();
    router.replace(nextQuery.length > 0 ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  }, [isQuotesPanelOpen, pathname, router, searchParams]);

  useEffect(() => {
    const currentSort = searchParams.get("sort") ?? "date_desc";

    if (currentSort === quoteSort) {
      return;
    }

    const nextParams = new URLSearchParams(searchParams.toString());

    if (quoteSort === "date_desc") {
      nextParams.delete("sort");
    } else {
      nextParams.set("sort", quoteSort);
    }

    const nextQuery = nextParams.toString();
    router.replace(nextQuery.length > 0 ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  }, [pathname, quoteSort, router, searchParams]);

  useEffect(() => {
    if (filteredQuoteItems.length === 0) {
      return;
    }

    const selectedIsVisible = filteredQuoteItems.some((item) => item.quoteId === activeQuoteId);

    if (!selectedIsVisible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveQuoteId(filteredQuoteItems[0].quoteId);
    }
  }, [activeQuoteId, filteredQuoteItems]);

  // Buscar clientes con debounce al escribir en el campo de cliente
  useEffect(() => {
    if (clientSearchTimeout.current) {
      clearTimeout(clientSearchTimeout.current);
    }

    const trimmed = clientSearch.trim();

    if (trimmed.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setClientOptions([]);
      setShowClientDropdown(false);
      return;
    }

    clientSearchTimeout.current = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/clients?search=${encodeURIComponent(trimmed)}`);
          if (!res.ok) return;
          const data = (await res.json()) as { clients: { clientId: string; company: string; contactName: string | null }[] };
          setClientOptions(data.clients.slice(0, 8));
          setShowClientDropdown(true);
        } catch {
          // silencioso
        }
      })();
    }, 250);

    return () => {
      if (clientSearchTimeout.current) {
        clearTimeout(clientSearchTimeout.current);
      }
    };
  }, [clientSearch]);

  // Cerrar dropdown de clientes al hacer clic fuera
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (clientDropdownRef.current && !clientDropdownRef.current.contains(event.target as Node)) {
        setShowClientDropdown(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleSelectClient(option: { clientId: string; company: string; contactName: string | null }) {
    setSelectedClientId(option.clientId);
    setClientName(option.company);
    setClientSearch(option.company);
    setShowClientDropdown(false);
  }

  function handleClearClient() {
    setSelectedClientId(null);
    setClientSearch("");
    setClientName("");
    setClientOptions([]);
    setShowClientDropdown(false);
  }

  function handleClientSearchChange(value: string) {
    setClientSearch(value);
    setClientName(value);
    // Si el usuario edita manualmente, desvincula el cliente seleccionado
    if (selectedClientId) {
      setSelectedClientId(null);
    }
  }

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
          clientId: selectedClientId ?? null,
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
      setSelectedClientId(null);
      setClientSearch("");
      setClientOptions([]);
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

  // Importa partidas desde un Excel y las carga en la cotización activa,
  // reemplazando las líneas existentes. Después recarga la página para
  // que el editor refleje las partidas importadas.
  async function handleImportExcel() {
    if (!activeQuoteId || !importFile) {
      return;
    }

    setImportStatus("uploading");
    setImportMessage(null);

    const formData = new FormData();
    formData.append("file", importFile);

    try {
      const response = await fetch(`/api/quotes/${activeQuoteId}/import`, {
        body: formData,
        method: "POST",
      });

      const data = (await response.json()) as { error?: string; importedCount?: number; quoteId?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "No fue posible importar el archivo");
      }

      setImportStatus("success");
      setImportMessage(`Se importaron ${data.importedCount ?? 0} partidas.`);
      setImportFile(null);

      // Actualización optimista: muestra la nueva versión en la lista sin esperar al servidor
      const currentEntry = quoteItems.find((q) => q.quoteId === activeQuoteId);
      if (data.quoteId && currentEntry) {
        const optimisticEntry: QuoteGroupSummary = {
          avgMargin: currentEntry.avgMargin,
          clientName: currentEntry.clientName,
          createdAt: new Date().toISOString(),
          playbookName: currentEntry.playbookName,
          proposalName: currentEntry.proposalName,
          quoteGroupId: currentEntry.quoteGroupId,
          quoteId: data.quoteId,
          status: "draft",
          totalRevenue: null,
          version: currentEntry.version + 1,
          versionCount: currentEntry.versionCount + 1,
        };
        setQuoteItems((prev) =>
          sortQuotes([optimisticEntry, ...prev.filter((q) => q.quoteGroupId !== optimisticEntry.quoteGroupId)]),
        );
        setActiveQuoteId(data.quoteId);
      }

      // Actualizar URL con el nuevo quoteId (también dispara re-render del servidor
      // para que los totales y márgenes se actualicen con los datos reales)
      if (data.quoteId) {
        const params = new URLSearchParams(searchParams.toString());
        params.set("quoteId", data.quoteId);
        router.push(`${pathname}?${params.toString()}`);
      } else {
        router.refresh();
      }
    } catch (error) {
      setImportStatus("error");
      setImportMessage(error instanceof Error ? error.message : "Error interno");
    }
  }

  async function handleTenantAssociation(slug: string) {
    if (!slug || slug === selectedTenantSlug) {
      return;
    }

    setSwitchingTenant(true);
    setCreateMessage(null);

    try {
      const response = await fetch("/api/context/tenant", {
        body: JSON.stringify({ slug }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      const data = (await response.json()) as { error?: string; ok?: boolean };

      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "No fue posible asociar la empresa");
      }

      setSelectedTenantSlug(slug);
      setCreateMessage("Empresa asociada correctamente. Recargando...");
      window.location.reload();
    } catch (error) {
      setCreateState("error");
      setCreateMessage(error instanceof Error ? error.message : "Error interno");
      setSwitchingTenant(false);
    }
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-2 border-b border-zinc-200 pb-4">
        <p className="text-sm uppercase tracking-[0.18em] text-zinc-500">Tenant activo</p>
        <h1 className="text-2xl font-semibold text-zinc-900">Cotizaciones de {tenantName}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-500" htmlFor="tenant-selector">
            Asociar a empresa
          </label>
          <select
            className="min-w-[260px] rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
            disabled={switchingTenant}
            id="tenant-selector"
            onChange={(event) => {
              void handleTenantAssociation(event.target.value);
            }}
            value={selectedTenantSlug}
          >
            {tenantOptions.map((tenantOption) => (
              <option key={tenantOption.id} value={tenantOption.slug}>
                {tenantOption.name} ({tenantOption.slug})
              </option>
            ))}
          </select>
          {switchingTenant ? <p className="text-xs text-zinc-500">Actualizando contexto...</p> : null}
        </div>
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
          {/* Selector de cliente con búsqueda */}
          <div className="relative" ref={clientDropdownRef}>
            <div className="flex items-center gap-1">
              <input
                autoComplete="off"
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
                onChange={(event) => handleClientSearchChange(event.target.value)}
                onFocus={() => {
                  if (clientSearch.trim().length > 0 && clientOptions.length > 0) {
                    setShowClientDropdown(true);
                  }
                }}
                placeholder="Cliente (buscar o escribir)"
                value={clientSearch}
              />
              {selectedClientId ? (
                <button
                  className="shrink-0 rounded px-1 text-xs text-zinc-400 hover:text-zinc-700"
                  onClick={handleClearClient}
                  title="Quitar cliente seleccionado"
                  type="button"
                >
                  ✕
                </button>
              ) : null}
            </div>
            {selectedClientId ? (
              <p className="mt-0.5 text-xs text-emerald-600">Cliente vinculado al catálogo</p>
            ) : null}
            {showClientDropdown && clientOptions.length > 0 ? (
              <ul className="absolute z-30 mt-1 max-h-52 w-full overflow-auto rounded-lg border border-zinc-200 bg-white shadow-lg">
                {clientOptions.map((option) => (
                  <li key={option.clientId}>
                    <button
                      className="w-full px-3 py-2 text-left text-sm text-zinc-900 hover:bg-zinc-50"
                      onMouseDown={() => handleSelectClient(option)}
                      type="button"
                    >
                      <span className="font-medium">{option.company}</span>
                      {option.contactName ? (
                        <span className="ml-2 text-xs text-zinc-500">{option.contactName}</span>
                      ) : null}
                    </button>
                  </li>
                ))}
                <li className="border-t border-zinc-100 px-3 py-2">
                  <a className="text-xs text-zinc-400 hover:text-zinc-700" href="/configuracion/clientes" rel="noreferrer" target="_blank">
                    + Gestionar clientes
                  </a>
                </li>
              </ul>
            ) : null}
          </div>
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
              <div className="flex flex-col gap-2 md:flex-row md:items-center">
                <input
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
                  onChange={(event) => setQuoteSearch(event.target.value)}
                  placeholder="Buscar por cliente, propuesta o folio"
                  value={quoteSearch}
                />
                <select
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 md:w-56"
                  onChange={(event) => setQuoteSort(event.target.value as QuoteSort)}
                  value={quoteSort}
                >
                  <option value="date_desc">Mas recientes</option>
                  <option value="date_asc">Mas antiguas</option>
                  <option value="client_asc">Cliente A-Z</option>
                  <option value="revenue_desc">Mayor revenue</option>
                </select>
              </div>
            </div>
            <div className="overflow-hidden">
              <table className="min-w-full divide-y divide-zinc-200 text-sm">
                <thead className="bg-zinc-50 text-left text-zinc-600">
                  <tr>
                    <th className="px-4 py-3 font-medium">Cliente</th>
                    <th className="px-4 py-3 font-medium">Propuesta</th>
                    <th className="px-4 py-3 font-medium">Folio</th>
                    <th className="px-4 py-3 font-medium">Estado</th>
                    <th className="px-4 py-3 font-medium">Versiones</th>
                    <th className="px-4 py-3 font-medium">Total</th>
                    <th className="px-4 py-3 font-medium">Margen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 bg-white">
                  {filteredQuoteItems.map((item) => (
                    <tr
                      className={activeQuoteId === item.quoteId ? "bg-emerald-50/60" : "hover:bg-zinc-50"}
                      key={item.quoteId}
                      onClick={() => setActiveQuoteId(item.quoteId)}
                    >
                      <td className="px-4 py-3 text-zinc-900">{item.clientName}</td>
                      <td className="px-4 py-3 text-zinc-600">{item.proposalName}</td>
                      <td className="px-4 py-3 font-mono text-sm font-semibold text-zinc-700">{item.quoteGroupId}</td>
                      <td className="px-4 py-3">
                        <QuoteStatusBadge status={item.status} />
                      </td>
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
      {activeQuoteId ? (
        <div className="mt-4 rounded-lg border border-dashed border-zinc-300 bg-white p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Importar partidas desde Excel</p>
          <p className="mt-1 text-xs text-zinc-500">
            Reemplaza las partidas de la cotización activa con las filas del archivo. Columnas esperadas: <code>sku</code>, <code>description</code>, <code>quantity</code>, <code>costUnit</code>, <code>priceUnit</code>.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              ref={importFileRef}
              accept=".xlsx"
              className="hidden"
              onChange={(event) => {
                setImportFile(event.target.files?.[0] ?? null);
                setImportStatus("idle");
                setImportMessage(null);
              }}
              type="file"
            />
            <button
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
              onClick={() => { importFileRef.current?.click(); }}
              type="button"
            >
              {importFile ? importFile.name : "Elegir archivo .xlsx"}
            </button>
            {importFile ? (
              <button
                className="rounded-lg border border-emerald-600 bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={importStatus === "uploading"}
                onClick={() => { void handleImportExcel(); }}
                type="button"
              >
                {importStatus === "uploading" ? "Importando..." : "Importar Excel"}
              </button>
            ) : null}
          </div>
          {importMessage ? (
            <p className={`mt-2 text-sm ${importStatus === "error" ? "text-rose-700" : "text-emerald-700"}`}>
              {importMessage}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
