import { NextResponse } from "next/server";

import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { isDigestorFiscalConfigured, validateReceptorFiscalData } from "@/lib/integrations/digestor-fiscal";
import { enforceRateLimit, getRequestIdentity } from "@/lib/utils/rate-limit";
import { validateClientFiscalDataSchema } from "@/lib/validations/clients";

// POST /api/clients/fiscal-validation — valida RFC/CP/regimen/uso CFDI de un
// cliente o prospecto contra los catalogos del SAT (via Digestor Fiscal,
// /v1/receptor/validate). No persiste nada -- es solo un chequeo en vivo
// mientras se captura el formulario. A diferencia de facturacion, no esta
// acotado a un tenant especifico: el endpoint de Digestor Fiscal no exige
// login ni depende del CSD de ningun emisor, asi que cualquier tenant de
// Cotiza puede usarlo.
export async function POST(request: Request) {
  const tenant = await getCurrentTenantContext();

  if (!tenant) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const identity = getRequestIdentity(request, tenant.userId ?? tenant.id);
  const rateLimit = enforceRateLimit(`clients:fiscal-validation:${tenant.id}:${identity}`, 20, 60_000);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Demasiadas validaciones, intenta nuevamente en breve" },
      {
        headers: { "Retry-After": Math.ceil((rateLimit.resetAt - Date.now()) / 1000).toString() },
        status: 429,
      },
    );
  }

  if (!isDigestorFiscalConfigured()) {
    return NextResponse.json({ error: "La validación fiscal no está disponible en este momento" }, { status: 503 });
  }

  const parsed = validateClientFiscalDataSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 422 });
  }

  try {
    const result = await validateReceptorFiscalData(
      {
        cp: parsed.data.cp,
        nombre: parsed.data.nombre,
        regimen: parsed.data.regimen,
        rfc: parsed.data.rfc,
        usoCfdi: parsed.data.usoCfdi,
      },
      { pacCheck: parsed.data.pacCheck },
    );

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No fue posible validar los datos fiscales";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
