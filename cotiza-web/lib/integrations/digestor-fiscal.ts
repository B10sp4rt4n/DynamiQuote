import "server-only";
import type { CsfReview } from "@/lib/domain/csf-review";
import { readInvoiceStamp } from "@/lib/domain/invoice-stamp";
import { DigestorHttpError } from "./digestor-error";
import { getPrimaryDigestorConfig, getRequestDigestorConfig, getSandboxDigestorConfig,
  isDigestorFiscalSandboxTenant, type DigestorFiscalConfig } from "./digestor-routing";

// Cliente HTTP hacia Digestor Fiscal (repo aparte, B10sp4rt4n/digestor__fiscal).
// Emisor principal y laboratorio opcional tienen destinos, cuentas y tokens
// separados. El tenant de sesión elige el destino; nunca el payload del navegador.
// Nunca se llama desde el cliente: solo desde rutas API server-side.

export function isDigestorFiscalConfigured(): boolean {
  return getPrimaryDigestorConfig() !== null;
}

export type LiveCancellation = {
  status: 'not_requested' | 'processing' | 'unknown' | 'requested' | 'cancelled';
  document_uuid?: string;
  reason: '03';
  checked_at?: string | null;
  acknowledgement_xml: string | null;
  sat_response?: { Estado?: string; EsCancelable?: string; EstatusCancelacion?: string | null } | null;
};

export function liveCancellation(draftId: string, operation: 'read' | 'submit' | 'reconcile', uuid: string): Promise<LiveCancellation> {
  const path = `/v1/billing/drafts/${encodeURIComponent(draftId)}/production-cancellation`;
  if (operation === 'read') return request(path, {method:'GET',cache:'no-store'});
  return request(path+(operation === 'reconcile' ? '/reconcile' : ''), {method:'POST',
    body:operation === 'submit' ? JSON.stringify({confirm:true,expected_uuid:uuid}) : undefined});
}

// Tenant de Cotiza habilitado para facturar -- hoy solo SynAppsSys.
export function isDigestorFiscalEnabledForTenant(tenantId: string): boolean {
  if (isDigestorFiscalSandboxTenant(tenantId)) return getSandboxDigestorConfig() !== null;
  const enabledTenantId = process.env["DIGESTOR_FISCAL_TENANT_ID"];
  return Boolean(enabledTenantId) && enabledTenantId === tenantId && isDigestorFiscalConfigured();
}

type CachedToken = {
  expiresAt: number;
  token: string;
};

const cachedTokens = new Map<string, CachedToken>();

async function verifySandboxProvider(config: DigestorFiscalConfig, token: string): Promise<void> {
  if (config.environment !== "sandbox") return;
  const response = await fetch(`${config.baseUrl}/v1/billing/provider/status?probe=false`, {
    headers: { Authorization: `Bearer ${token}` }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000),
  });
  const status = await response.json().catch(() => null);
  let url: URL;
  try { url = new URL(status?.base_url); } catch { throw new Error("No se pudo confirmar el PAC de pruebas"); }
  if (!response.ok || status?.environment !== "sandbox" || status?.configured !== true || status?.production_configured !== false
      || url.protocol !== "https:" || url.hostname !== "pruebas.timbracfdi33.mx" || !["", "443", "1444"].includes(url.port)
      || url.username || url.password || url.search || url.hash || url.pathname.replace(/\/$/, "") !== "/api/v2") {
    throw new Error("El laboratorio sólo puede utilizar el PAC de pruebas");
  }
}

