import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { sendTestEmail } from "@/lib/email/send-test-email";
import { enforceRateLimit, getRequestIdentity } from "@/lib/utils/rate-limit";

const testEmailSchema = z.object({
  customMessage: z.string().trim().max(1200).optional(),
  customSubject: z.string().trim().max(180).optional(),
  template: z.enum(["alta", "mantenimiento", "promocion"]),
  to: z.string().trim().email("Correo destino invalido").max(191),
});

export async function POST(request: Request) {
  const tenant = await getCurrentTenantContext();
  if (!tenant) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  if (!tenant.isSuperAdmin) {
    return NextResponse.json({ error: "Solo superadmin puede enviar correos de prueba" }, { status: 403 });
  }

  const identity = getRequestIdentity(request, tenant.id);
  const rl = enforceRateLimit(`settings:test-email:${tenant.id}:${identity}`, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes" },
      { headers: { "Retry-After": Math.ceil((rl.resetAt - Date.now()) / 1000).toString() }, status: 429 },
    );
  }

  const body = (await request.json().catch(() => null)) as unknown;
  const parsed = testEmailSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Payload invalido" }, { status: 422 });
  }

  const result = await sendTestEmail({
    customMessage: parsed.data.customMessage,
    customSubject: parsed.data.customSubject,
    template: parsed.data.template,
    tenantName: tenant.name,
    to: parsed.data.to.toLowerCase(),
  });

  return NextResponse.json({ sent: result.sent, warning: result.warning });
}
