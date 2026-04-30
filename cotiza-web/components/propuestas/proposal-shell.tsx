"use client";

import { useEffect, useMemo, useState } from "react";

import type { ProposalSummary } from "@/lib/db/proposals";
import type { ProposalStatus } from "@/lib/validations/proposals";

type ProposalShellProps = {
  proposals: ProposalSummary[];
  tenantName: string;
};

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

function formatDate(value: string | null): string {
  if (!value) {
    return "N/D";
  }

  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function ProposalShell({ proposals, tenantName }: ProposalShellProps) {
  const [items, setItems] = useState<ProposalSummary[]>(() => proposals);
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(
    proposals[0]?.proposalId ?? null,
  );
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

  const selectedProposal = useMemo(
    () => items.find((item) => item.proposalId === selectedProposalId) ?? null,
    [items, selectedProposalId],
  );

  useEffect(() => {
    if (!selectedProposalId) {
      setProposalItems([]);
      return;
    }

    void loadProposalDetail(selectedProposalId);
  }, [selectedProposalId]);

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

  async function handleSave() {
    if (!selectedProposal) {
      return;
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
          status: selectedStatus,
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

      setSaveStatus("success");
    } catch (error) {
      setSaveStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Error interno");
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
              {items.map((item) => (
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
                  <td className="px-4 py-3 text-zinc-600">{formatStatus(item.status)}</td>
                  <td className="px-4 py-3 text-zinc-500">
                    {formatDate(item.formal?.issuedDate ?? null)}
                  </td>
                </tr>
              ))}
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

              <label className="block text-sm font-medium text-zinc-700" htmlFor="proposal-status">
                Estado
              </label>
              <select
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800"
                id="proposal-status"
                onChange={(event) => setSelectedStatus(event.target.value as ProposalStatus)}
                value={selectedStatus}
              >
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

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
                          <td className="px-2 py-2 text-zinc-500">{index + 1}</td>
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

              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-400"
                    disabled={saveStatus === "saving" || loadingDetail}
                    onClick={handleSave}
                    type="button"
                  >
                    {saveStatus === "saving" ? "Guardando..." : "Guardar cambios"}
                  </button>
                  <a
                    className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
                    href={`/api/proposals/${selectedProposal.proposalId}/pdf`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Descargar PDF
                  </a>
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

              <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-3">
                <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Importar partidas</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    accept=".xlsx"
                    className="block w-full max-w-xs text-sm text-zinc-700"
                    onChange={(event) => setImportFile(event.target.files?.[0] ?? null)}
                    type="file"
                  />
                  <button
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-400"
                    disabled={!importFile || importStatus === "uploading"}
                    onClick={handleImportExcel}
                    type="button"
                  >
                    {importStatus === "uploading" ? "Importando..." : "Importar Excel"}
                  </button>
                </div>
                {importMessage ? (
                  <p
                    className={`mt-2 text-sm ${
                      importStatus === "error" ? "text-rose-700" : "text-emerald-700"
                    }`}
                  >
                    {importMessage}
                  </p>
                ) : null}
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