async function login(config: DigestorFiscalConfig): Promise<string> {
  const key = JSON.stringify([config.environment, config.baseUrl, config.username, config.expectedTenantId]);
  const cachedToken = cachedTokens.get(key);
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    await verifySandboxProvider(config, cachedToken.token);
    return cachedToken.token;
  }

  const response = await fetch(`${config.baseUrl}/auth/login`, {
    body: JSON.stringify({ password: config.password, username: config.username }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`No fue posible autenticar con Digestor Fiscal (HTTP ${response.status}).`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number; tenant_id?: string };
  if (!data.access_token || !Number.isFinite(data.expires_in) || (config.expectedTenantId && data.tenant_id !== config.expectedTenantId)) {
    throw new Error("La cuenta fiscal no corresponde a la empresa de pruebas");
  }
  await verifySandboxProvider(config, data.access_token);
  cachedTokens.set(key, { expiresAt: Date.now() + data.expires_in * 1000, token: data.access_token });
  return data.access_token;
}

function extractErrorMessage(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    const detail = record["detail"];
    if (typeof detail === "string") return detail;
    if (detail && typeof detail === "object") {
      const message = (detail as Record<string, unknown>)["message"];
      if (typeof message === "string") return message;
      return JSON.stringify(detail);
    }
  }
  return `Digestor Fiscal respondio con error (HTTP ${status}).`;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const config = await getRequestDigestorConfig();
  if (!config) {
    throw new Error("Digestor Fiscal no esta configurado (faltan variables de entorno).");
  }

  const token = await login(config);
  const response = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    redirect: "error",
    headers: {
      ...init.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new DigestorHttpError(extractErrorMessage(body, response.status), response.status);
  }

  return body as T;
}

export type DigestorFiscalDraftItem = {
  description: string;
  quantity: number;
  satProductCode: string;
  unitCode: string;
  taxRate?: number;
  unitPrice: number;
};

export type CreateBillingDraftInput = {
  currency: string;
  customerName: string;
  customerRegimen: string;
  customerRfc: string;
  customerUseCfdi: string;
  customerZip: string;
  emitterName: string;
  emitterRegimen: string;
  emitterRfc: string;
  items: DigestorFiscalDraftItem[];
  notes?: string;
  paymentForm: string;
  paymentMethod: string;
  placeOfIssue: string;
};

export type DigestorFiscalDraft = {
  id: string;
  missingFields: string[];
  readyToStamp: boolean;
  stampStatus: string;
  status: string;
  subtotal: number;
  taxes: number;
  total: number;
};

type RawDraft = {
  id: string;
  missing_fields: string[];
  ready_to_stamp: boolean;
  stamp_status: string;
  status: string;
  subtotal: number;
  taxes: number;
  total: number;
};

function mapDraft(raw: RawDraft): DigestorFiscalDraft {
  return {
    id: raw.id,
    missingFields: raw.missing_fields ?? [],
    readyToStamp: raw.ready_to_stamp,
    stampStatus: raw.stamp_status,
    status: raw.status,
    subtotal: raw.subtotal,
    taxes: raw.taxes,
    total: raw.total,
  };
}

export async function createBillingDraft(input: CreateBillingDraftInput): Promise<DigestorFiscalDraft> {
  const raw = await request<RawDraft>("/v1/billing/drafts", {
    body: JSON.stringify({
      currency: input.currency,
      customer_name: input.customerName,
      customer_regimen: input.customerRegimen,
      customer_rfc: input.customerRfc,
      customer_use_cfdi: input.customerUseCfdi,
      customer_zip: input.customerZip,
      emitter_name: input.emitterName,
      emitter_regimen: input.emitterRegimen,
      emitter_rfc: input.emitterRfc,
      items: input.items.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        sat_product_code: item.satProductCode,
        unit_code: item.unitCode,
        tax_object: "02",
        tax_rate: item.taxRate ?? 0.16,
        unit_price: item.unitPrice,
      })),
      notes: input.notes ?? undefined,
      payment_form: input.paymentForm,
      payment_method: input.paymentMethod,
      place_of_issue: input.placeOfIssue,
    }),
    method: "POST",
  });

  return mapDraft(raw);
}

export async function getBillingDraft(draftId: string): Promise<DigestorFiscalDraft> {
  const raw = await request<RawDraft>(`/v1/billing/drafts/${draftId}`, { method: "GET" });
  return mapDraft(raw);
}

export type StampBillingDraftResult = {
  draft: DigestorFiscalDraft;
  ok: boolean;
  // Detalle real del PAC cuando ok=false -- ej. "CFDI40139 - El campo Nombre
  // del emisor, debe pertenecer al nombre asociado al RFC..." -- sin esto,
  // el unico rastro del motivo de rechazo queda en Digestor Fiscal, no
  // accesible por la app.
  rejectionMessage: string | null;
  uuid: string | null;
  xmlBase64: string | null;
};

type ProviderErrorResponse = {
  Mensaje?: string;
  MensajeSat?: string;
  Valores?: { message?: string };
};

