"use client";

import { useMemo, useState } from "react";

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
  }).format(new Date(value));
}

export function ProposalShell({ proposals, tenantName }: ProposalShellProps) {
  const [items, setItems] = useState<ProposalSummary[]>(() => proposals);
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(
    proposals[0]?.proposalId ?? null,
  );
  const [selectedStatus, setSelectedStatus] = useState<ProposalStatus>(
    proposals[0]?.status ?? "draft",
  );
  const [termsAndConditions, setTermsAndConditions] = useState<string>(
    proposals[0]?.formal?.termsAndConditions ?? "",
  );
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

  function handleSelectProposal(proposalId: string) {
    const found = items.find((item) => item.proposalId === proposalId);

    setSelectedProposalId(proposalId);
    setSelectedStatus(found?.status ?? "draft");
    setTermsAndConditions(found?.formal?.termsAndConditions ?? "");
    setSaveStatus("idle");
    setErrorMessage(null);
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
          status: selectedStatus,
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
            termsAndConditions: string;
          } | null;
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
                      termsAndConditions:
                        data.proposal?.formal?.termsAndConditions ?? item.formal.termsAndConditions,
                    }
                  : item.formal,
                status: data.proposal?.status ?? item.status,
              }
            : item,
        ),
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
                <p className="text-sm text-zinc-600">
                  {selectedProposal.formal?.subject ?? "Sin asunto"}
                </p>
              </div>

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

              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-400"
                    disabled={saveStatus === "saving"}
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
