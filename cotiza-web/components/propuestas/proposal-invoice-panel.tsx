"use client";

import { useEffect, useState } from "react";

const PAYMENT_FORM_OPTIONS = [
  { label: "01 - Efectivo", value: "01" },
  { label: "02 - Cheque nominativo", value: "02" },
  { label: "03 - Transferencia electrónica", value: "03" },
  { label: "04 - Tarjeta de crédito", value: "04" },
  { label: "28 - Tarjeta de débito", value: "28" },
  { label: "99 - Por definir", value: "99" },
];

type InvoiceStatus = {
  draftId: string | null;
  stampedAt: string | null;
  status: "draft" | "stamped" | "rejected" | null;
  uuid: string | null;
};

type ClientFiscalData = {
  cfdiUse: string | null;
  clientId: string;
  company: string;
  fiscalRegime: string | null;
  rfc: string | null;
  zipCode: string | null;
};

type FormState = {
  customerName: string;
  customerRegimen: string;
  customerRfc: string;
  customerUseCfdi: string;
  customerZip: string;
  paymentForm: string;
  paymentMethod: "PUE" | "PPD";
  saveToClient: boolean;
};

const EMPTY_FORM: FormState = {
  customerName: "",
  customerRegimen: "",
  customerRfc: "",
  customerUseCfdi: "G03",
  customerZip: "",
  paymentForm: "03",
  paymentMethod: "PUE",
  saveToClient: true,
};

type ProposalInvoicePanelProps = {
  proposalId: string;
  recipientCompany: string | null;
};

