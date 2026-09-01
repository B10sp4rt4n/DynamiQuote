"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { ProposalSummary } from "@/lib/db/proposals";
import {
  normalizeProposalListFilter,
  normalizeProposalSort,
  resolveSelectedProposalId,
  type ProposalListFilter,
  type ProposalSort,
} from "@/lib/domain/proposal-list-state";
import type { ProposalLiberationEvaluation } from "@/lib/domain/proposal-liberation";
import {
  resolveProposalIssuanceGate,
  type ProposalIssuanceStatus,
} from "@/lib/domain/proposal-issuance-gate";
import type { ProposalStatus } from "@/lib/validations/proposals";

type ProposalApprovalRecordView = {
  approvalId: string;
  approverRole: "superadmin" | "owner" | "admin" | "user";
  approverUserId: string;
  createdAt: string;
  decision: "approved" | "rejected" | "overridden";
  executedByUserId: string | null;
  proposalId: string;
  reason: string | null;
  tenantId: string;
};

// Forma minima del proposal que devuelven los endpoints de override -- solo
// los campos que estos handlers necesitan sincronizar localmente.
type MarginOverrideResponseProposal = {
  approvals: ProposalApprovalRecordView[];
  hasOpenMarginOverrideWindow: boolean;
  isPendingOverrideTarget: boolean;
  marginEvaluation: ProposalLiberationEvaluation;
  status: ProposalStatus;
};

type ProposalApprovalGateView = {
  canAuthorizeFinal: boolean;
  missingRoles: Array<"owner" | "superadmin">;
  observerApproved: boolean;
  ownerApproved: boolean;
};

type ProposalShellProps = {
  canForceIssuance: boolean;
  proposals: ProposalSummary[];
  tenantName: string;
};

const STATUS_FILTERS: Array<{ className: string; label: string; value: ProposalListFilter }> = [
  { className: "border-zinc-900 bg-zinc-900 text-white", label: "Todas", value: "all" },
  { className: "border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50", label: "Borrador", value: "draft" },
  { className: "border-blue-300 bg-white text-blue-700 hover:bg-blue-50", label: "Enviadas", value: "sent" },
  { className: "border-amber-300 bg-white text-amber-700 hover:bg-amber-50", label: "En revision", value: "in_review" },
  { className: "border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-50", label: "Aprobadas", value: "approved" },
  { className: "border-rose-300 bg-white text-rose-700 hover:bg-rose-50", label: "Rechazadas", value: "rejected" },
  { className: "border-zinc-300 bg-white text-zinc-500 hover:bg-zinc-50", label: "Vencidas", value: "expired" },
  { className: "border-rose-300 bg-white text-rose-700 hover:bg-rose-50", label: "Bloqueadas margen", value: "blocked_margin" },
];

type ProposalStatusOption = {
  label: string;
  value: ProposalStatus;
};

const statusOptions: ProposalStatusOption[] = [
  { label: "Borrador", value: "draft" },
  { label: "Enviada", value: "sent" },
  { label: "En revision", value: "in_review" },
  { label: "Aprobada", value: "approved" },
  { label: "Rechazada", value: "rejected" },
  { label: "Vencida", value: "expired" },
];

function formatStatus(value: ProposalStatus): string {
  return statusOptions.find((option) => option.value === value)?.label ?? value;
}

// Clases de color para el badge de estado según su semántica de flujo de trabajo.
function getStatusBadgeClass(value: ProposalStatus): string {
  switch (value) {
    case "draft":     return "bg-zinc-100 text-zinc-700";
    case "in_review": return "bg-amber-100 text-amber-800";
    case "approved":  return "bg-emerald-100 text-emerald-800";
    case "rejected":  return "bg-rose-100 text-rose-800";
    case "sent":      return "bg-blue-100 text-blue-800";
    case "expired":   return "bg-zinc-200 text-zinc-600";
  }
}