export async function stampBillingDraft(draftId: string): Promise<StampBillingDraftResult> {
  const raw = await request<{
    draft: RawDraft;
    ok: boolean;
    provider_response?: ProviderErrorResponse | string | null;
    xml_base64: string;
  }>(`/v1/billing/drafts/${draftId}/stamp`, { body: JSON.stringify({}), method: "POST" });

  let uuid: string | null = null;
  if (raw.xml_base64) {
    uuid = readInvoiceStamp(raw.xml_base64).uuid;
  }

  let rejectionMessage: string | null = null;
  if (!raw.ok && raw.provider_response) {
    if (typeof raw.provider_response === "string") {
      rejectionMessage = raw.provider_response;
    } else {
      rejectionMessage =
        raw.provider_response.MensajeSat ??
        raw.provider_response.Mensaje ??
        raw.provider_response.Valores?.message ??
        null;
    }
  }

  return {
    draft: mapDraft(raw.draft),
    ok: raw.ok,
    rejectionMessage,
    uuid,
    xmlBase64: raw.xml_base64 || null,
  };
}

// Solo consulta el resultado guardado por Digestor. NO invoca al PAC ni
// solicita nuevos timbres; necesario para recuperar un éxito tras un timeout.
export type BillingStampResult = {
  stampStatus: string;
  uuid: string | null;
  xmlBase64: string | null;
};

export async function getBillingDraftStampResult(draftId: string): Promise<BillingStampResult> {
  const raw = await request<{
    stamp_status: string;
    uuid: string | null;
    xml_base64: string | null;
  }>(`/v1/billing/drafts/${encodeURIComponent(draftId)}/stamp-result`, { method: "GET" });
  return {
    stampStatus: raw.stamp_status,
    uuid: raw.uuid,
    xmlBase64: raw.xml_base64,
  };
}

export function recoverBillingDraftStampResult(draftId: string, invoiceUuid: string): Promise<{
  stamp_status: string; uuid: string | null; xml_base64: string | null;
}> {
  return request(`/v1/billing/drafts/${encodeURIComponent(draftId)}/stamp-result/recover`, {
    method: "POST", body: JSON.stringify({ invoice_uuid: invoiceUuid, confirm: true }), cache: "no-store",
  });
}

// Los endpoints de preview/pdf de Digestor Fiscal tambien exigen Bearer --
// Cotiza los proxea (nunca expone el token al navegador).
export async function fetchBillingDraftPreviewHtml(draftId: string): Promise<string> {
  const config = await getRequestDigestorConfig();
  if (!config) {
    throw new Error("Digestor Fiscal no esta configurado.");
  }
  const token = await login(config);
  const response = await fetch(`${config.baseUrl}/v1/billing/drafts/${draftId}/preview`, {
    headers: { Authorization: `Bearer ${token}` },
    redirect: "error", cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`No fue posible obtener la vista previa (HTTP ${response.status}).`);
  }
  return response.text();
}

