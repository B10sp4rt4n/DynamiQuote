"use client";

import { useEffect, useMemo, useState } from "react";
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
import type { ProposalStatus } from "@/lib/validations/proposals";

type ProposalApprovalRecordView = {
  approvalId: string;
  approverRole: "superadmin" | "owner" | "admin" | "user";
  approverUserId: string;
  createdAt: string;
  decision: "approved" | "rejected";
  proposalId: string;
  reason: string | null;
  tenantId: string;
};

type ProposalApprovalGateView = {
  canAuthorizeFinal: boolean;
  missingRoles: Array<"owner" | "superadmin">;
  observerApproved: boolean;
  ownerApproved: boolean;
};

type ProposalShellProps = {
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
  return value === "approved" ? "Aprobada" : "Rechazada";
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

export function ProposalShell({ proposals, tenantName }: ProposalShellProps) {
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
  const [listFilter, setListFilter] = useState<ProposalListFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<ProposalSort>("date_desc");

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
    const filterFromQuery = searchParams.get("filter") ?? "all";
    const nextFilter = normalizeProposalListFilter(filterFromQuery);

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setListFilter((current) => (current === nextFilter ? current : nextFilter));
  }, [searchParams]);

  useEffect(() => {
    const currentFilterParam = searchParams.get("filter");
    const expectedFilterParam = listFilter === "all" ? null : listFilter;

    if (currentFilterParam === expectedFilterParam) {
      return;
    }

    const nextParams = new URLSearchParams(searchParams.toString());

    if (expectedFilterParam) {
      nextParams.set("filter", expectedFilterParam);
    } else {
      nextParams.delete("filter");
    }

    const nextQuery = nextParams.toString();
    router.replace(nextQuery.length > 0 ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  }, [listFilter, pathname, router, searchParams]);

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

  async function loadProposalDetail(proposalId: string) {
    setLoadingDetail(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/proposals/${proposalId}`, { method: "GET" });
      const data = (await response.json()) as {
        error?: string;
        proposal?: {
          formal: {
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
      setRecipientCompany(data.proposal.formal?.recipientCompany ?? "");
      setRecipientContactName(data.proposal.formal?.recipientContactName ?? "");
      setRecipientEmail(data.proposal.formal?.recipientEmail ?? "");
      setRecipientContactTitle(data.proposal.formal?.recipientContactTitle ?? "");
      setSubject(data.proposal.formal?.subject ?? "");
      setTermsAndConditions(data.proposal.formal?.termsAndConditions ?? "");
      setSelectedStatus(data.proposal.status);
      setSalesOwner(data.proposal.salesOwner ?? data.proposal.formal?.issuerContactName ?? "");
      setApprovals(data.proposal.approvals ?? []);
      setApprovalGate(data.proposal.approvalGate ?? null);
      setProposalItems(
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

    try {
      const response = await fetch(`/api/proposals/${selectedProposal.proposalId}`, {
        body: JSON.stringify({
          issuerCompany,
          issuerEmail,
          issuerPhone,
          items: proposalItems.map((item, index) => ({
            ...item,
            itemNumber: index + 1,
          })),
          recipientCompany,
          recipientContactName,
          recipientContactTitle,
          recipientEmail,
          status: statusToSend,
          subject,
          termsAndConditions,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "PUT",
      });

      const data = (await response.json()) as {
        error?: string;
        proposal?: {
          formal: {
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
      setApprovals(data.proposal.approvals ?? []);
      setApprovalGate(data.proposal.approvalGate ?? null);

      // Sincronizar el dropdown con el estado real confirmado por la API
      // (la API puede ajustar el estado si el workflow lo requiere).
      setSelectedStatus(data.proposal.status);
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

  async function handleSendEmailProposal() {
    if (!selectedProposal || !recipientEmail) {
      setEmailStatus("error");
      setEmailMessage("Falta correo del destinatario");
      return;
    }

    setEmailStatus("sending");
    setEmailMessage(null);

    try {
      const response = await fetch(`/api/proposals/${selectedProposal.proposalId}/send-email`, {
        body: JSON.stringify({
          recipientEmail: recipientEmail.trim(),
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      const data = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(data?.error ?? "No fue posible enviar el correo al cliente");
      }

      // Si la propuesta estaba aprobada, transiciona a "Enviada" para registrar que fue
      // entregada al cliente. Si ya estaba "Enviada", mantiene el estado (re-envío).
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
          ? "Correo re-enviado correctamente al cliente."
          : "Correo enviado correctamente al cliente.",
      );
    } catch (error) {
      setEmailStatus("error");
      setEmailMessage(error instanceof Error ? error.message : "Error interno al enviar correo");
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
                  onClick={() => setListFilter(sf.value)}
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
          <table className="min-w-full divide-y divide-zinc-200 text-sm">
            <thead className="bg-zinc-50 text-left text-zinc-600">
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

              <label className="block text-sm font-medium text-zinc-700" htmlFor="recipient-company">
                Empresa emisora
              </label>
              <input
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800"
                id="issuer-company"
                onChange={(event) => setIssuerCompany(event.target.value)}
                placeholder="Empresa emisora"
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
                Email emisor
              </label>
              <input
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800"
                id="issuer-email"
                onChange={(event) => setIssuerEmail(event.target.value)}
                placeholder="correo@empresa.com"
                value={issuerEmail}
              />

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
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800"
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
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800"
                id="proposal-subject"
                onChange={(event) => setSubject(event.target.value)}
                placeholder="Asunto de la propuesta"
                value={subject}
              />

              <div className="rounded-lg border border-zinc-200 bg-white p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Partidas de la propuesta</p>
                  <button
                    className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
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
                              className="w-28 rounded border border-zinc-300 px-2 py-1"
                              onChange={(event) => updateProposalItem(index, "sku", event.target.value)}
                              value={item.sku}
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              className="w-56 rounded border border-zinc-300 px-2 py-1"
                              onChange={(event) =>
                                updateProposalItem(index, "description", event.target.value)
                              }
                              value={item.description}
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              className="w-20 rounded border border-zinc-300 px-2 py-1"
                              min={0}
                              onChange={(event) => updateProposalItem(index, "quantity", event.target.value)}
                              step={1}
                              type="number"
                              value={item.quantity}
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              className="w-24 rounded border border-zinc-300 px-2 py-1"
                              min={0}
                              onChange={(event) => updateProposalItem(index, "costUnit", event.target.value)}
                              step={0.01}
                              type="number"
                              value={item.costUnit}
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              className="w-24 rounded border border-zinc-300 px-2 py-1"
                              min={0}
                              onChange={(event) => updateProposalItem(index, "priceUnit", event.target.value)}
                              step={0.01}
                              type="number"
                              value={item.priceUnit}
                            />
                          </td>
                          <td className="px-2 py-2">
                            <button
                              className="rounded border border-rose-300 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50"
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
                  <button
                    className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={loadingDetail}
                    onClick={() => {
                      window.open(`/api/proposals/${selectedProposal.proposalId}/pdf`, "_blank");
                    }}
                    type="button"
                  >
                    Descargar PDF
                  </button>
                  <a
                    className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
                    href={`/api/proposals/${selectedProposal.proposalId}/xlsx`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Descargar Excel
                  </a>
                </div>
                {saveStatus === "success" ? (
                  <p className="text-sm text-emerald-700">Cambios guardados correctamente.</p>
                ) : null}
                {saveStatus === "error" ? (
                  <p className="text-sm text-rose-700">{errorMessage ?? "Error desconocido"}</p>
                ) : null}
              </div>

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
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-zinc-700">Estado actual:</span>
                <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${getStatusBadgeClass(selectedStatus)}`}>
                  {formatStatus(selectedStatus)}
                </span>
              </div>

              {/* Evaluación de margen: informativa, no editable */}
              {selectedProposal?.marginEvaluation ? (
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
                  El primer envío cambia el estado a "Enviada". Re-envíos mantienen el estado. */}
              {selectedStatus === "approved" || selectedStatus === "sent" ? (
                <div className="flex flex-col gap-1">
                  <button
                    className="w-fit rounded-lg border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={emailStatus === "sending" || !recipientEmail}
                    onClick={handleSendEmailProposal}
                    title={!recipientEmail ? "Falta correo del destinatario" : ""}
                    type="button"
                  >
                    {emailStatus === "sending"
                      ? "Enviando correo..."
                      : selectedStatus === "sent"
                        ? "Re-enviar propuesta por correo"
                        : "Enviar propuesta por correo"}
                  </button>
                  {!recipientEmail ? (
                    <p className="text-xs text-zinc-500">Agrega el correo del destinatario en los campos de cabecera.</p>
                  ) : null}
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
                            <td className="px-3 py-2 text-zinc-700">{formatApprovalDecision(row.decision)}</td>
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
    </section>
  );
}
