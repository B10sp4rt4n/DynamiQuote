import "server-only";

// Cliente HTTP hacia Digestor Fiscal (repo aparte, B10sp4rt4n/digestor__fiscal).
// Motor de un solo emisor por ahora (solo SynAppsSys tiene CSD real cargado
// ahi) -- no hay mapeo multi-tenant, se gatea con DIGESTOR_FISCAL_TENANT_ID.
// Nunca se llama desde el cliente: solo desde rutas API server-side.

type DigestorFiscalConfig = {
  baseUrl: string;
  username: string;
  password: string;
};

function getConfig(): DigestorFiscalConfig | null {
  const baseUrl = process.env["DIGESTOR_FISCAL_BASE_URL"];
  const username = process.env["DIGESTOR_FISCAL_USERNAME"];
  const password = process.env["DIGESTOR_FISCAL_PASSWORD"];

  if (!baseUrl || !username || !password) {
    return null;
  }

  return { baseUrl: baseUrl.replace(/\/+$/, ""), password, username };
}

export function isDigestorFiscalConfigured(): boolean {
  return getConfig() !== null;
}

// Tenant de Cotiza habilitado para facturar -- hoy solo SynAppsSys.
export function isDigestorFiscalEnabledForTenant(tenantId: string): boolean {
  const enabledTenantId = process.env["DIGESTOR_FISCAL_TENANT_ID"];
  return Boolean(enabledTenantId) && enabledTenantId === tenantId && isDigestorFiscalConfigured();
}

type CachedToken = {
  expiresAt: number;
  token: string;
};

let cachedToken: CachedToken | null = null;

async function login(config: DigestorFiscalConfig): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.token;
  }

  const response = await fetch(`${config.baseUrl}/auth/login`, {
    body: JSON.stringify({ password: config.password, username: config.username }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`No fue posible autenticar con Digestor Fiscal (HTTP ${response.status}).`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  cachedToken = { expiresAt: Date.now() + data.expires_in * 1000, token: data.access_token };
  return cachedToken.token;
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
  const config = getConfig();
  if (!config) {
    throw new Error("Digestor Fiscal no esta configurado (faltan variables de entorno).");
  }

  const token = await login(config);
  const response = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(extractErrorMessage(body, response.status));
  }

  return body as T;
}

export type DigestorFiscalDraftItem = {
  description: string;
  quantity: number;
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
    const xml = Buffer.from(raw.xml_base64, "base64").toString("utf-8");
    const match = xml.match(/UUID="([^"]+)"/);
    uuid = match ? match[1] : null;
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
    xmlBase64: raw.ok ? raw.xml_base64 ?? null : null,
  };
}

// Los endpoints de preview/pdf de Digestor Fiscal tambien exigen Bearer --
// Cotiza los proxea (nunca expone el token al navegador).
export async function fetchBillingDraftPreviewHtml(draftId: string): Promise<string> {
  const config = getConfig();
  if (!config) {
    throw new Error("Digestor Fiscal no esta configurado.");
  }
  const token = await login(config);
  const response = await fetch(`${config.baseUrl}/v1/billing/drafts/${draftId}/preview`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`No fue posible obtener la vista previa (HTTP ${response.status}).`);
  }
  return response.text();
}

export async function fetchBillingDraftPdf(draftId: string): Promise<Buffer> {
  const config = getConfig();
  if (!config) {
    throw new Error("Digestor Fiscal no esta configurado.");
  }
  const token = await login(config);
  const response = await fetch(`${config.baseUrl}/v1/billing/drafts/${draftId}/pdf`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`No fue posible descargar el PDF (HTTP ${response.status}).`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