export async function fetchBillingDraftPdf(draftId: string): Promise<Buffer> {
  const config = await getRequestDigestorConfig();
  if (!config) {
    throw new Error("Digestor Fiscal no esta configurado.");
  }
  const token = await login(config);
  const response = await fetch(`${config.baseUrl}/v1/billing/drafts/${draftId}/pdf`, {
    headers: { Authorization: `Bearer ${token}` },
    redirect: "error", cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`No fue posible descargar el PDF (HTTP ${response.status}).`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// --- CSF (Constancia de Situacion Fiscal) -----------------------------
// A diferencia de facturacion (un solo emisor, gateada por
// DIGESTOR_FISCAL_TENANT_ID), estas funciones caen en dos grupos:
// - Carga/consulta de CSF ya guardadas (uploadCsfDocument, getDocumentJobStatus,
//   approveDocument, listCsf, getCsf): operan sobre la cuenta de Digestor
//   Fiscal del emisor -- mismo gate de un solo tenant que facturacion.
// - validateReceptorFiscalData: valida RFC/CP/regimen contra catalogos
//   publicos del SAT, sin autenticacion ni persistencia del lado de
//   Digestor Fiscal (asi lo documenta su propio OpenAPI). No depende del
//   CSD de ningun emisor especifico, asi que no se gatea por tenant -- que
//   Digestor Fiscal siga siendo de un solo emisor no debe bloquear que
//   cualquier tenant de Cotiza valide datos fiscales de un receptor.

export type DigestorFiscalDocumentJob = {
  documentId: string | null;
  documentType: string;
  error: string | null;
  jobId: string;
  result: {
    confidence: number | null;
    normalizedFields: Record<string, unknown>;
    rawText: string | null;
    validationFlags: Record<string, unknown>;
  } | null;
  status: "queued" | "processing" | "done" | "failed";
};

type RawDocumentJob = {
  company_id: string;
  document_id: string | null;
  document_type: string;
  error: string | null;
  job_id: string;
  result: {
    confidence: number | null;
    normalized_fields: Record<string, unknown>;
    raw_text: string | null;
    validation_flags: Record<string, unknown>;
  } | null;
  status: "queued" | "processing" | "done" | "failed";
};

function mapDocumentJob(raw: RawDocumentJob): DigestorFiscalDocumentJob {
  return {
    documentId: raw.document_id,
    documentType: raw.document_type,
    error: raw.error,
    jobId: raw.job_id,
    result: raw.result
      ? {
          confidence: raw.result.confidence,
          normalizedFields: raw.result.normalized_fields,
          rawText: raw.result.raw_text,
          validationFlags: raw.result.validation_flags,
        }
      : null,
    status: raw.status,
  };
}

// Sube el PDF de una CSF para procesamiento asincrono (job). El resultado
// normalizado se consulta despues con getDocumentJobStatus(jobId) -- no se
// guarda nada en el cliente de Cotiza hasta que el usuario confirme los
// datos extraidos (ver plan: no se auto-llena sin revision humana).
export async function uploadCsfDocument(file: Buffer, filename: string): Promise<DigestorFiscalDocumentJob> {
  const config = await getRequestDigestorConfig();
  if (!config) {
    throw new Error("Digestor Fiscal no esta configurado.");
  }
  const token = await login(config);

  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(file)], { type: "application/pdf" }), filename);
  form.append("document_type", "csf");
  form.append("use_ai", "false");

  const response = await fetch(`${config.baseUrl}/v1/documents`, {
    signal: AbortSignal.timeout(25_000),
    redirect: "error", cache: "no-store",
    body: form,
    headers: { Authorization: `Bearer ${token}` },
    method: "POST",
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(extractErrorMessage(body, response.status));
  }

  return mapDocumentJob(body as RawDocumentJob);
}

export async function getDocumentJobStatus(jobId: string): Promise<DigestorFiscalDocumentJob> {
  const raw = await request<RawDocumentJob>(`/v1/documents/${encodeURIComponent(jobId)}`, { method: "GET", cache: "no-store", signal: AbortSignal.timeout(25_000) });
  return mapDocumentJob(raw);
}

export type ApproveDocumentResult = {
  approvedAt: string;
  documentId: string;
  status: string;
};

export async function approveDocument(documentId: string, expectedRevision: string, notes?: string): Promise<ApproveDocumentResult> {
  const raw = await request<{ approved_at: string; company_id: string; document_id: string; status: string }>(
    `/v1/documents/${documentId}/approve`,
    { body: JSON.stringify({ notes, confirm_review: true, expected_revision: expectedRevision }), method: "POST" },
  );

  return { approvedAt: raw.approved_at, documentId: raw.document_id, status: raw.status };
}

export type DigestorFiscalCsfSummary = {
  cp: string | null;
  curp: string | null;
  id: string;
  processingStatus: string;
  qrOnline: boolean | null;
  qrValid: boolean | null;
  razonSocial: string;
  regimen: string | null;
  rfc: string;
  uploadedAt: string | null;
};

type RawCsfSummary = {
  cp: string | null;
  curp: string | null;
  id: string;
  processing_status: string;
  qr_online: boolean | null;
  qr_valid: boolean | null;
  razon_social: string;
  regimen: string | null;
  rfc: string;
  uploaded_at: string | null;
};

function mapCsfSummary(raw: RawCsfSummary): DigestorFiscalCsfSummary {
  return {
    cp: raw.cp,
    curp: raw.curp,
    id: raw.id,
    processingStatus: raw.processing_status,
    qrOnline: raw.qr_online,
    qrValid: raw.qr_valid,
    razonSocial: raw.razon_social,
    regimen: raw.regimen,
    rfc: raw.rfc,
    uploadedAt: raw.uploaded_at,
  };
}

// Busca por RFC o razon social en las CSF ya cargadas para este emisor --
// para reaprovechar una CSF ya subida antes en vez de volver a pedirla.
export async function listCsf(query?: { limit?: number; q?: string }): Promise<{
  items: DigestorFiscalCsfSummary[];
  total: number;
}> {
  const params = new URLSearchParams();
  if (query?.q) params.set("q", query.q);
  if (query?.limit) params.set("limit", String(query.limit));
  const suffix = params.size > 0 ? `?${params.toString()}` : "";

  const raw = await request<{ items: RawCsfSummary[]; total: number }>(`/csf${suffix}`, { method: "GET" });
  return { items: raw.items.map(mapCsfSummary), total: raw.total };
}

export type DigestorFiscalCsf = DigestorFiscalCsfSummary & {
  review: CsfReview | null;
  crmAutofill: Record<string, string> | null;
};

export async function getCsf(csfId: string): Promise<DigestorFiscalCsf> {
  const raw = await request<RawCsfSummary & { crm_autofill: Record<string, string> | null; review?: CsfReview }>(`/csf/${encodeURIComponent(csfId)}`, {
    method: "GET", cache: "no-store", signal: AbortSignal.timeout(25_000),
  });
  return { ...mapCsfSummary(raw), crmAutofill: raw.crm_autofill ?? null, review: raw.review ?? null };
}

export type ReceptorValidationInput = {
  cp: string;
  nombre?: string;
  regimen: string;
  rfc: string;
  usoCfdi?: string;
};

export type ReceptorFieldResult = {
  message: string;
  valid: boolean;
};

export type ReceptorValidationResult = {
  fields: Record<string, ReceptorFieldResult>;
  pac: { available: boolean; errorCode: string | null; message: string; rfcActive: boolean | null } | null;
  summary: string;
  tipoPersona: string | null;
  valid: boolean;
};

// Valida RFC + CP + regimen (+ uso CFDI) contra los catalogos SAT CFDI 4.0.
// No requiere login (el propio servicio no lo pide) ni persiste nada del
// lado de Digestor Fiscal. Con pacCheck=true ademas verifica en vivo, via
// el PAC, si el RFC esta activo en el padron del SAT -- mas lento, usarlo
// solo cuando el usuario lo pida explicitamente, no en cada tecleo.
export async function validateReceptorFiscalData(
  input: ReceptorValidationInput,
  options?: { pacCheck?: boolean },
): Promise<ReceptorValidationResult> {
  const config = await getRequestDigestorConfig();
  if (!config) {
    throw new Error("Digestor Fiscal no esta configurado.");
  }

  if (config.environment === "sandbox") await login(config);
  const suffix = options?.pacCheck ? "?pac_check=true" : "";
  const response = await fetch(`${config.baseUrl}/v1/receptor/validate${suffix}`, {
    redirect: "error", cache: "no-store",
    body: JSON.stringify({
      cp: input.cp,
      nombre: input.nombre ?? undefined,
      regimen: input.regimen,
      rfc: input.rfc,
      uso_cfdi: input.usoCfdi ?? undefined,
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(extractErrorMessage(body, response.status));
  }

  const raw = body as {
    fields: Record<string, ReceptorFieldResult>;
    pac: { available: boolean; error_code: string | null; message: string; rfc_active: boolean | null } | null;
    summary: string;
    tipo_persona: string | null;
    valid: boolean;
  };

  return {
    fields: raw.fields,
    pac: raw.pac
      ? {
          available: raw.pac.available,
          errorCode: raw.pac.error_code,
          message: raw.pac.message,
          rfcActive: raw.pac.rfc_active,
        }
      : null,
    summary: raw.summary,
    tipoPersona: raw.tipo_persona,
    valid: raw.valid,
  };
}

export type BillingPayment = {
  id: string; sequence: number; reference: string; amount: string; paid_at: string; payment_form: string;
  balance_before: string; balance_after: string;
  receipt_status: "not_sent" | "processing" | "unknown" | "rejected" | "stamped";
  receipt_uuid: string | null; xml_base64: string | null; bank_verification: "not_performed";
  cancellation_status?: BillingCancellation['status'];
  fiscal_ready?: boolean;
  has_active_revision?: boolean;
};
export type BillingPayments = {
  environment?: 'sandbox' | 'production';
  supported: boolean; reason?: string; currency?: string; invoice_uuid?: string; total?: string;
  paid?: string; balance?: string; receipt_stamp_enabled?: boolean; payments: BillingPayment[];
  invoice_cancellation_status?: BillingCancellation['status'];
  invoice_fiscal_ready?: boolean;
};
const paymentPath = (draftId: string) => `/v1/billing/drafts/${encodeURIComponent(draftId)}/payments`;
export function getBillingPayments(draftId: string): Promise<BillingPayments> {
  return request(paymentPath(draftId), { method: "GET" });
}
export function registerBillingPayment(draftId: string, input: {
  idempotency_key: string; reference: string; amount: string; paid_at: string; payment_form: string;
}): Promise<BillingPayment> {
  return request(paymentPath(draftId), { method: "POST", body: JSON.stringify(input) });
}
export function getPaymentReceipt(draftId: string, paymentId: string): Promise<BillingPayment> {
  return request(`${paymentPath(draftId)}/${encodeURIComponent(paymentId)}/receipt`, { method: "GET" });
}
export function preparePaymentReceipt(draftId: string, paymentId: string): Promise<{ preliminary: true; xml_base64: string }> {
  return request(`${paymentPath(draftId)}/${encodeURIComponent(paymentId)}/receipt/prepare`, { method: "POST" });
}
export function stampPaymentReceipt(draftId: string, paymentId: string): Promise<BillingPayment & { ok: boolean }> {
  return request(`${paymentPath(draftId)}/${encodeURIComponent(paymentId)}/receipt/stamp`, { method: "POST" });
}

export function recoverPaymentReceipt(draftId: string, paymentId: string, receiptUuid: string): Promise<BillingPayment> {
  return request(`${paymentPath(draftId)}/${encodeURIComponent(paymentId)}/receipt/reconcile`, {
    method: 'POST', body: JSON.stringify({ receipt_uuid: receiptUuid }),
  });
}

export type BillingCancellation = {
  environment?: 'sandbox' | 'production';
  status: 'not_requested' | 'not_sent' | 'processing' | 'requested' | 'unknown' | 'rejected' | 'cancelled';
  document_uuid?: string; reason?: string; replacement_uuid?: string | null;
  idempotency_key?: string;
  acknowledgement_xml: string | null; checked_at?: string | null;
  sat_response?: LiveCancellation['sat_response'];
};
export type CancelDocumentInput = { idempotency_key: string; expected_uuid?: string; reason: '01' | '02' | '03'; replacement_draft_id?: string };
const cancellationPath = (draftId: string, paymentId?: string) => paymentId
  ? `${paymentPath(draftId)}/${encodeURIComponent(paymentId)}/receipt/cancellation`
  : `/v1/billing/drafts/${encodeURIComponent(draftId)}/cancellation`;
export function getBillingCancellation(draftId: string, paymentId?: string): Promise<BillingCancellation> {
  return request(cancellationPath(draftId, paymentId), { method: 'GET', cache: 'no-store' });
}
export function cancelBillingDocument(draftId: string, input: CancelDocumentInput, paymentId?: string): Promise<BillingCancellation> {
  return request(cancellationPath(draftId, paymentId), { method: 'POST', body: JSON.stringify(input) });
}
export function reconcileBillingCancellation(draftId: string, paymentId?: string): Promise<BillingCancellation> {
  return request(`${cancellationPath(draftId, paymentId)}/reconcile`, { method: 'POST' });
}

export type FiscalCorrection = {
  can_correct?: boolean;
  environment?: 'sandbox' | 'production';
  active_uuid: string; active_xml_base64: string; pending: boolean; kind: 'invoice' | 'receipt';
  defaults: Record<string, string | null>;
  archived_history?: Array<{ id: string; source_uuid: string; reason: string }>;
  history: Array<{ id: string; source_uuid: string; result_uuid: string | null;
    status: 'prepared' | 'processing' | 'unknown' | 'rejected' | 'stamped'; reason: string; changes?: Record<string,string>;
    source_cancellation_status: BillingCancellation['status']; request_xml_base64: string; result_xml_base64: string | null }>;
};
export type CreateFiscalCorrection = { idempotency_key: string; source_uuid: string; reason: string; changes: Record<string, string> };
const correctionPath = (draftId: string, paymentId?: string) => paymentId
  ? `${paymentPath(draftId)}/${encodeURIComponent(paymentId)}/receipt/correction`
  : `/v1/billing/drafts/${encodeURIComponent(draftId)}/correction`;
export function getFiscalCorrection(draftId: string, paymentId?: string): Promise<FiscalCorrection> {
  return request(correctionPath(draftId, paymentId), { method: 'GET', cache: 'no-store' });
}
export function createFiscalCorrection(draftId: string, input: CreateFiscalCorrection, paymentId?: string): Promise<FiscalCorrection> {
  return request(correctionPath(draftId, paymentId), { method: 'POST', body: JSON.stringify(input) });
}
export function fiscalCorrectionAction(draftId: string, action: 'stamp' | 'reconcile' | 'abandon' | 'cancel-original' | 'confirm-cancellation',
  input: { receipt_uuid?: string; revision_id?: string } | undefined, paymentId?: string): Promise<FiscalCorrection> {
  return request(`${correctionPath(draftId, paymentId)}/${action}`, { method: 'POST', body: input ? JSON.stringify(input) : undefined });
}

// Official local SAT snapshot: no paid model or external search call.
export function searchSatCatalog(kind: import("@/lib/domain/fiscal-classification").SatCatalogKind, q: string, nature: import("@/lib/domain/fiscal-classification").SaleNature) {
  return request<import("@/lib/domain/fiscal-classification").SatSearchResult>(`/v1/sat-catalogs/search?${new URLSearchParams({ kind, q, nature })}`,
    { method: "GET", cache: "no-store", signal: AbortSignal.timeout(15_000) });
}
export function validateSatClassifications(items: Array<{ itemNumber: number; satProductCode: string; unitCode: string }>, catalogVersion?: string) {
  // Persisted receipts also contain audit metadata. Digestor's Item contract
  // forbids extra fields: TypeScript's structural type does not strip them.
  const pairs = items.map(({ itemNumber, satProductCode, unitCode }) => ({ itemNumber, satProductCode, unitCode }));
  return request<import("@/lib/domain/fiscal-classification").SatValidation>("/v1/sat-catalogs/validate",
    { method: "POST", cache: "no-store", signal: AbortSignal.timeout(15_000), body: JSON.stringify({ items: pairs, catalogVersion }) });
}


export type SatObservation = {
  id: string; checked_at: string | null; source: string; outcome: 'answered' | 'query_failed';
  response: { Estado: 'Vigente' | 'Cancelado' | 'No localizado'; CodigoEstatus?: string | null; EsCancelable?: string | null; EstatusCancelacion?: string | null } | null;
  error?: string | null; origin: string; trigger?: 'manual' | 'scheduled' | null;
};
export type SatSchedule = {
  available: boolean; can_manage: boolean; enabled: boolean; running: boolean;
  interval_seconds: number; next_check_at: string | null; failures: number; last_outcome: string | null;
};
export type SatTracking = { document_uuid: string; history: SatObservation[]; latest_attempt: SatObservation | null; last_answer: SatObservation | null; cached?: boolean; schedule?: SatSchedule };
export function getSatTracking(draftId: string, uuid: string, consult = false, paymentId?: string): Promise<SatTracking> {
  const path = paymentId ? `${paymentPath(draftId)}/${encodeURIComponent(paymentId)}/receipt/sat-status` : `/v1/billing/drafts/${encodeURIComponent(draftId)}/sat-status`;
  return request(`${path}?expected_uuid=${encodeURIComponent(uuid)}`, { method: consult ? 'POST' : 'GET', cache: 'no-store', signal: AbortSignal.timeout(55_000) });
}

export function setSatSchedule(draftId: string, uuid: string, enabled: boolean, paymentId?: string): Promise<SatTracking> {
  const path = paymentId ? `${paymentPath(draftId)}/${encodeURIComponent(paymentId)}/receipt/sat-status` : `/v1/billing/drafts/${encodeURIComponent(draftId)}/sat-status`;
  return request(`${path}/schedule?expected_uuid=${encodeURIComponent(uuid)}`, {
    method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(15_000), body: JSON.stringify({ enabled }),
  });
}
