import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// digestor-fiscal.ts usa "server-only" -- mock para tests sin runtime de Next.js.
vi.mock("server-only", () => ({}));

const ENV_KEYS = ["DIGESTOR_FISCAL_BASE_URL", "DIGESTOR_FISCAL_USERNAME", "DIGESTOR_FISCAL_PASSWORD"] as const;

function setConfigEnv(): void {
  process.env["DIGESTOR_FISCAL_BASE_URL"] = "https://digestor.test";
  process.env["DIGESTOR_FISCAL_USERNAME"] = "user";
  process.env["DIGESTOR_FISCAL_PASSWORD"] = "pass";
}

function clearConfigEnv(): void {
  for (const key of ENV_KEYS) delete process.env[key];
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("digestor-fiscal: CSF + validacion de receptor", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.resetModules();
    setConfigEnv();
  });

  afterEach(() => {
    clearConfigEnv();
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("uploadCsfDocument hace login y sube el PDF como multipart", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "tok", expires_in: 3600 }))
      .mockResolvedValueOnce(
        jsonResponse({
          company_id: "c1",
          document_id: null,
          document_type: "csf",
          error: null,
          job_id: "job-1",
          result: null,
          status: "queued",
        }),
      );
    global.fetch = fetchMock as unknown as typeof fetch;

    const { uploadCsfDocument } = await import("./digestor-fiscal");
    const result = await uploadCsfDocument(Buffer.from("pdf-bytes"), "csf.pdf");

    expect(result).toEqual({
      documentId: null,
      documentType: "csf",
      error: null,
      jobId: "job-1",
      result: null,
      status: "queued",
    });

    const uploadCall = fetchMock.mock.calls[1];
    expect(uploadCall[0]).toBe("https://digestor.test/v1/documents");
    expect(uploadCall[1].body).toBeInstanceOf(FormData);
    expect(uploadCall[1].headers.Authorization).toBe("Bearer tok");
  });

  it("getDocumentJobStatus mapea el resultado normalizado cuando el job termina", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "tok", expires_in: 3600 }))
      .mockResolvedValueOnce(
        jsonResponse({
          company_id: "c1",
          document_id: "doc-1",
          document_type: "csf",
          error: null,
          job_id: "job-1",
          result: {
            confidence: 0.94,
            normalized_fields: { rfc: "AAA010101AAA" },
            raw_text: "texto",
            validation_flags: { rfc_format_ok: true },
          },
          status: "done",
        }),
      );
    global.fetch = fetchMock as unknown as typeof fetch;

    const { getDocumentJobStatus } = await import("./digestor-fiscal");
    const result = await getDocumentJobStatus("job-1");

    expect(result.status).toBe("done");
    expect(result.documentId).toBe("doc-1");
    expect(result.result?.normalizedFields).toEqual({ rfc: "AAA010101AAA" });
  });

  it("approveDocument manda notes solo cuando se proporcionan", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "tok", expires_in: 3600 }))
      .mockResolvedValueOnce(
        jsonResponse({ approved_at: "2026-09-22T10:00:00Z", company_id: "c1", document_id: "doc-1", status: "approved" }),
      );
    global.fetch = fetchMock as unknown as typeof fetch;

    const { approveDocument } = await import("./digestor-fiscal");
    const result = await approveDocument("doc-1", "revisado a mano");

    expect(result).toEqual({ approvedAt: "2026-09-22T10:00:00Z", documentId: "doc-1", status: "approved" });
    const approveCall = fetchMock.mock.calls[1];
    expect(JSON.parse(approveCall[1].body as string)).toEqual({ notes: "revisado a mano" });
  });

  it("listCsf arma el query string solo con los parametros presentes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "tok", expires_in: 3600 }))
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            {
              cp: "06100",
              curp: null,
              id: "csf-1",
              processing_status: "processed",
              qr_online: true,
              qr_valid: true,
              razon_social: "ACME SA DE CV",
              regimen: "601",
              rfc: "AAA010101AAA",
              uploaded_at: "2026-09-20T10:00:00Z",
            },
          ],
          total: 1,
        }),
      );
    global.fetch = fetchMock as unknown as typeof fetch;

    const { listCsf } = await import("./digestor-fiscal");
    const result = await listCsf({ limit: 5, q: "ACME" });

    expect(result.total).toBe(1);
    expect(result.items[0]?.razonSocial).toBe("ACME SA DE CV");
    expect(fetchMock.mock.calls[1][0]).toBe("https://digestor.test/csf?q=ACME&limit=5");
  });

  it("getCsf incluye crmAutofill mapeado", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "tok", expires_in: 3600 }))
      .mockResolvedValueOnce(
        jsonResponse({
          cp: "06100",
          crm_autofill: { razon_social: "ACME SA DE CV", rfc: "AAA010101AAA" },
          curp: null,
          id: "csf-1",
          processing_status: "processed",
          qr_online: true,
          qr_valid: true,
          razon_social: "ACME SA DE CV",
          regimen: "601",
          rfc: "AAA010101AAA",
          uploaded_at: "2026-09-20T10:00:00Z",
        }),
      );
    global.fetch = fetchMock as unknown as typeof fetch;

    const { getCsf } = await import("./digestor-fiscal");
    const result = await getCsf("csf-1");

    expect(result.crmAutofill).toEqual({ razon_social: "ACME SA DE CV", rfc: "AAA010101AAA" });
  });

  it("validateReceptorFiscalData no hace login (el endpoint no lo exige)", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        fields: { cp: { message: "CP valido", valid: true } },
        pac: null,
        summary: "Datos validos",
        tipo_persona: "moral",
        valid: true,
      }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const { validateReceptorFiscalData } = await import("./digestor-fiscal");
    const result = await validateReceptorFiscalData({ cp: "06100", regimen: "601", rfc: "AAA010101AAA" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://digestor.test/v1/receptor/validate");
    expect(result.valid).toBe(true);
    expect(result.tipoPersona).toBe("moral");
  });

  it("validateReceptorFiscalData agrega pac_check=true solo si se pide", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        fields: {},
        pac: { available: true, error_code: null, message: "RFC activo", rfc_active: true },
        summary: "ok",
        tipo_persona: "fisica",
        valid: true,
      }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const { validateReceptorFiscalData } = await import("./digestor-fiscal");
    const result = await validateReceptorFiscalData(
      { cp: "06100", regimen: "601", rfc: "AAA010101AAA" },
      { pacCheck: true },
    );

    expect(fetchMock.mock.calls[0][0]).toBe("https://digestor.test/v1/receptor/validate?pac_check=true");
    expect(result.pac).toEqual({ available: true, errorCode: null, message: "RFC activo", rfcActive: true });
  });

  it("validateReceptorFiscalData propaga el mensaje de error del servicio", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ detail: "RFC invalido" }, 422)) as unknown as typeof fetch;

    const { validateReceptorFiscalData } = await import("./digestor-fiscal");

    await expect(validateReceptorFiscalData({ cp: "06100", regimen: "601", rfc: "MAL" })).rejects.toThrow(
      "RFC invalido",
    );
  });

  it("validateReceptorFiscalData lanza si Digestor Fiscal no esta configurado", async () => {
    clearConfigEnv();
    const { validateReceptorFiscalData } = await import("./digestor-fiscal");

    await expect(validateReceptorFiscalData({ cp: "06100", regimen: "601", rfc: "AAA010101AAA" })).rejects.toThrow(
      "Digestor Fiscal no esta configurado.",
    );
  });
});
