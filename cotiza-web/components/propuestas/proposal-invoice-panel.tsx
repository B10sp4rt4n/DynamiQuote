"use client";

import { useEffect, useState } from "react";
import { ProposalPaymentPanel } from "./proposal-payment-panel";

const PAYMENT_FORM_OPTIONS = [
  { label: "01 - Efectivo", value: "01" },
  { label: "02 - Cheque nominativo", value: "02" },
  { label: "03 - Transferencia electrónica", value: "03" },
  { label: "04 - Tarjeta de crédito", value: "04" },
  { label: "28 - Tarjeta de débito", value: "28" },
];

type InvoiceStatus = {
  draftId: string | null;
  stampedAt: string | null;
  status: "draft" | "stamping" | "stamped" | "rejected" | null;
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
  const [ppdEnabled, setPpdEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [invoice, setInvoice] = useState<InvoiceStatus | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [generating, setGenerating] = useState(false);
  const [stamping, setStamping] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [itemsFingerprint, setItemsFingerprint] = useState("");
  const [invoiceCurrency, setInvoiceCurrency] = useState<string | null>(null);
  const [fiscalItems, setFiscalItems] = useState<Array<{ itemNumber: number; description: string; satProductCode: string; unitCode: string }>>([]);
  const [draftDirty, setDraftDirty] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/proposals/${proposalId}/invoice`);
        const data = (await res.json()) as {
          ppdEnabled?: boolean;
          clientFiscalData?: ClientFiscalData | null;
          error?: string;
          invoice?: InvoiceStatus;
          fiscalBasis?: { fingerprint: string; currency: string | null; items: Array<{ itemNumber: number; description: string }> };
        };

        if (cancelled) return;

        if (!res.ok) {
          setError(data.error ?? "No se pudo cargar el estatus de facturación");
          return;
        }

        setPpdEnabled(data.ppdEnabled === true);
        if (data.invoice) {
          setInvoice(data.invoice);
        }
        if (data.fiscalBasis) {
          setItemsFingerprint(data.fiscalBasis.fingerprint);
          setInvoiceCurrency(data.fiscalBasis.currency);
          setFiscalItems(data.fiscalBasis.items.map(item => ({ ...item, satProductCode: "", unitCode: "" })));
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
    setDraftDirty(true);
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleGenerateDraft() {
    setGenerating(true);
    setError(null);
    setMissingFields([]);

    try {
      const res = await fetch(`/api/proposals/${proposalId}/invoice`, {
        body: JSON.stringify({ ...form, itemsFingerprint,
          fiscalItems: fiscalItems.map(({ itemNumber, satProductCode, unitCode }) => ({ itemNumber, satProductCode, unitCode })) }),
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
        setDraftDirty(false);
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
      // Ante fallo de red o respuesta incierta, leer el estado persistido;
      // jamas dejar el boton de timbrar habilitado por un error del cliente.
      try {
        const refreshed = await fetch(`/api/proposals/${proposalId}/invoice`);
        const data = (await refreshed.json()) as { invoice?: InvoiceStatus };
        if (refreshed.ok && data.invoice) {
          setInvoice(data.invoice);
        } else {
          setInvoice((prev) => prev ? { ...prev, status: "stamping" } : prev);
        }
      } catch {
        setInvoice((prev) => prev ? { ...prev, status: "stamping" } : prev);
      }
    } finally {
      setStamping(false);
    }
  }

  async function handleReconcile() {
    setReconciling(true);
    setError(null);
    try {
      const response = await fetch(`/api/proposals/${proposalId}/invoice/reconcile`, { method: "POST" });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "No se pudo confirmar el estado del CFDI");
      }
      const refreshed = await fetch(`/api/proposals/${proposalId}/invoice`);
      const current = (await refreshed.json()) as { invoice?: InvoiceStatus };
      if (refreshed.ok && current.invoice) {
        setInvoice(current.invoice);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Resultado aún no confirmado");
    } finally {
      setReconciling(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-zinc-200 p-4">
        <p className="text-sm text-zinc-500">Cargando facturación...</p>
      </div>
    );
  }

  if (invoice?.status === "stamping") {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
        <p className="text-sm font-semibold text-amber-900">Timbrado pendiente de confirmación</p>
        <p className="mt-2 text-sm text-amber-800">
          El PAC pudo haber emitido un CFDI. No vuelvas a timbrar ni generes otra prefactura
          hasta confirmar el resultado con Digestor Fiscal.
        </p>
        {error ? <p className="mt-2 text-xs font-medium text-rose-700">{error}</p> : null}
        <button
          className="mt-3 rounded-lg border border-amber-400 bg-white px-3 py-2 text-sm font-medium text-amber-900 disabled:opacity-60"
          disabled={reconciling}
          onClick={() => void handleReconcile()}
          type="button"
        >
          {reconciling ? "Consultando..." : "Consultar estado (sin timbrar)"}
        </button>
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
        {ppdEnabled ? <ProposalPaymentPanel proposalId={proposalId} /> : null}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-200 p-4">
      <p className="text-sm font-semibold text-zinc-900">Facturación (CFDI)</p>
      <p className="mt-1 text-xs text-zinc-500">
        Datos del receptor para timbrar. Se prellenan si ya están capturados en el cliente.
      </p>
      <p className="mt-2 text-xs text-zinc-600">Factura nacional en MXN e IVA 16%. Revisa la clasificación fiscal de cada partida. PPD solo se habilita para pruebas del ciclo de pagos.</p>
      {invoiceCurrency !== "MXN" ? <p className="mt-2 text-xs text-amber-800">La moneda de esta propuesta aún no está habilitada para facturación. No se convertirá automáticamente.</p> : null}

      <fieldset disabled={generating || stamping}>
      <legend className="sr-only">Datos fiscales y clasificación de partidas</legend>
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
            onChange={event => {
              const method = event.target.value === "PPD" ? "PPD" : "PUE";
              setDraftDirty(true); setForm(previous => ({ ...previous, paymentMethod: method, paymentForm: method === "PPD" ? "99" : "03" }));
            }}
            value={form.paymentMethod}
          >
            <option value="PUE">PUE - Pago en una sola exhibición</option>
            {ppdEnabled ? <option value="PPD">PPD - Parcialidades o diferido (pruebas)</option> : null}
          </select>
        </label>
        <label className="text-xs font-medium text-zinc-700">
          Forma de pago
          <select
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
            disabled={form.paymentMethod === "PPD"}
            onChange={(e) => setField("paymentForm", e.target.value)}
            value={form.paymentForm}
          >
            {form.paymentMethod === "PPD" ? <option value="99">99 - Por definir</option> : null}
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

      <div className="mt-4 space-y-3">
        {fiscalItems.map((item, index) => (
          <div key={item.itemNumber} className="rounded-lg border border-zinc-200 p-3">
            <p className="text-xs font-medium text-zinc-800">{item.itemNumber}. {item.description}</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className="text-xs text-zinc-700">Clave SAT del producto o servicio
                <input className="mt-1 w-full rounded border border-zinc-300 p-2" inputMode="numeric" maxLength={8}
                  value={item.satProductCode} onChange={event => { setDraftDirty(true); setFiscalItems(previous => previous.map((row, i) => i === index ? { ...row, satProductCode: event.target.value } : row)); }} />
              </label>
              <label className="text-xs text-zinc-700">Clave de unidad SAT
                <input className="mt-1 w-full rounded border border-zinc-300 p-2" maxLength={3}
                  value={item.unitCode} onChange={event => { setDraftDirty(true); setFiscalItems(previous => previous.map((row, i) => i === index ? { ...row, unitCode: event.target.value.toUpperCase() } : row)); }} />
              </label>
            </div>
          </div>
        ))}
      </div>
      </fieldset>
      {invoice?.draftId && draftDirty ? <p className="mt-2 text-xs text-amber-800">Revisa los datos y regenera la prefactura para timbrar su versión actualizada.</p> : null}

      {missingFields.length > 0 ? (
        <p className="mt-3 text-xs font-medium text-amber-700">
          Faltan datos para timbrar: {missingFields.join(", ")}
        </p>
      ) : null}

      {error ? <p className="mt-3 text-xs font-medium text-rose-700">{error}</p> : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-zinc-700 disabled:opacity-60"
          disabled={generating || stamping || invoiceCurrency !== "MXN" || !itemsFingerprint}
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
              disabled={stamping || generating || draftDirty || missingFields.length > 0}
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