export function ProposalInvoicePanel({ proposalId, recipientCompany }: ProposalInvoicePanelProps) {
  const [loading, setLoading] = useState(true);
  const [invoice, setInvoice] = useState<InvoiceStatus | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [generating, setGenerating] = useState(false);
  const [stamping, setStamping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/proposals/${proposalId}/invoice`);
        const data = (await res.json()) as {
          clientFiscalData?: ClientFiscalData | null;
          error?: string;
          invoice?: InvoiceStatus;
        };

        if (cancelled) return;

        if (!res.ok) {
          setError(data.error ?? "No se pudo cargar el estatus de facturación");
          return;
        }

        if (data.invoice) {
          setInvoice(data.invoice);
        }

        if (data.clientFiscalData) {
          setForm((prev) => ({
            ...prev,
            customerName: data.clientFiscalData?.company ?? recipientCompany ?? prev.customerName,
            customerRegimen: data.clientFiscalData?.fiscalRegime ?? prev.customerRegimen,
            customerRfc: data.clientFiscalData?.rfc ?? prev.customerRfc,
            customerUseCfdi: data.clientFiscalData?.cfdiUse ?? prev.customerUseCfdi,
            customerZip: data.clientFiscalData?.zipCode ?? prev.customerZip,
          }));
        } else if (recipientCompany) {
          setForm((prev) => ({ ...prev, customerName: recipientCompany }));
        }
      } catch {
        if (!cancelled) setError("Error de red al consultar el estatus de facturación");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [proposalId, recipientCompany]);

  function setField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleGenerateDraft() {
    setGenerating(true);
    setError(null);
    setMissingFields([]);

    try {
      const res = await fetch(`/api/proposals/${proposalId}/invoice`, {
        body: JSON.stringify(form),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      const data = (await res.json()) as {
        draft?: { id: string; missingFields: string[] };
        error?: string;
      };

      if (!res.ok) {
        throw new Error(data.error ?? "No se pudo generar la prefactura");
      }

      if (data.draft) {
        setInvoice({
          draftId: data.draft.id,
          stampedAt: null,
          status: "draft",
          uuid: null,
        });
        setMissingFields(data.draft.missingFields ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setGenerating(false);
    }
  }

  async function handleStamp() {
    const confirmed = window.confirm(
      "Esto genera un CFDI real ante el SAT y NO se puede deshacer. ¿Confirmas que quieres timbrar esta factura?",
    );
    if (!confirmed) return;

    setStamping(true);
    setError(null);

    try {
      const res = await fetch(`/api/proposals/${proposalId}/invoice/stamp`, { method: "POST" });
      const data = (await res.json()) as { error?: string; ok?: boolean; uuid?: string | null };

      if (!res.ok) {
        throw new Error(data.error ?? "No se pudo timbrar la factura");
      }

      setInvoice((prev) => ({
        draftId: prev?.draftId ?? null,
        stampedAt: new Date().toISOString(),
        status: data.ok ? "stamped" : "rejected",
        uuid: data.uuid ?? null,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setStamping(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-zinc-200 p-4">
        <p className="text-sm text-zinc-500">Cargando facturación...</p>
      </div>
    );
  }

  if (invoice?.status === "stamped") {
    return (
      <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4">
        <p className="text-sm font-semibold text-emerald-900">Factura timbrada</p>
        <p className="mt-1 text-sm text-emerald-800">UUID: {invoice.uuid ?? "N/D"}</p>
        <a
          className="mt-2 inline-block rounded-lg border border-emerald-400 bg-white px-3 py-1.5 text-xs font-medium text-emerald-800 transition hover:bg-emerald-100"
          href={`/api/proposals/${proposalId}/invoice/pdf`}
          rel="noreferrer"
          target="_blank"
        >
          Descargar PDF
        </a>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-200 p-4">
      <p className="text-sm font-semibold text-zinc-900">Facturación (CFDI)</p>
      <p className="mt-1 text-xs text-zinc-500">
        Datos del receptor para timbrar. Se prellenan si ya están capturados en el cliente.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-zinc-700">
          Razón social del receptor
          <input
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
            onChange={(e) => setField("customerName", e.target.value)}
            value={form.customerName}
          />
        </label>
        <label className="text-xs font-medium text-zinc-700">
          RFC del receptor
          <input
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
            onChange={(e) => setField("customerRfc", e.target.value.toUpperCase())}
            value={form.customerRfc}
          />
        </label>
        <label className="text-xs font-medium text-zinc-700">
          Régimen fiscal
          <input
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
            onChange={(e) => setField("customerRegimen", e.target.value)}
            placeholder="Ej. 601"
            value={form.customerRegimen}
          />
        </label>
        <label className="text-xs font-medium text-zinc-700">
          Código postal
          <input
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
            onChange={(e) => setField("customerZip", e.target.value)}
            value={form.customerZip}
          />
        </label>
        <label className="text-xs font-medium text-zinc-700">
          Uso CFDI
          <input
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
            onChange={(e) => setField("customerUseCfdi", e.target.value)}
            placeholder="Ej. G03"
            value={form.customerUseCfdi}
          />
        </label>
        <label className="text-xs font-medium text-zinc-700">
          Método de pago
          <select
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
            onChange={(e) => setField("paymentMethod", e.target.value as "PUE" | "PPD")}
            value={form.paymentMethod}
          >
            <option value="PUE">PUE - Pago en una sola exhibición</option>
            <option value="PPD">PPD - Pago en parcialidades o diferido</option>
          </select>
        </label>
        <label className="text-xs font-medium text-zinc-700">
          Forma de pago
          <select
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
            onChange={(e) => setField("paymentForm", e.target.value)}
            value={form.paymentForm}
          >
            {PAYMENT_FORM_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 self-end text-xs font-medium text-zinc-700">
          <input
            checked={form.saveToClient}
            onChange={(e) => setField("saveToClient", e.target.checked)}
            type="checkbox"
          />
          Guardar estos datos en el cliente
        </label>
      </div>

      {missingFields.length > 0 ? (
        <p className="mt-3 text-xs font-medium text-amber-700">
          Faltan datos para timbrar: {missingFields.join(", ")}
        </p>
      ) : null}

      {error ? <p className="mt-3 text-xs font-medium text-rose-700">{error}</p> : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-zinc-700 disabled:opacity-60"
          disabled={generating}
          onClick={() => void handleGenerateDraft()}
          type="button"
        >
          {generating ? "Generando..." : invoice?.draftId ? "Regenerar prefactura" : "Generar prefactura"}
        </button>
        {invoice?.draftId ? (
          <>
            <button
              className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50"
              onClick={() => setShowPreview((prev) => !prev)}
              type="button"
            >
              {showPreview ? "Ocultar vista previa" : "Ver vista previa"}
            </button>
            <button
              className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-800 transition hover:bg-rose-100 disabled:opacity-60"
              disabled={stamping}
              onClick={() => void handleStamp()}
              type="button"
            >
              {stamping ? "Timbrando..." : "Timbrar (irreversible)"}
            </button>
          </>
        ) : null}
      </div>

      {showPreview && invoice?.draftId ? (
        <iframe
          className="mt-4 h-[600px] w-full rounded-lg border border-zinc-200"
          src={`/api/proposals/${proposalId}/invoice/preview`}
          title="Vista previa de la prefactura"
        />
      ) : null}
    </div>
  );
}
