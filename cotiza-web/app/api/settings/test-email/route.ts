import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { prisma } from "@/lib/db/prisma";
import { sendTestEmail } from "@/lib/email/send-test-email";
import { enforceRateLimit, getRequestIdentity } from "@/lib/utils/rate-limit";

const testEmailSchema = z.object({
  customMessage: z.string().trim().max(1200).optional(),
  customSubject: z.string().trim().max(180).optional(),
  template: z.enum(["alta", "mantenimiento", "promocion"]),
  to: z.string().trim().email("Correo destino invalido").max(191),
});

type TestEmailHistoryItem = {
  createdAt: string;
  id: string;
  sent: boolean;
  subject: string | null;
  template: string;
  to: string;
  warning: string | null;
};

async function ensureTestEmailLogsTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS test_email_logs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      sent_to TEXT NOT NULL,
      template TEXT NOT NULL,
      subject TEXT,
      sent BOOLEAN NOT NULL DEFAULT FALSE,
      warning TEXT,
      actor_user_id TEXT,
      created_at TIMESTAMP(6) NOT NULL DEFAULT NOW()
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_test_email_logs_tenant_created_at
    ON test_email_logs (tenant_id, created_at DESC);
  `);
}

async function getHistoryByTenant(tenantId: string, limit = 20): Promise<TestEmailHistoryItem[]> {
  await ensureTestEmailLogsTable();

  const rows = await prisma.$queryRawUnsafe<Array<{
    created_at: Date;
    id: string;
    sent: boolean;
    sent_to: string;
    subject: string | null;
    template: string;
    warning: string | null;
  }>>(
    `
      SELECT id, sent_to, template, subject, sent, warning, created_at
      FROM test_email_logs
      WHERE tenant_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `,
    tenantId,
    limit,
  );

  return rows.map((row) => ({
    createdAt: row.created_at.toISOString(),
    id: row.id,
    sent: row.sent,
    subject: row.subject,
    template: row.template,
    to: row.sent_to,
    warning: row.warning,
  }));
}

export async function GET(request: Request) {
  const tenant = await getCurrentTenantContext();
  if (!tenant) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  if (!tenant.isSuperAdmin) {
    return NextResponse.json({ error: "Solo superadmin puede consultar historial de correos de prueba" }, { status: 403 });
  }

  const identity = getRequestIdentity(request, tenant.id);
  const rl = enforceRateLimit(`settings:test-email:history:${tenant.id}:${identity}`, 30, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes" },
      { headers: { "Retry-After": Math.ceil((rl.resetAt - Date.now()) / 1000).toString() }, status: 429 },
    );
  }

  const history = await getHistoryByTenant(tenant.id, 25);
  return NextResponse.json({ history });
}

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

  await ensureTestEmailLogsTable();

  const id = crypto.randomUUID();
  await prisma.$executeRawUnsafe(
    `
      INSERT INTO test_email_logs (id, tenant_id, sent_to, template, subject, sent, warning, actor_user_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
    id,
    tenant.id,
    parsed.data.to.toLowerCase(),
    parsed.data.template,
    parsed.data.customSubject?.trim() || null,
    result.sent,
    result.warning,
    tenant.userId,
  );

  const history = await getHistoryByTenant(tenant.id, 25);

  return NextResponse.json({ history, sent: result.sent, warning: result.warning });
}
