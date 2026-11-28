import { NextResponse } from "next/server";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { actOnWin, getWinView, WinError } from "@/lib/db/won-consolidation";
import { winActionSchema } from "@/lib/domain/won-consolidation";
import { enforceRateLimit } from "@/lib/utils/rate-limit";
import { scheduleApprovalEmails } from "@/lib/email/approval-dispatch";
import { readCustomerEvidenceRequest } from "@/lib/customer-evidence-request";
import { CustomerEvidenceError } from "@/lib/db/customer-evidence";
type Context = { params: Promise<{ proposalId: string }> };
function failure(error: unknown) {
  const known = error instanceof WinError || error instanceof CustomerEvidenceError;
  return NextResponse.json({ error: known ? error.message : error instanceof SyntaxError ? "Revisa los datos de la confirmación" : "No se pudo consultar o guardar el circuito. Recarga antes de continuar" },
    { status: known ? error.status : error instanceof SyntaxError ? 422 : 500, headers: { "Cache-Control": "no-store" } });
}
export async function GET(_request: Request, context: Context) {
  const tenant = await getCurrentTenantContext();
  if (!tenant?.userId || tenant.authMode !== "clerk") return NextResponse.json({ error: "Inicia sesión" }, { status: 401 });
  try {
    return NextResponse.json(await getWinView(tenant.id, (await context.params).proposalId, { ...tenant, userId: tenant.userId }), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request, context: Context) {
  const tenant = await getCurrentTenantContext();
  if (!tenant?.userId || tenant.authMode !== "clerk") return NextResponse.json({ error: "Inicia sesión" }, { status: 401 });
  if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Origen no autorizado" }, { status: 403 });
  if (request.headers.get("X-Tenant-Context") !== tenant.id) return NextResponse.json({ error: "La empresa activa cambió. Recarga" }, { status: 409 });
  const limit = enforceRateLimit(`win:${tenant.id}:${tenant.userId}`, 30, 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "Demasiadas solicitudes. Intenta en breve" }, { status: 429 });
  try {
    const { input, file } = await readCustomerEvidenceRequest(request);
    const parsed = winActionSchema.safeParse(input);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Revisa los datos" }, { status: 422 });
    const proposalId = (await context.params).proposalId;
    const actor = { ...tenant, userId: tenant.userId };
    const view = file ? await actOnWin(tenant.id, proposalId, actor, parsed.data, file) : await actOnWin(tenant.id, proposalId, actor, parsed.data);
    if (parsed.data.action === "accept" || parsed.data.action === "decide") scheduleApprovalEmails(tenant.id, proposalId);
    return NextResponse.json(view, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