function formatDate(value: string | null): string {
  if (!value) {
    return "N/D";
  }

  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatMarginLabel(value: ProposalLiberationEvaluation["releaseMode"]): string {
  if (value === "blocked") {
    return "Bloqueada por politica";
  }

  if (value === "informative") {
    return "Preaprobacion informativa";
  }

  return "Dentro de politica";
}

function getMarginToneClass(value: ProposalLiberationEvaluation["releaseMode"]): string {
  if (value === "blocked") {
    return "border-rose-200 bg-rose-50 text-rose-900";
  }

  if (value === "informative") {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }

  return "border-emerald-200 bg-emerald-50 text-emerald-900";
}

function formatApprovalRole(value: ProposalApprovalRecordView["approverRole"]): string {
  if (value === "owner") return "Owner";
  if (value === "superadmin") return "Superadmin";
  if (value === "admin") return "Admin";
  return "Usuario";
}

function formatApprovalDecision(value: ProposalApprovalRecordView["decision"]): string {
  if (value === "approved") return "Aprobada";
  if (value === "overridden") return "Override";
  return "Rechazada";
}

function formatMissingApprovalRoles(roles: Array<"owner" | "superadmin">): string {
  if (roles.length === 0) {
    return "";
  }

  return roles.map((role) => (role === "owner" ? "Owner" : "Superadmin")).join(", ");
}

function getFinalAuthorizationBadge(item: ProposalSummary): {
  className: string;
  label: string;
} | null {
  if (item.status === "approved") {
    return {
      className: "border-emerald-300 bg-emerald-50 text-emerald-700",
      label: "Autorizada",
    };
  }

  if (item.marginEvaluation && !item.marginEvaluation.canAuthorizeFinal) {
    return {
      className: "border-rose-300 bg-rose-50 text-rose-700",
      label: "Bloqueada por margen",
    };
  }

  return null;
}

function isMarginBlocked(item: ProposalSummary): boolean {
  return Boolean(item.marginEvaluation && !item.marginEvaluation.canAuthorizeFinal);
}

export function ProposalShell({ canForceIssuance, proposals, tenantName }: ProposalShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [items, setItems] = useState<ProposalSummary[]>(() => proposals);
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(() => {
    const fromQuery = typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("proposalId")
      : null;
    return resolveSelectedProposalId(proposals, fromQuery);
  });
  const [issuerCompany, setIssuerCompany] = useState<string>(proposals[0]?.formal?.issuerCompany ?? "");
  const [issuerEmail, setIssuerEmail] = useState<string>(proposals[0]?.formal?.issuerEmail ?? "");
  const [issuerPhone, setIssuerPhone] = useState<string>(proposals[0]?.formal?.issuerPhone ?? "");
  const [currency, setCurrency] = useState<string>(proposals[0]?.formal?.currency ?? "");
  const [validUntil, setValidUntil] = useState<string>((proposals[0]?.formal?.validUntil ?? "").slice(0, 10));
  // Switch de moneda al momento de emitir (no un gate que bloquee la
  // propuesta): si ya se eligio moneda, las acciones de imprimir/enviar
  // corren directo; si no, se pregunta aqui mismo antes de continuar.
  const [currencyPromptOpen, setCurrencyPromptOpen] = useState(false);
  const [currencyPromptValue, setCurrencyPromptValue] = useState("MXN");
  const [currencyPromptSaving, setCurrencyPromptSaving] = useState(false);
  const pendingIssuanceActionRef = useRef<(() => void) | null>(null);
  const [salesOwner, setSalesOwner] = useState<string>("");
  const [recipientCompany, setRecipientCompany] = useState<string>(
    proposals[0]?.formal?.recipientCompany ?? "",
  );
  const [recipientContactName, setRecipientContactName] = useState<string>(
    proposals[0]?.formal?.recipientContactName ?? "",
  );
  const [recipientEmail, setRecipientEmail] = useState<string>(proposals[0]?.formal?.recipientEmail ?? "");
  const [recipientContactTitle, setRecipientContactTitle] = useState<string>(
    proposals[0]?.formal?.recipientContactTitle ?? "",
  );
  const [subject, setSubject] = useState<string>(proposals[0]?.formal?.subject ?? "");
  const [selectedStatus, setSelectedStatus] = useState<ProposalStatus>(
    proposals[0]?.status ?? "draft",
  );
  const [selectedIssuanceStatus, setSelectedIssuanceStatus] = useState<ProposalIssuanceStatus>(
    "normal",
  );
  const [selectedHasOpenMarginOverrideWindow, setSelectedHasOpenMarginOverrideWindow] = useState(false);
  const [selectedIsPendingOverrideTarget, setSelectedIsPendingOverrideTarget] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideStatus, setOverrideStatus] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [overrideMessage, setOverrideMessage] = useState<string | null>(null);
  const [executeOverrideStatus, setExecuteOverrideStatus] = useState<"idle" | "pending" | "success" | "error">(
    "idle",
  );
  const [executeOverrideMessage, setExecuteOverrideMessage] = useState<string | null>(null);
  const [termsAndConditions, setTermsAndConditions] = useState<string>(
    proposals[0]?.formal?.termsAndConditions ?? "",
  );
  const [proposalItems, setProposalItems] = useState<
    Array<{
      componentType: string;
      costUnit: number;
      description: string;
      itemNumber: number;
      origin: string;
      priceUnit: number;
      quantity: number;
      sku: string;
      status: string;
    }>
  >([]);
  const [baselineProposalItems, setBaselineProposalItems] = useState<
    Array<{
      componentType: string;
      costUnit: number;
      description: string;
      itemNumber: number;
      origin: string;
      priceUnit: number;
      quantity: number;
      sku: string;
      status: string;
    }>
  >([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importStatus, setImportStatus] = useState<"idle" | "uploading" | "success" | "error">(
    "idle",
  );
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [approvals, setApprovals] = useState<ProposalApprovalRecordView[]>([]);
  const [approvalGate, setApprovalGate] = useState<ProposalApprovalGateView | null>(null);
  const [approvalPending, setApprovalPending] = useState(false);
  const [approvalReason, setApprovalReason] = useState("");
  const [emailStatus, setEmailStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [emailMessage, setEmailMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<ProposalSort>("date_desc");
  const listFilter = normalizeProposalListFilter(searchParams.get("filter"));

  const filteredItems = useMemo(() => {
    const byFilter = (() => {
      if (listFilter === "all") return items;
      if (listFilter === "blocked_margin") {
        return items.filter((item) => item.marginEvaluation && !item.marginEvaluation.canAuthorizeFinal);
      }
      return items.filter((item) => item.status === listFilter);
    })();

    const q = searchQuery.trim().toLowerCase();
    const searchedItems =
      q.length === 0
        ? byFilter
        : byFilter.filter((item) =>
            [
              item.formal?.proposalNumber,
              item.formal?.recipientCompany,
              item.formal?.subject,
              item.formal?.issuerContactName,
              item.proposalId,
            ].some((field) => field?.toLowerCase().includes(q)),
          );

    return [...searchedItems].sort((left, right) => {
      if (sortBy === "date_asc" || sortBy === "date_desc") {
        const leftTime = Date.parse(left.formal?.issuedDate ?? left.createdAt ?? "") || 0;
        const rightTime = Date.parse(right.formal?.issuedDate ?? right.createdAt ?? "") || 0;

        return sortBy === "date_asc" ? leftTime - rightTime : rightTime - leftTime;
      }

      if (sortBy === "client_asc") {
        return (left.formal?.recipientCompany ?? "").localeCompare(right.formal?.recipientCompany ?? "", "es");
      }

      return formatStatus(left.status).localeCompare(formatStatus(right.status), "es");
    });
  }, [items, listFilter, searchQuery, sortBy]);

  const blockedCount = useMemo(
    () => items.filter((item) => item.marginEvaluation && !item.marginEvaluation.canAuthorizeFinal).length,
    [items],
  );

  const selectedProposal = useMemo(
    () => items.find((item) => item.proposalId === selectedProposalId) ?? null,
    [items, selectedProposalId],
  );
  const issuanceGate = useMemo(
    () =>
      resolveProposalIssuanceGate({
        issuanceStatus: selectedIssuanceStatus,
        status: selectedStatus,
      }),
    [selectedIssuanceStatus, selectedStatus],
  );
  // Contenido material (partidas, empresa receptora, asunto) solo se edita
  // en draft -- fuera de ahi hay que reabrir explicitamente primero. Los
  // campos "seguros" (terminos, datos de contacto) no dependen de esto.
  const canEditContent = selectedStatus === "draft";
  const marginAllowsFinalAuthorization = selectedProposal?.marginEvaluation?.canAuthorizeFinal ?? true;
  const marginAllowsInformativeShare = selectedProposal?.marginEvaluation?.canShareInformative ?? false;
  const approvalAllowsFinalAuthorization = approvalGate?.canAuthorizeFinal ?? true;
  const canRequestFinalAuthorization =
    marginAllowsFinalAuthorization && approvalAllowsFinalAuthorization;
  const canShowEmailFlow = Boolean(selectedProposal);
  const finalAuthorizationGuardMessage = !marginAllowsFinalAuthorization
    ? selectedProposal?.marginEvaluation?.summary ??
      "La politica de margen bloquea la autorizacion final de esta propuesta."
    : !approvalAllowsFinalAuthorization
      ? `Faltan aprobaciones formales: ${formatMissingApprovalRoles(approvalGate?.missingRoles ?? ["owner"])}.`
      : null;

  useEffect(() => {
    const queryFromUrl = searchParams.get("q") ?? "";

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearchQuery((current) => (current === queryFromUrl ? current : queryFromUrl));
  }, [searchParams]);

  useEffect(() => {
    const sortFromQuery = searchParams.get("sort") ?? "date_desc";
    const nextSort = normalizeProposalSort(sortFromQuery);

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSortBy((current) => (current === nextSort ? current : nextSort));
  }, [searchParams]);

  useEffect(() => {
    const currentSearchParam = searchParams.get("q") ?? "";
    const expectedSearchParam = searchQuery.trim();

    if (currentSearchParam === expectedSearchParam) {
      return;
    }

    const nextParams = new URLSearchParams(searchParams.toString());

    if (expectedSearchParam.length > 0) {
      nextParams.set("q", expectedSearchParam);
    } else {
      nextParams.delete("q");
    }

    const nextQuery = nextParams.toString();
    router.replace(nextQuery.length > 0 ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  }, [pathname, router, searchParams, searchQuery]);

  useEffect(() => {
    const currentSortParam = searchParams.get("sort") ?? "date_desc";
    const expectedSortParam = sortBy;

    if (currentSortParam === expectedSortParam) {
      return;
    }

    const nextParams = new URLSearchParams(searchParams.toString());

    if (expectedSortParam === "date_desc") {
      nextParams.delete("sort");
    } else {
      nextParams.set("sort", expectedSortParam);
    }

    const nextQuery = nextParams.toString();
    router.replace(nextQuery.length > 0 ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  }, [pathname, router, searchParams, sortBy]);

  useEffect(() => {
    const currentProposalParam = searchParams.get("proposalId");

    if (currentProposalParam === selectedProposalId) {
      return;
    }

    const nextParams = new URLSearchParams(searchParams.toString());

    if (selectedProposalId) {
      nextParams.set("proposalId", selectedProposalId);
    } else {
      nextParams.delete("proposalId");
    }

    const nextQuery = nextParams.toString();
    router.replace(nextQuery.length > 0 ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  }, [selectedProposalId, pathname, router, searchParams]);

  useEffect(() => {
    if (!selectedProposalId) {
      return;
    }

    // eslint-disable-next-line react-hooks/immutability
    void loadProposalDetail(selectedProposalId);
  }, [selectedProposalId]);

  useEffect(() => {
    if (filteredItems.length === 0) {
      return;
    }

    const selectedIsVisible = filteredItems.some((item) => item.proposalId === selectedProposalId);

    if (!selectedIsVisible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedProposalId(filteredItems[0].proposalId);
    }
  }, [filteredItems, selectedProposalId]);

  function handleSelectProposal(proposalId: string) {
    const found = items.find((item) => item.proposalId === proposalId);

    setSelectedProposalId(proposalId);
    setIssuerCompany(found?.formal?.issuerCompany ?? "");
    setIssuerEmail(found?.formal?.issuerEmail ?? "");
    setIssuerPhone(found?.formal?.issuerPhone ?? "");
    setCurrency(found?.formal?.currency ?? "");
    setValidUntil((found?.formal?.validUntil ?? "").slice(0, 10));
    setRecipientCompany(found?.formal?.recipientCompany ?? "");
    setRecipientContactName(found?.formal?.recipientContactName ?? "");
    setRecipientEmail(found?.formal?.recipientEmail ?? "");
    setRecipientContactTitle(found?.formal?.recipientContactTitle ?? "");
    setSubject(found?.formal?.subject ?? "");
    setSelectedStatus(found?.status ?? "draft");
    setTermsAndConditions(found?.formal?.termsAndConditions ?? "");
    setSaveStatus("idle");
    setErrorMessage(null);
    setApprovalReason("");
    setEmailStatus("idle");
    setEmailMessage(null);
  }

  function handleListFilterChange(nextFilter: ProposalListFilter) {
    const nextParams = new URLSearchParams(searchParams.toString());

    if (nextFilter === "all") {
      nextParams.delete("filter");
    } else {
      nextParams.set("filter", nextFilter);
    }

    const nextQuery = nextParams.toString();
    router.replace(nextQuery.length > 0 ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  }

  async function loadProposalDetail(proposalId: string) {
    setLoadingDetail(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/proposals/${proposalId}`, { method: "GET" });
      const data = (await response.json()) as {
        error?: string;
        proposal?: {
          formal: {
            currency: string | null;
            issuerCompany: string;
            issuerContactName: string;
            issuerEmail: string;
            issuerPhone: string;
            recipientCompany: string;
            recipientContactName: string;
            recipientContactTitle: string;
            recipientEmail: string;
            subject: string;
            termsAndConditions: string;
            validUntil: string | null;
          } | null;
          items: Array<{
            componentType: string;
            costUnit: number;
            description: string;
            itemNumber: number;
            origin: string;
            priceUnit: number;
            quantity: number;
            sku: string;
            status: string;
          }>;
          marginEvaluation?: ProposalLiberationEvaluation | null;
          approvalGate: ProposalApprovalGateView;
          approvals: ProposalApprovalRecordView[];
          hasOpenMarginOverrideWindow: boolean;
          isPendingOverrideTarget: boolean;
          issuanceStatus: ProposalIssuanceStatus;
          salesOwner: string;
          proposalId: string;
          status: ProposalStatus;
        };
      };

      if (!response.ok || !data.proposal) {
        throw new Error(data.error ?? "No fue posible cargar la propuesta");
      }

      setIssuerCompany(data.proposal.formal?.issuerCompany ?? "");
      setIssuerEmail(data.proposal.formal?.issuerEmail ?? "");
      setIssuerPhone(data.proposal.formal?.issuerPhone ?? "");
      setCurrency(data.proposal.formal?.currency ?? "");
      setValidUntil((data.proposal.formal?.validUntil ?? "").slice(0, 10));
      setRecipientCompany(data.proposal.formal?.recipientCompany ?? "");
      setRecipientContactName(data.proposal.formal?.recipientContactName ?? "");
      setRecipientEmail(data.proposal.formal?.recipientEmail ?? "");
      setRecipientContactTitle(data.proposal.formal?.recipientContactTitle ?? "");
      setSubject(data.proposal.formal?.subject ?? "");
      setTermsAndConditions(data.proposal.formal?.termsAndConditions ?? "");
      setSelectedStatus(data.proposal.status);
      setSelectedIssuanceStatus(data.proposal.issuanceStatus ?? "normal");
      setSelectedHasOpenMarginOverrideWindow(data.proposal.hasOpenMarginOverrideWindow ?? false);
      setSelectedIsPendingOverrideTarget(data.proposal.isPendingOverrideTarget ?? false);
      setSalesOwner(data.proposal.salesOwner ?? data.proposal.formal?.issuerContactName ?? "");
      setApprovals(data.proposal.approvals ?? []);
      setApprovalGate(data.proposal.approvalGate ?? null);
      setProposalItems(
        data.proposal.items.map((row, index) => ({
          ...row,
          itemNumber: index + 1,
        })),
      );
      setBaselineProposalItems(
        data.proposal.items.map((row, index) => ({
          ...row,
          itemNumber: index + 1,
        })),
      );

      setItems((current) =>
        current.map((item) =>
          item.proposalId === data.proposal?.proposalId
            ? {
                ...item,
                formal: item.formal
                  ? {
                      ...item.formal,
                      issuerCompany: data.proposal?.formal?.issuerCompany ?? item.formal.issuerCompany,
                      issuerContactName:
                        data.proposal?.formal?.issuerContactName ?? item.formal.issuerContactName,
                      issuerEmail: data.proposal?.formal?.issuerEmail ?? item.formal.issuerEmail,
                      issuerPhone: data.proposal?.formal?.issuerPhone ?? item.formal.issuerPhone,
                      currency: data.proposal?.formal?.currency ?? item.formal.currency,
                      validUntil: data.proposal?.formal?.validUntil ?? item.formal.validUntil,
                      recipientCompany:
                        data.proposal?.formal?.recipientCompany ?? item.formal.recipientCompany,
                      recipientContactName:
                        data.proposal?.formal?.recipientContactName ?? item.formal.recipientContactName,
                      recipientContactTitle:
                        data.proposal?.formal?.recipientContactTitle ?? item.formal.recipientContactTitle,
                      recipientEmail:
                        data.proposal?.formal?.recipientEmail ?? item.formal.recipientEmail,
                      subject: data.proposal?.formal?.subject ?? item.formal.subject,
                      termsAndConditions:
                        data.proposal?.formal?.termsAndConditions ?? item.formal.termsAndConditions,
                    }
                  : item.formal,
                status: data.proposal?.status ?? item.status,
                marginEvaluation: data.proposal?.marginEvaluation ?? item.marginEvaluation ?? null,
              }
            : item,
        ),
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Error interno");
    } finally {
      setLoadingDetail(false);
    }
  }

  function updateProposalItem(
    index: number,
    field:
      | "componentType"
      | "costUnit"
      | "description"
      | "origin"
      | "priceUnit"
      | "quantity"
      | "sku"
      | "status",
    value: string,
  ) {
    setProposalItems((current) =>
      current.map((item, itemIndex) => {
        if (itemIndex !== index) {
          return item;
        }

        if (field === "costUnit" || field === "priceUnit" || field === "quantity") {
          const parsed = Number(value);
          return {
            ...item,
            [field]: Number.isFinite(parsed) ? parsed : 0,
          };
        }

        return {
          ...item,
          [field]: value,
        };
      }),
    );
  }

  function addProposalItem() {
    setProposalItems((current) => [
      ...current,
      {
        componentType: "",
        costUnit: 0,
        description: "",
        itemNumber: current.length + 1,
        origin: "manual",
        priceUnit: 0,
        quantity: 1,
        sku: "",
        status: "active",
      },
    ]);
  }

  function removeProposalItem(index: number) {
    setProposalItems((current) =>
      current
        .filter((_, itemIndex) => itemIndex !== index)
        .map((item, itemIndex) => ({
          ...item,
          itemNumber: itemIndex + 1,
        })),
    );
  }

  // Guarda todos los campos del formulario en la API.
  // Acepta un statusOverride opcional para cambiar el estado en el mismo request (usado por handleSendToApproval).
  // Después de un guardado exitoso sincroniza selectedStatus con el estado real devuelto por la API.
  async function handleSave(statusOverride?: ProposalStatus): Promise<boolean> {
    if (!selectedProposal) {
      return false;
    }

    // Usar el override si se proporciona; de lo contrario usar el estado seleccionado en el dropdown.
    const statusToSend = statusOverride ?? selectedStatus;

    // El guard de margen solo aplica al aprobar desde borrador o revisión.
    // Si el usuario registra la aceptación del cliente desde el estado "Enviada",
    // la propuesta ya fue aprobada internamente antes; no se re-valida el margen.
    if (statusToSend === "approved" && !marginAllowsFinalAuthorization && selectedStatus !== "sent") {
      setSaveStatus("error");
      setErrorMessage(
        selectedProposal?.marginEvaluation?.summary ??
          "La politica de margen bloquea la autorizacion final de esta propuesta.",
      );
      return false;
    }

    setSaveStatus("saving");
    setErrorMessage(null);

    const currentFormal = selectedProposal.formal;
    const normalizedItems = proposalItems.map((item, index) => ({
      ...item,
      itemNumber: index + 1,
    }));
    const baselineItems = baselineProposalItems.map((item, index) => ({
      componentType: item.componentType,
      costUnit: item.costUnit,
      description: item.description,
      itemNumber: index + 1,
      origin: item.origin,
      priceUnit: item.priceUnit,
      quantity: item.quantity,
      sku: item.sku,
      status: item.status,
    }));
    const hasItemsChanges = JSON.stringify(normalizedItems) !== JSON.stringify(baselineItems);

    const payload: {
      currency?: string;
      issuerCompany?: string;
      issuerEmail?: string;
      issuerPhone?: string;
      items?: Array<{
        componentType: string;
        costUnit: number;
        description: string;
        itemNumber: number;
        origin: string;
        priceUnit: number;
        quantity: number;
        sku: string;
        status: string;
      }>;
      recipientCompany?: string;
      recipientContactName?: string;
      recipientContactTitle?: string;
      recipientEmail?: string;
      status?: ProposalStatus;
      subject?: string;
      termsAndConditions?: string;
      validUntil?: string;
    } = {};

    if (issuerCompany !== (currentFormal?.issuerCompany ?? "")) {
      payload.issuerCompany = issuerCompany;
    }
    if (issuerEmail !== (currentFormal?.issuerEmail ?? "")) {
      payload.issuerEmail = issuerEmail;
    }
    if (issuerPhone !== (currentFormal?.issuerPhone ?? "")) {
      payload.issuerPhone = issuerPhone;
    }
    if (currency !== (currentFormal?.currency ?? "")) {
      payload.currency = currency;
    }
    if (validUntil !== (currentFormal?.validUntil?.slice(0, 10) ?? "")) {
      payload.validUntil = validUntil;
    }
    if (recipientCompany !== (currentFormal?.recipientCompany ?? "")) {
      payload.recipientCompany = recipientCompany;
    }
    if (recipientContactName !== (currentFormal?.recipientContactName ?? "")) {
      payload.recipientContactName = recipientContactName;
    }
    if (recipientContactTitle !== (currentFormal?.recipientContactTitle ?? "")) {
      payload.recipientContactTitle = recipientContactTitle;
    }
    if (recipientEmail !== (currentFormal?.recipientEmail ?? "")) {
      payload.recipientEmail = recipientEmail;
    }
    if (subject !== (currentFormal?.subject ?? "")) {
      payload.subject = subject;
    }
    if (termsAndConditions !== (currentFormal?.termsAndConditions ?? "")) {
      payload.termsAndConditions = termsAndConditions;
    }

    if (statusToSend !== selectedProposal.status) {
      payload.status = statusToSend;
    }

    if (hasItemsChanges) {
      payload.items = normalizedItems;
    }

    if (Object.keys(payload).length === 0) {
      setSaveStatus("success");
      return true;
    }

    try {
      const response = await fetch(`/api/proposals/${selectedProposal.proposalId}`, {
        body: JSON.stringify(payload),
        headers: {
          "Content-Type": "application/json",
        },
        method: "PUT",
      });

      const data = (await response.json()) as {
        error?: string;
        proposal?: {
          formal: {
            currency: string | null;
            issuerCompany: string;
            issuerContactName: string;
            issuerEmail: string;
            issuerPhone: string;
            recipientCompany: string;
            recipientContactName: string;
            recipientContactTitle: string;
            recipientEmail: string;
            subject: string;
            termsAndConditions: string;
            validUntil: string | null;
          } | null;
          items: Array<{
            componentType: string;
            costUnit: number;
            description: string;
            itemNumber: number;
            origin: string;
            priceUnit: number;
            quantity: number;
            sku: string;
            status: string;
          }>;
          marginEvaluation?: ProposalLiberationEvaluation | null;
          approvalGate: ProposalApprovalGateView;
          approvals: ProposalApprovalRecordView[];
          hasOpenMarginOverrideWindow: boolean;
          issuanceStatus: ProposalIssuanceStatus;
          proposalId: string;
          status: ProposalStatus;
        };
      };

      if (!response.ok || !data.proposal) {
        throw new Error(data.error ?? "No fue posible guardar la propuesta");
      }

      setItems((current) =>
        current.map((item) =>
          item.proposalId === data.proposal?.proposalId
            ? {
                ...item,
                formal: item.formal
                  ? {
                      ...item.formal,
                      recipientCompany:
                        data.proposal?.formal?.recipientCompany ?? item.formal.recipientCompany,
                    recipientContactName:
                      data.proposal?.formal?.recipientContactName ??
                      item.formal.recipientContactName,
                    recipientContactTitle:
                      data.proposal?.formal?.recipientContactTitle ??
                      item.formal.recipientContactTitle,
                    recipientEmail:
                      data.proposal?.formal?.recipientEmail ?? item.formal.recipientEmail,
                    issuerCompany:
                      data.proposal?.formal?.issuerCompany ?? item.formal.issuerCompany,
                    issuerContactName:
                      data.proposal?.formal?.issuerContactName ?? item.formal.issuerContactName,
                    issuerEmail:
                      data.proposal?.formal?.issuerEmail ?? item.formal.issuerEmail,
                    issuerPhone:
                      data.proposal?.formal?.issuerPhone ?? item.formal.issuerPhone,
                    currency: data.proposal?.formal?.currency ?? item.formal.currency,
                    validUntil: data.proposal?.formal?.validUntil ?? item.formal.validUntil,
                    subject: data.proposal?.formal?.subject ?? item.formal.subject,
                    termsAndConditions:
                      data.proposal?.formal?.termsAndConditions ?? item.formal.termsAndConditions,
                  }
                  : item.formal,
                marginEvaluation: data.proposal?.marginEvaluation ?? item.marginEvaluation ?? null,
                status: data.proposal?.status ?? item.status,
              }
            : item,
        ),
      );

      setProposalItems(
        (data.proposal.items ?? []).map((row, index) => ({
          ...row,
          itemNumber: index + 1,
        })),
      );
      setBaselineProposalItems(
        (data.proposal.items ?? []).map((row, index) => ({
          ...row,
          itemNumber: index + 1,
        })),
      );
      setApprovals(data.proposal.approvals ?? []);
      setApprovalGate(data.proposal.approvalGate ?? null);

      // Sincronizar el dropdown con el estado real confirmado por la API
      // (la API puede ajustar el estado si el workflow lo requiere).
      setSelectedStatus(data.proposal.status);
      setSelectedIssuanceStatus(data.proposal.issuanceStatus ?? "normal");
      setSelectedHasOpenMarginOverrideWindow(data.proposal.hasOpenMarginOverrideWindow ?? false);
      setTermsAndConditions(data.proposal.formal?.termsAndConditions ?? termsAndConditions);
      if (data.proposal.status === "approved") {
        setEmailStatus("idle");
        setEmailMessage(null);
      }
      setSaveStatus("success");
      return true;
    } catch (error) {
      setSaveStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Error interno");
      return false;
    }
  }

  // Envía la propuesta al flujo de aprobación con la lógica de pre-aprobación por margen:
  // - Si el margen cumple los parámetros de autorización final (canAuthorizeFinal): aprueba automáticamente
  //   sin necesidad de acción del owner. El usuario ve el estado "Aprobada" de inmediato.
  // - Si el margen NO cumple parámetros: cambia el estado a "En revisión" para que el owner
  //   evalúe la propuesta y decida aprobar o rechazar manualmente.
  // NOTA: "Enviada" es el estado que se asigna cuando se envía la propuesta al cliente por correo,
  //       no cuando se envía a revisión interna.
  async function handleSendToApproval() {
    if (!selectedProposal) return;
    const targetStatus: ProposalStatus = marginAllowsFinalAuthorization ? "approved" : "in_review";
    await handleSave(targetStatus);
  }

  async function handleApprovalDecision(decision: "approved" | "rejected") {
    if (!selectedProposal) {
      return;
    }

    setApprovalPending(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/proposals/${selectedProposal.proposalId}/approvals`, {
        body: JSON.stringify({
          decision,
          reason: approvalReason.trim() || undefined,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      const data = (await response.json()) as {
        error?: string;
        proposal?: {
          approvalGate: ProposalApprovalGateView;
          approvals: ProposalApprovalRecordView[];
          formal: ProposalSummary["formal"];
          hasOpenMarginOverrideWindow: boolean;
          issuanceStatus: ProposalIssuanceStatus;
          marginEvaluation: ProposalLiberationEvaluation;
          proposalId: string;
          status: ProposalStatus;
        };
      };

      if (!response.ok || !data.proposal) {
        throw new Error(data.error ?? "No fue posible registrar la decision");
      }

      setApprovals(data.proposal.approvals ?? []);
      setApprovalGate(data.proposal.approvalGate ?? null);
      setSelectedStatus(data.proposal.status);
      setSelectedIssuanceStatus(data.proposal.issuanceStatus ?? "normal");
      setSelectedHasOpenMarginOverrideWindow(data.proposal.hasOpenMarginOverrideWindow ?? false);
      if (data.proposal.status === "approved") {
        setEmailStatus("idle");
        setEmailMessage(null);
      }
      setItems((current) =>
        current.map((item) =>
          item.proposalId === data.proposal?.proposalId
            ? {
                ...item,
                marginEvaluation: data.proposal.marginEvaluation,
                status: data.proposal.status,
              }
            : item,
        ),
      );
      setApprovalReason("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Error interno");
    } finally {
      setApprovalPending(false);
    }
  }

  async function handleImportExcel() {
    if (!selectedProposal || !importFile) {
      return;
    }

    setImportStatus("uploading");
    setImportMessage(null);

    const formData = new FormData();
    formData.append("file", importFile);

    try {
      const response = await fetch(`/api/proposals/${selectedProposal.proposalId}/xlsx`, {
        body: formData,
        method: "POST",
      });

      const data = (await response.json()) as {
        error?: string;
        importedCount?: number;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "No fue posible importar el archivo");
      }

      setImportStatus("success");
      setImportMessage(`Se importaron ${data.importedCount ?? 0} partidas.`);
      setImportFile(null);
    } catch (error) {
      setImportStatus("error");
      setImportMessage(error instanceof Error ? error.message : "Error interno");
    }
  }

  async function saveCurrencyOnly(nextCurrency: string): Promise<boolean> {
    if (!selectedProposal) {
      return false;
    }

    try {
      const response = await fetch(`/api/proposals/${selectedProposal.proposalId}`, {
        body: JSON.stringify({ currency: nextCurrency }),
        headers: { "Content-Type": "application/json" },
        method: "PUT",
      });

      const data = (await response.json()) as {
        error?: string;
        proposal?: { formal: { currency: string | null } | null };
      };

      if (!response.ok || !data.proposal) {
        return false;
      }

      setCurrency(nextCurrency);
      setItems((current) =>
        current.map((item) =>
          item.proposalId === selectedProposal.proposalId
            ? { ...item, formal: item.formal ? { ...item.formal, currency: nextCurrency } : item.formal }
            : item,
        ),
      );
      return true;
    } catch {
      return false;
    }
  }

  // Switch de moneda al momento de imprimir/emitir: si la propuesta ya
  // tiene moneda elegida, la accion corre directo; si no, se pregunta con
  // un selector rapido antes de continuar -- no es un bloqueo permanente,
  // solo se resuelve una vez y de ahi en adelante ya no vuelve a preguntar.
  function ensureCurrencyThenRun(run: () => void) {
    if (selectedProposal?.formal?.currency) {
      run();
      return;
    }

    pendingIssuanceActionRef.current = run;
    setCurrencyPromptValue(currency || "MXN");
    setCurrencyPromptOpen(true);
  }

  async function confirmCurrencyPrompt() {
    setCurrencyPromptSaving(true);
    const ok = await saveCurrencyOnly(currencyPromptValue);
    setCurrencyPromptSaving(false);

    if (!ok) {
      setErrorMessage("No se pudo guardar la moneda. Intenta de nuevo.");
      return;
    }

    setCurrencyPromptOpen(false);
    const run = pendingIssuanceActionRef.current;
    pendingIssuanceActionRef.current = null;
    run?.();
  }

  function cancelCurrencyPrompt() {
    pendingIssuanceActionRef.current = null;
    setCurrencyPromptOpen(false);
  }

  async function handleSendEmailProposal() {
    if (!selectedProposal) {
      setEmailStatus("error");
      setEmailMessage("No hay propuesta seleccionada");
      return;
    }

    setEmailStatus("sending");
    setEmailMessage(null);

    try {
      const response = await fetch(`/api/proposals/${selectedProposal.proposalId}/send-email`, {
        // El destino se resuelve server-side; no se envía correo del cliente
        body: JSON.stringify({}),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      const data = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(data?.error ?? "No fue posible enviar el correo");
      }

      // Si la propuesta estaba aprobada, transiciona a "Enviada" para registrar que fue despachada.
      // Si ya estaba "Enviada", mantiene el estado (re-envío).
      if (selectedStatus === "approved") {
        setSelectedStatus("sent");
        setItems((current) =>
          current.map((item) =>
            item.proposalId === selectedProposal.proposalId ? { ...item, status: "sent" } : item,
          ),
        );
      }
      setEmailStatus("success");
      setEmailMessage(
        selectedStatus === "sent"
          ? "PDF re-enviado a tu correo."
          : "PDF enviado a tu correo.",
      );
    } catch (error) {
      setEmailStatus("error");
      setEmailMessage(error instanceof Error ? error.message : "Error interno al enviar correo");
    }
  }

  // Forzar emision: unicamente Owner/Superadmin, y solo cuando el gate esta
  // bloqueado. Requiere un motivo explicito (fricción deliberada para que no
  // se dispare por accidente) y queda auditado en proposal_audit_events.
  // Aplica al estado local lo que devuelven /override y /override/execute --
  // ambos responden con la propuesta actualizada completa.
  function syncMarginOverrideProposal(proposal: MarginOverrideResponseProposal, proposalId: string) {
    setApprovals(proposal.approvals ?? []);
    setSelectedStatus(proposal.status);
    setSelectedHasOpenMarginOverrideWindow(proposal.hasOpenMarginOverrideWindow);
    setSelectedIsPendingOverrideTarget(proposal.isPendingOverrideTarget);
    setItems((current) =>
      current.map((item) =>
        item.proposalId === proposalId
          ? { ...item, marginEvaluation: proposal.marginEvaluation, status: proposal.status }
          : item,
      ),
    );
  }

  // Override de margen: unicamente Owner/Superadmin, y solo cuando la
  // propuesta esta bloqueada por politica de margen. Motivo obligatorio.
  // mode "direct": ejecuta de inmediato (B1). mode "grant": habilita una
  // ventana de un solo uso para que el vendedor dueño de la propuesta la
  // ejecute el mismo (B2) -- el targetUserId real lo deriva el servidor,
  // aqui solo se manda un valor no vacio para senializar el modo.
  async function handleMarginOverride(mode: "direct" | "grant") {
    if (!selectedProposal) {
      return;
    }

    const reason = overrideReason.trim();

    if (!reason) {
      setOverrideStatus("error");
      setOverrideMessage("El motivo es obligatorio.");
      return;
    }

    setOverrideStatus("pending");
    setOverrideMessage(null);

    try {
      const response = await fetch(`/api/proposals/${selectedProposal.proposalId}/override`, {
        body: JSON.stringify({
          reason,
          ...(mode === "grant" ? { targetUserId: "auto" } : {}),
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      const data = (await response.json().catch(() => null)) as
        | { error?: string; proposal?: MarginOverrideResponseProposal }
        | null;

      if (!response.ok) {
        throw new Error(data?.error ?? "No fue posible ejecutar el override");
      }

      if (data?.proposal) {
        syncMarginOverrideProposal(data.proposal, selectedProposal.proposalId);
      }

      setOverrideStatus("success");
      setOverrideReason("");
      setOverrideMessage(
        mode === "grant"
          ? "Ventana habilitada para el vendedor de esta propuesta."
          : "Override ejecutado. La propuesta quedo aprobada.",
      );
    } catch (error) {
      setOverrideStatus("error");
      setOverrideMessage(error instanceof Error ? error.message : "Error interno al ejecutar el override");
    }
  }

  // Lo dispara el vendedor cuando tiene una ventana de override habilitada
  // para el mismo (isPendingOverrideTarget). Sin motivo: el motivo ya lo
  // documento quien habilito la ventana, se recupera server-side.
  async function handleExecuteOverride() {
    if (!selectedProposal) {
      return;
    }

    setExecuteOverrideStatus("pending");
    setExecuteOverrideMessage(null);

    try {
      const response = await fetch(`/api/proposals/${selectedProposal.proposalId}/override/execute`, {
        method: "POST",
      });

      const data = (await response.json().catch(() => null)) as
        | { error?: string; proposal?: MarginOverrideResponseProposal }
        | null;

      if (!response.ok) {
        throw new Error(data?.error ?? "No fue posible ejecutar el override");
      }

      if (data?.proposal) {
        syncMarginOverrideProposal(data.proposal, selectedProposal.proposalId);
      }

      setExecuteOverrideStatus("success");
      setExecuteOverrideMessage("Override ejecutado. La propuesta quedo aprobada.");
    } catch (error) {
      setExecuteOverrideStatus("error");
      setExecuteOverrideMessage(error instanceof Error ? error.message : "Error interno al ejecutar el override");
    }
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-2 border-b border-zinc-200 pb-4">
        <p className="text-sm uppercase tracking-[0.18em] text-zinc-500">Tenant activo</p>
        <h1 className="text-2xl font-semibold text-zinc-900">Propuestas de {tenantName}</h1>
      </div>
      <p className="mt-2 text-zinc-600">
        Gestiona estado y condiciones comerciales por propuesta con aislamiento estricto por
        tenant.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <div className="overflow-hidden rounded-xl border border-zinc-200">
          <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-3">
            <p className="shrink-0 text-xs uppercase tracking-[0.18em] text-zinc-500">Filtro</p>
            {STATUS_FILTERS.map((sf) => {
              const count =
                sf.value === "all"
                  ? items.length
                  : sf.value === "blocked_margin"
                    ? blockedCount
                    : items.filter((item) => item.status === sf.value).length;
              const isActive = listFilter === sf.value;

              return (
                <button
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                    isActive
                      ? sf.value === "all"
                        ? "border-zinc-900 bg-zinc-900 text-white"
                        : sf.value === "blocked_margin"
                          ? "border-rose-700 bg-rose-700 text-white"
                          : sf.value === "approved"
                            ? "border-emerald-700 bg-emerald-700 text-white"
                            : sf.value === "in_review"
                              ? "border-amber-600 bg-amber-600 text-white"
                              : sf.value === "sent"
                                ? "border-blue-600 bg-blue-600 text-white"
                                : "border-zinc-600 bg-zinc-600 text-white"
                      : sf.className
                  }`}
                  key={sf.value}
                  onClick={() => handleListFilterChange(sf.value)}
                  type="button"
                >
                  {sf.label} ({count})
                </button>
              );
            })}
          </div>
          <div className="border-b border-zinc-200 bg-white px-4 py-2">
            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              <input
                className="w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm text-zinc-800 placeholder:text-zinc-400"
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Buscar por folio, cliente, asunto o vendedor..."
                type="search"
                value={searchQuery}
              />
              <select
                className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-800 md:w-56"
                onChange={(event) => setSortBy(event.target.value as ProposalSort)}
                value={sortBy}
              >
                <option value="date_desc">Mas recientes</option>
                <option value="date_asc">Mas antiguas</option>
                <option value="client_asc">Cliente A-Z</option>
                <option value="status_asc">Estado A-Z</option>
              </select>
            </div>
          </div>
          <div className="max-h-[60vh] overflow-auto">
            <table className="min-w-[760px] divide-y divide-zinc-200 text-sm">
              <thead className="sticky top-0 z-10 bg-zinc-50 text-left text-zinc-600">
              <tr>
                <th className="px-4 py-3 font-medium">Propuesta</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 bg-white">
              {filteredItems.map((item) => {
                const finalAuthorizationBadge = getFinalAuthorizationBadge(item);
                const marginBlocked = isMarginBlocked(item);

                return (
                  <tr
                    className={
                      selectedProposalId === item.proposalId ? "bg-emerald-50/60" : "hover:bg-zinc-50"
                    }
                    key={item.proposalId}
                    onClick={() => handleSelectProposal(item.proposalId)}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-zinc-700">
                      {item.formal?.proposalNumber ?? item.proposalId}
                    </td>
                    <td className="px-4 py-3 text-zinc-900">
                      {item.formal?.recipientCompany ?? "Sin cliente"}
                    </td>
                    <td className="px-4 py-3 text-zinc-600">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span>{formatStatus(item.status)}</span>
                          {finalAuthorizationBadge ? (
                            <span
                              className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${finalAuthorizationBadge.className}`}
                            >
                              {finalAuthorizationBadge.label}
                            </span>
                          ) : null}
                        </div>
                        {marginBlocked ? (
                          <span className="w-fit rounded-full border border-rose-300 bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-700">
                            Bloqueada por margen
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-zinc-500">
                      {formatDate(item.formal?.issuedDate ?? null)}
                    </td>
                  </tr>
                );
              })}
              {filteredItems.length === 0 ? (
                <tr>
                  <td className="px-4 py-4 text-sm text-zinc-500" colSpan={4}>
                    No hay propuestas para el filtro seleccionado.
                  </td>
                </tr>
              ) : null}
            </tbody>
            </table>
          </div>
        </div>

        <article className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
          {selectedProposal ? (
            <div className="space-y-4">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Propuesta activa</p>
                <h2 className="mt-1 text-lg font-semibold text-zinc-900">
                  {selectedProposal.formal?.proposalNumber ?? selectedProposal.proposalId}
                </h2>
              </div>

              {/* Stepper de flujo */}
              <div className="flex items-center gap-0 rounded-lg border border-zinc-200 bg-white overflow-hidden text-xs font-medium">
                {([
                  { step: 1, label: "1. Llenar datos", statuses: ["draft"] as ProposalStatus[] },
                  { step: 2, label: "2. Enviar / Revisión", statuses: ["sent", "in_review"] as ProposalStatus[] },
                  { step: 3, label: "3. Aprobación final", statuses: ["approved", "rejected", "expired"] as ProposalStatus[] },
                ] as const).map(({ step, label, statuses }) => {
                  const isCurrent = statuses.includes(selectedStatus);
                  const isDone =
                    (step === 1 && ["sent", "in_review", "approved", "rejected", "expired"].includes(selectedStatus)) ||
                    (step === 2 && ["approved", "rejected", "expired"].includes(selectedStatus));
                  return (
                    <div
                      className={`flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 border-r last:border-r-0 border-zinc-200 ${
                        isCurrent
                          ? "bg-zinc-900 text-white"
                          : isDone
                            ? "bg-emerald-50 text-emerald-700"
                            : "text-zinc-400"
                      }`}
                      key={step}
                    >
                      {isDone ? <span>✓</span> : <span className="opacity-70">{step}.</span>}
                      <span>{label.replace(/^\d+\.\s/, "")}</span>
                    </div>
                  );
                })}
              </div>

              <label className="block text-sm font-medium text-zinc-700" htmlFor="issuer-company">
                Empresa emisora (fijo por tenant)
              </label>
              <input
                className="w-full rounded-lg border border-zinc-200 bg-zinc-100 px-3 py-2 text-sm text-zinc-700"
                disabled
                id="issuer-company"
                value={issuerCompany}
              />

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-zinc-700" htmlFor="issuer-contact-name">
                    Contacto emisor (fijo por vendedor)
                  </label>
                  <input
                    className="w-full rounded-lg border border-zinc-200 bg-zinc-100 px-3 py-2 text-sm text-zinc-700"
                    disabled
                    id="issuer-contact-name"
                    value={salesOwner || selectedProposal.formal?.issuerContactName || "Sin asignar"}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700" htmlFor="issuer-phone">
                    Telefono emisor
                  </label>
                  <input
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800"
                    id="issuer-phone"
                    onChange={(event) => setIssuerPhone(event.target.value)}
                    placeholder="Telefono emisor"
                    value={issuerPhone}
                  />
                </div>
              </div>

              <label className="block text-sm font-medium text-zinc-700" htmlFor="issuer-email">
                Email emisor (fijo por usuario)
              </label>
              <input
                className="w-full rounded-lg border border-zinc-200 bg-zinc-100 px-3 py-2 text-sm text-zinc-700"
                disabled
                id="issuer-email"
                value={issuerEmail}
              />

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-zinc-700" htmlFor="proposal-currency">
                    Moneda
                  </label>
                  <select
                    className={`w-full rounded-lg border px-3 py-2 text-sm ${
                      currency ? "border-zinc-300 bg-white text-zinc-800" : "border-rose-400 bg-rose-50 text-rose-700"
                    }`}
                    id="proposal-currency"
                    onChange={(event) => setCurrency(event.target.value)}
                    value={currency}
                  >
                    <option value="">Selecciona una moneda...</option>
                    <option value="MXN">MXN — Peso mexicano</option>
                    <option value="USD">USD — Dólar estadounidense</option>
                  </select>
                  {!currency ? (
                    <p className="mt-1 text-xs text-rose-600">
                      Sin elegir todavía — se preguntará al descargar o enviar el documento.
                    </p>
                  ) : null}
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700" htmlFor="proposal-valid-until">
                    Vigencia (válido hasta)
                  </label>
                  <input
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800"
                    id="proposal-valid-until"
                    onChange={(event) => setValidUntil(event.target.value)}
                    type="date"
                    value={validUntil}
                  />
                </div>
              </div>

              <label className="block text-sm font-medium text-zinc-700" htmlFor="sales-owner">
                Vendedor (tenant)
              </label>
              <input
                className="w-full rounded-lg border border-zinc-200 bg-zinc-100 px-3 py-2 text-sm text-zinc-700"
                disabled
                id="sales-owner"
                value={salesOwner || "Sin asignar"}
              />

              <label className="block text-sm font-medium text-zinc-700" htmlFor="recipient-company">
                Empresa receptora
              </label>
              <input
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500"
                disabled={!canEditContent}
                id="recipient-company"
                onChange={(event) => setRecipientCompany(event.target.value)}
                placeholder="Nombre de empresa cliente"
                value={recipientCompany}
              />

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-zinc-700" htmlFor="recipient-contact-name">
                    Contacto receptor
                  </label>
                  <input
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800"
                    id="recipient-contact-name"
                    onChange={(event) => setRecipientContactName(event.target.value)}
                    placeholder="Nombre contacto receptor"
                    value={recipientContactName}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700" htmlFor="recipient-contact-title">
                    Cargo receptor
                  </label>
                  <input
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800"
                    id="recipient-contact-title"
                    onChange={(event) => setRecipientContactTitle(event.target.value)}
                    placeholder="Cargo o area del contacto"
                    value={recipientContactTitle}
                  />
                </div>
              </div>

              <label className="block text-sm font-medium text-zinc-700" htmlFor="recipient-email">
                Email receptor
              </label>
              <input
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800"
                id="recipient-email"
                onChange={(event) => setRecipientEmail(event.target.value)}
                placeholder="contacto@cliente.com"
                value={recipientEmail}
              />

              <label className="block text-sm font-medium text-zinc-700" htmlFor="proposal-subject">
                Asunto
              </label>
              <input
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500"
                disabled={!canEditContent}
                id="proposal-subject"
                onChange={(event) => setSubject(event.target.value)}
                placeholder="Asunto de la propuesta"
                value={subject}
              />

              <div className="rounded-lg border border-zinc-200 bg-white p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Partidas de la propuesta</p>
                  <button
                    className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={!canEditContent}
                    onClick={addProposalItem}
                    type="button"
                  >
                    + Partida
                  </button>
                </div>
                {loadingDetail ? <p className="text-sm text-zinc-500">Cargando partidas...</p> : null}
                <div className="max-h-72 overflow-auto">
                  <table className="min-w-full divide-y divide-zinc-200 text-sm">
                    <thead className="bg-zinc-50 text-left text-zinc-600">
                      <tr>
                        <th className="px-2 py-2 font-medium">#</th>
                        <th className="px-2 py-2 font-medium">SKU</th>
                        <th className="px-2 py-2 font-medium">Descripcion</th>
                        <th className="px-2 py-2 font-medium">Cantidad</th>
                        <th className="px-2 py-2 font-medium">Costo</th>
                        <th className="px-2 py-2 font-medium">Precio</th>
                        <th className="px-2 py-2 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {proposalItems.map((item, index) => (
                        <tr key={`${item.itemNumber}-${index}`}>
                          <td className="px-2 py-2 text-zinc-800 font-medium">{index + 1}</td>
                          <td className="px-2 py-2">
                            <input
                              className="w-28 rounded border border-zinc-300 px-2 py-1 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500"
                              disabled={!canEditContent}
                              onChange={(event) => updateProposalItem(index, "sku", event.target.value)}
                              value={item.sku}
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              className="w-56 rounded border border-zinc-300 px-2 py-1 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500"
                              disabled={!canEditContent}
                              onChange={(event) =>
                                updateProposalItem(index, "description", event.target.value)
                              }
                              value={item.description}
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              className="w-20 rounded border border-zinc-300 px-2 py-1 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500"
                              disabled={!canEditContent}
                              min={0}
                              onChange={(event) => updateProposalItem(index, "quantity", event.target.value)}
                              step={1}
                              type="number"
                              value={item.quantity}
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              className="w-24 rounded border border-zinc-300 px-2 py-1 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500"
                              disabled={!canEditContent}
                              min={0}
                              onChange={(event) => updateProposalItem(index, "costUnit", event.target.value)}
                              step={0.01}
                              type="number"
                              value={item.costUnit}
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              className="w-24 rounded border border-zinc-300 px-2 py-1 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500"
                              disabled={!canEditContent}
                              min={0}
                              onChange={(event) => updateProposalItem(index, "priceUnit", event.target.value)}
                              step={0.01}
                              type="number"
                              value={item.priceUnit}
                            />
                          </td>
                          <td className="px-2 py-2">
                            <button
                              className="rounded border border-rose-300 px-2 py-1 text-xs text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={!canEditContent}
                              onClick={() => removeProposalItem(index)}
                              type="button"
                            >
                              Eliminar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <label className="block text-sm font-medium text-zinc-700" htmlFor="proposal-terms">
                Condiciones comerciales
              </label>
              <textarea
                className="min-h-56 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800"
                id="proposal-terms"
                onChange={(event) => setTermsAndConditions(event.target.value)}
                placeholder="Plazos, alcances, exclusiones y notas legales"
                value={termsAndConditions}
              />

              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-400"
                    disabled={saveStatus === "saving" || loadingDetail}
                    onClick={() => { void handleSave(); }}
                    type="button"
                  >
                    {saveStatus === "saving" ? "Guardando..." : "Guardar cambios"}
                  </button>
                  {!canEditContent ? (
                    <button
                      className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={saveStatus === "saving" || loadingDetail}
                      onClick={() => { void handleSave("draft"); }}
                      title="El contenido (partidas, empresa receptora, asunto) solo se edita en borrador."
                      type="button"
                    >
                      Reabrir a borrador
                    </button>
                  ) : null}
                  <span className="text-xs text-zinc-500">Guardar recalcula margen y puede quitar el bloqueo.</span>
                  <button
                    className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={loadingDetail || issuanceGate.kind === "blocked"}
                    onClick={() => {
                      ensureCurrencyThenRun(() => {
                        window.open(`/api/proposals/${selectedProposal.proposalId}/pdf`, "_blank");
                      });
                    }}
                    title={issuanceGate.kind === "blocked" ? issuanceGate.reason : undefined}
                    type="button"
                  >
                    Descargar PDF
                  </button>
                  {issuanceGate.kind === "blocked" ? (
                    <span
                      className="cursor-not-allowed rounded-lg border border-zinc-200 bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-400"
                      title={issuanceGate.reason}
                    >
                      Descargar Excel
                    </span>
                  ) : (
                    <button
                      className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
                      onClick={() => {
                        ensureCurrencyThenRun(() => {
                          window.open(`/api/proposals/${selectedProposal.proposalId}/xlsx`, "_blank");
                        });
                      }}
                      type="button"
                    >
                      Descargar Excel
                    </button>
                  )}
                </div>
                {saveStatus === "success" ? (
                  <p className="text-sm text-emerald-700">Cambios guardados correctamente.</p>
                ) : null}
                {saveStatus === "error" ? (
                  <p className="text-sm text-rose-700">{errorMessage ?? "Error desconocido"}</p>
                ) : null}
              </div>

              {/* Punto unico de autoridad para propuestas bloqueadas por politica de
                  margen -- visible solo a Owner/Superadmin. Bloqueo total reutiliza
                  el mismo mecanismo que "Rechazar" en Aprobaciones formales (mismo
                  motivo compartido); Override tiene las dos sub-opciones B1/B2. */}
              {!marginAllowsFinalAuthorization && canForceIssuance ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
                  <p className="font-semibold">Propuesta bloqueada por politica de margen.</p>
                  <p className="mt-1 text-xs leading-5 text-amber-800">
                    {selectedProposal.marginEvaluation?.summary}
                  </p>

                  {selectedHasOpenMarginOverrideWindow ? (
                    <p className="mt-2 text-xs font-medium text-amber-800">
                      Ya hay una ventana de override pendiente de consumir para esta propuesta.
                    </p>
                  ) : (
                    <div className="mt-3 grid gap-2">
                      <input
                        className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm text-zinc-800"
                        onChange={(event) => setOverrideReason(event.target.value)}
                        placeholder="Motivo (obligatorio)"
                        value={overrideReason}
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={approvalPending || !overrideReason.trim()}
                          onClick={() => {
                            setApprovalReason(overrideReason);
                            void handleApprovalDecision("rejected");
                          }}
                          type="button"
                        >
                          Bloqueo total (rechazar)
                        </button>
                        <button
                          className="rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={overrideStatus === "pending"}
                          onClick={() => { void handleMarginOverride("direct"); }}
                          type="button"
                        >
                          {overrideStatus === "pending" ? "Ejecutando..." : "Forzar override ahora"}
                        </button>
                        <button
                          className="rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={overrideStatus === "pending"}
                          onClick={() => { void handleMarginOverride("grant"); }}
                          type="button"
                        >
                          Habilitar para el vendedor
                        </button>
                      </div>
                    </div>
                  )}

                  {overrideMessage ? (
                    <p
                      className={`mt-2 text-xs font-medium ${
                        overrideStatus === "error" ? "text-rose-700" : "text-emerald-700"
                      }`}
                    >
                      {overrideMessage}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {/* Vista del vendedor: aparece solo si el/la Owner/Superadmin le habilito
                  una ventana de override especificamente a el/ella para esta propuesta.
                  Desaparece en cuanto se consume o se cierra (isPendingOverrideTarget
                  vuelve a false). */}
              {selectedIsPendingOverrideTarget ? (
                <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-3 text-sm text-sky-900">
                  <p className="font-semibold">Tienes una ventana de override habilitada.</p>
                  <p className="mt-1 text-xs leading-5 text-sky-800">
                    Un Owner o Superadmin te autorizo a forzar esta propuesta pese al margen fuera de
                    politica. Es de un solo uso.
                  </p>
                  <button
                    className="mt-2 rounded-lg border border-sky-400 bg-white px-3 py-1.5 text-xs font-semibold text-sky-800 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={executeOverrideStatus === "pending"}
                    onClick={() => { void handleExecuteOverride(); }}
                    type="button"
                  >
                    {executeOverrideStatus === "pending" ? "Ejecutando..." : "Ejecutar override"}
                  </button>
                  {executeOverrideMessage ? (
                    <p
                      className={`mt-2 text-xs font-medium ${
                        executeOverrideStatus === "error" ? "text-rose-700" : "text-emerald-700"
                      }`}
                    >
                      {executeOverrideMessage}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {/* Sección de envío a aprobación: visible solo cuando la propuesta está en borrador.
                  El mensaje y la acción del botón cambian según si el margen pre-aprueba o no:
                  - marginAllowsFinalAuthorization: dentro de parámetros → aprueba automáticamente.
                  - Sin pre-aprobación: envía al owner con estado "Enviada" para su decisión. */}
              {selectedStatus === "draft" ? (
                <div
                  className={`rounded-lg border p-3 ${
                    marginAllowsFinalAuthorization
                      ? "border-emerald-200 bg-emerald-50"
                      : "border-amber-200 bg-amber-50"
                  }`}
                >
                  <p
                    className={`text-sm font-medium ${
                      marginAllowsFinalAuthorization ? "text-emerald-800" : "text-amber-800"
                    }`}
                  >
                    {marginAllowsFinalAuthorization
                      ? "Dentro de parámetros — esta propuesta se aprobará automáticamente al enviar."
                      : "Fuera de parámetros de auto-aprobación — el propietario deberá revisar y decidir."}
                  </p>
                  <button
                    className={`mt-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${
                      marginAllowsFinalAuthorization
                        ? "bg-emerald-700 hover:bg-emerald-600"
                        : "bg-amber-700 hover:bg-amber-600"
                    }`}
                    disabled={saveStatus === "saving" || loadingDetail}
                    onClick={handleSendToApproval}
                    type="button"
                  >
                    {saveStatus === "saving" ? "Procesando..." : "Solicitud de aprobación"}
                  </button>
                </div>
              ) : null}
              {emailMessage ? (
                <p className={`text-sm ${emailStatus === "error" ? "text-rose-700" : "text-emerald-700"}`}>
                  {emailMessage}
                </p>
              ) : null}

              {/* Estado de la propuesta — solo lectura. El sistema gestiona las transiciones.
                  Las únicas actualizaciones manuales permitidas son la decisión del cliente
                  (cuando ya fue enviada) y el bloque de aprobaciones formales del owner. */}
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-medium text-zinc-700">Estado actual:</span>
                <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${getStatusBadgeClass(selectedStatus)}`}>
                  {formatStatus(selectedStatus)}
                </span>
                {selectedProposal.marginEvaluation && !selectedProposal.marginEvaluation.canAuthorizeFinal ? (
                  <span className="inline-flex items-center rounded-full border border-rose-300 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">
                    Bloqueada por margen
                  </span>
                ) : null}
                {selectedProposal.marginEvaluation ? (
                  <span className="inline-flex items-center rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-700">
                    Margen actual {selectedProposal.marginEvaluation.averageMarginPct.toFixed(2)}%
                  </span>
                ) : null}
              </div>

              {selectedProposal.marginEvaluation && !selectedProposal.marginEvaluation.canAuthorizeFinal ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-900">
                  <p className="font-semibold">Esta propuesta sigue bloqueada por margen.</p>
                  <p className="mt-1 text-xs leading-5 text-rose-800">
                    Ajusta costo o precio en las partidas y luego guarda cambios para recalcular el margen.
                  </p>
                  <p className="mt-2 text-xs font-medium text-rose-700">
                    Margen actual {selectedProposal.marginEvaluation.averageMarginPct.toFixed(2)}% · mínimo requerido {selectedProposal.marginEvaluation.minMarginPct.toFixed(2)}% · faltan {(selectedProposal.marginEvaluation.minMarginPct - selectedProposal.marginEvaluation.averageMarginPct).toFixed(2)} puntos.
                  </p>
                </div>
              ) : null}

              {/* Evaluación de margen: informativa, no editable */}
              {selectedProposal?.marginEvaluation && (selectedStatus === "draft" || selectedStatus === "in_review") ? (
                <div
                  className={`rounded-lg border px-3 py-3 text-sm ${getMarginToneClass(selectedProposal.marginEvaluation.releaseMode)}`}
                >
                  <p className="font-semibold">
                    {formatMarginLabel(selectedProposal.marginEvaluation.releaseMode)}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-current/80">
                    {selectedProposal.marginEvaluation.summary}
                  </p>
                  <p className="mt-2 text-xs text-current/70">
                    Min {selectedProposal.marginEvaluation.minMarginPct.toFixed(2)}% · Max {selectedProposal.marginEvaluation.maxMarginPct.toFixed(2)}% · Umbral alto {selectedProposal.marginEvaluation.highPreapprovalMarginPct.toFixed(2)}%
                  </p>
                </div>
              ) : null}

              {/* Botón de correo: disponible cuando la propuesta está aprobada o ya fue enviada (re-envío).
                  El PDF llega al correo del vendedor (sesión activa) + copia al owner del tenant.
                  El primer envío cambia el estado a "Enviada". Re-envíos mantienen el estado. */}
              {selectedStatus === "approved" || selectedStatus === "sent" ? (
                <div className="flex flex-col gap-1">
                  <button
                    className="w-fit rounded-lg border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={emailStatus === "sending" || issuanceGate.kind === "blocked"}
                    onClick={() => { ensureCurrencyThenRun(() => { void handleSendEmailProposal(); }); }}
                    title={issuanceGate.kind === "blocked" ? issuanceGate.reason : undefined}
                    type="button"
                  >
                    {emailStatus === "sending"
                      ? "Enviando..."
                      : selectedStatus === "sent"
                        ? "Re-enviarme el PDF"
                        : "Enviarme el PDF"}
                  </button>
                  <p className="text-xs text-zinc-500">El PDF llega a tu correo. El owner recibe copia.</p>
                </div>
              ) : null}

              {/* Decisión del cliente: una vez que la propuesta fue enviada al cliente (estado "Enviada"),
                  el usuario registra si el cliente la aceptó o rechazó. */}
              {selectedStatus === "sent" ? (
                <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                  <p className="text-sm font-medium text-zinc-700">Registrar decisión del cliente</p>
                  <div className="flex gap-2">
                    <button
                      className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                      disabled={saveStatus === "saving"}
                      onClick={() => handleSave("approved")}
                      type="button"
                    >
                      Cliente aceptó
                    </button>
                    <button
                      className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                      disabled={saveStatus === "saving"}
                      onClick={() => handleSave("rejected")}
                      type="button"
                    >
                      Cliente rechazó
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="rounded-lg border border-zinc-200 bg-white p-3">
                <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Aprobaciones formales</p>
                {selectedStatus === "draft" ? (
                  <p className="mt-2 text-sm text-zinc-500">
                    Envía a solicitud de aprobación para habilitar el proceso de aprobación formal.
                  </p>
                ) : (
                  <>
                    <p className="mt-2 text-sm text-zinc-700">
                      {approvalGate?.canAuthorizeFinal
                        ? "La propuesta cumple aprobaciones requeridas para autorizacion final."
                        : `Roles faltantes: ${formatMissingApprovalRoles(approvalGate?.missingRoles ?? ["owner"])}`}
                    </p>
                    <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto_auto]">
                      <input
                        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800"
                        onChange={(event) => setApprovalReason(event.target.value)}
                        placeholder="Motivo (obligatorio para rechazar)"
                        value={approvalReason}
                      />
                      <button
                        className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                        disabled={approvalPending}
                        onClick={() => handleApprovalDecision("approved")}
                        type="button"
                      >
                        Aprobar
                      </button>
                      <button
                        className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                        disabled={approvalPending}
                        onClick={() => handleApprovalDecision("rejected")}
                        type="button"
                      >
                        Rechazar
                      </button>
                    </div>
                  </>
                )}

                <div className="mt-3 max-h-44 overflow-auto rounded-lg border border-zinc-200">
                  <table className="min-w-full divide-y divide-zinc-200 text-xs">
                    <thead className="bg-zinc-50 text-left text-zinc-600">
                      <tr>
                        <th className="px-3 py-2 font-medium">Fecha</th>
                        <th className="px-3 py-2 font-medium">Rol</th>
                        <th className="px-3 py-2 font-medium">Decision</th>
                        <th className="px-3 py-2 font-medium">Motivo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {approvals.length > 0 ? (
                        approvals.map((row) => (
                          <tr key={row.approvalId}>
                            <td className="px-3 py-2 text-zinc-600">{formatDate(row.createdAt)}</td>
                            <td className="px-3 py-2 text-zinc-700">{formatApprovalRole(row.approverRole)}</td>
                            <td className="px-3 py-2">
                              {row.decision === "overridden" ? (
                                <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                                  Override
                                </span>
                              ) : (
                                <span className="text-zinc-700">{formatApprovalDecision(row.decision)}</span>
                              )}
                              {row.decision === "overridden" &&
                              row.executedByUserId &&
                              row.executedByUserId !== row.approverUserId ? (
                                <span className="mt-1 block text-[10px] text-zinc-500">
                                  Ejecutado por {row.executedByUserId}
                                </span>
                              ) : null}
                            </td>
                            <td className="px-3 py-2 text-zinc-600">{row.reason ?? "-"}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td className="px-3 py-3 text-zinc-500" colSpan={4}>
                            Aun no hay decisiones registradas.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          ) : (
            <p className="text-sm text-zinc-600">No hay propuestas disponibles para este tenant.</p>
          )}
        </article>
      </div>

      {currencyPromptOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-base font-semibold text-zinc-900">¿En qué moneda vas a emitir esta propuesta?</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Esta propuesta todavía no tiene moneda elegida. Se guarda una sola vez; no se vuelve a preguntar salvo
              que la cambies.
            </p>
            <select
              className="mt-4 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
              onChange={(event) => setCurrencyPromptValue(event.target.value)}
              value={currencyPromptValue}
            >
              <option value="MXN">MXN — Peso mexicano</option>
              <option value="USD">USD — Dólar estadounidense</option>
            </select>
            <div className="mt-5 flex justify-end gap-2">
              <button
                className="rounded-lg bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-200"
                onClick={cancelCurrencyPrompt}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-60"
                disabled={currencyPromptSaving}
                onClick={() => { void confirmCurrencyPrompt(); }}
                type="button"
              >
                {currencyPromptSaving ? "Guardando..." : "Continuar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
