import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentTenantContextMock, isDigestorFiscalConfiguredMock, validateReceptorFiscalDataMock, enforceRateLimitMock, getRequestIdentityMock } =
  vi.hoisted(() => ({
    enforceRateLimitMock: vi.fn(),
    getCurrentTenantContextMock: vi.fn(),
    getRequestIdentityMock: vi.fn(),
    isDigestorFiscalConfiguredMock: vi.fn(),
    validateReceptorFiscalDataMock: vi.fn(),
  }));

vi.mock("@/lib/auth/tenant-context", () => ({
  getCurrentTenantContext: getCurrentTenantContextMock,
}));

vi.mock("@/lib/integrations/digestor-fiscal", () => ({
  isDigestorFiscalConfigured: isDigestorFiscalConfiguredMock,
  validateReceptorFiscalData: validateReceptorFiscalDataMock,
}));

vi.mock("@/lib/utils/rate-limit", () => ({
  enforceRateLimit: enforceRateLimitMock,
  getRequestIdentity: getRequestIdentityMock,
}));

import { POST } from "@/app/api/clients/fiscal-validation/route";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/clients/fiscal-validation", {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

describe("POST /api/clients/fiscal-validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    enforceRateLimitMock.mockReturnValue({ allowed: true, remaining: 10, resetAt: Date.now() + 10_000 });
    getRequestIdentityMock.mockReturnValue("ip-1");
    isDigestorFiscalConfiguredMock.mockReturnValue(true);
  });

  it("devuelve 401 sin tenant", async () => {
    getCurrentTenantContextMock.mockResolvedValue(null);

    const res = await POST(makeRequest({ cp: "06100", regimen: "601", rfc: "AAA010101AAA" }));

    expect(res.status).toBe(401);
  });

  it("devuelve 429 cuando excede rate-limit", async () => {
    getCurrentTenantContextMock.mockResolvedValue({ id: "t1", userId: "u1" });
    enforceRateLimitMock.mockReturnValue({ allowed: false, remaining: 0, resetAt: Date.now() + 10_000 });

    const res = await POST(makeRequest({ cp: "06100", regimen: "601", rfc: "AAA010101AAA" }));

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
  });

  it("devuelve 503 cuando Digestor Fiscal no esta configurado, sin llamar al servicio", async () => {
    getCurrentTenantContextMock.mockResolvedValue({ id: "t1", userId: "u1" });
    isDigestorFiscalConfiguredMock.mockReturnValue(false);

    const res = await POST(makeRequest({ cp: "06100", regimen: "601", rfc: "AAA010101AAA" }));

    expect(res.status).toBe(503);
    expect(validateReceptorFiscalDataMock).not.toHaveBeenCalled();
  });

  it("devuelve 422 con payload invalido (falta regimen)", async () => {
    getCurrentTenantContextMock.mockResolvedValue({ id: "t1", userId: "u1" });

    const res = await POST(makeRequest({ cp: "06100", rfc: "AAA010101AAA" }));

    expect(res.status).toBe(422);
    expect(validateReceptorFiscalDataMock).not.toHaveBeenCalled();
  });

  it("devuelve 200 con el resultado de la validacion, sin exigir pertenencia a un tenant especifico", async () => {
    getCurrentTenantContextMock.mockResolvedValue({ id: "t-cualquiera", userId: "u1" });
    validateReceptorFiscalDataMock.mockResolvedValue({
      fields: { cp: { message: "CP válido", valid: true } },
      pac: null,
      summary: "Datos válidos",
      tipoPersona: "moral",
      valid: true,
    });

    const res = await POST(makeRequest({ cp: "06100", regimen: "601", rfc: "AAA010101AAA", usoCfdi: "G03" }));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { valid: boolean };
    expect(body.valid).toBe(true);
    expect(validateReceptorFiscalDataMock).toHaveBeenCalledWith(
      { cp: "06100", nombre: undefined, regimen: "601", rfc: "AAA010101AAA", usoCfdi: "G03" },
      { pacCheck: undefined },
    );
  });

  it("devuelve 502 cuando el servicio de Digestor Fiscal falla", async () => {
    getCurrentTenantContextMock.mockResolvedValue({ id: "t1", userId: "u1" });
    validateReceptorFiscalDataMock.mockRejectedValue(new Error("RFC inválido"));

    const res = await POST(makeRequest({ cp: "06100", regimen: "601", rfc: "MAL" }));

    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("RFC inválido");
  });
});
