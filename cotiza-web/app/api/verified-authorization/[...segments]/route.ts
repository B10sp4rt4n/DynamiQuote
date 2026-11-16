import { NextResponse } from "next/server";
import { z } from "zod";
import { approvalConfig, getApprovalActor } from "@/lib/auth/verified-authorization";
import { checkApprovalPost } from "@/lib/auth/approval-request-security";
import { ApprovalError, approvalInputSchema, authenticationResponseSchema, registrationResponseSchema } from "@/lib/domain/verified-authorization";
import { approvalOptions, approvalRate, approvalState, bootstrapEnrollment, prepareBootstrap, cancelApproval, confirmApproval, consumeApproval,
  createApproval, exportApproval, getApproval, registrationOptions, verifyRegistration } from "@/lib/db/verified-authorization";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { reverificationErrorResponse } from "@clerk/nextjs/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store, private", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };
const token = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const identifier = z.string().uuid();
type Context = { params: Promise<{ segments: string[] }> };

async function handle(request: Request, context: Context) {
  try {
    const config = approvalConfig();
    if (request.method === "POST") checkApprovalPost(request, config.origin, config.tenantId);
    const actor = await getApprovalActor();
    const { segments } = await context.params;
    const path = segments.join("/");
    await approvalRate(actor, request.method === "GET" ? "read" : "write", request.method === "GET" ? 120 : 20);
    let body: unknown = {};
    if (request.method === "POST") {
      const raw = await request.text();
      if (Buffer.byteLength(raw) > 65_536) throw new ApprovalError("Solicitud demasiado grande", 413);
      try { body = JSON.parse(raw); } catch { throw new ApprovalError("JSON inválido", 422); }
    }
    let result: unknown;
    if (request.method === "GET" && path === "state") result = await approvalState(actor);
    else if (request.method === "POST" && path === "bootstrap/prepare") {
      z.object({}).strict().parse(body); result = await prepareBootstrap(actor);
    } else if (request.method === "POST" && path === "bootstrap/reverify") {
      const response = reverificationErrorResponse({ level: "first_factor", afterMinutes: 1 });
      Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      return response;
    } else if (request.method === "POST" && path === "bootstrap") {
      const input = z.object({ challengeId: identifier }).strict().parse(body); result = await bootstrapEnrollment(actor, input.challengeId);
    } else if (request.method === "POST" && path === "requests") result = await createApproval(actor, approvalInputSchema.parse(body));
    else if (request.method === "POST" && path === "registration/options") {
      const input = z.object({ grantId: identifier, label: z.string().trim().min(1).max(80) }).strict().parse(body);
      result = await registrationOptions(actor, input.grantId, input.label);
    } else if (request.method === "POST" && path === "registration/verify") {
      const input = z.object({ challengeId: identifier, response: registrationResponseSchema }).strict().parse(body);
      result = await verifyRegistration(actor, input.challengeId, input.response as RegistrationResponseJSON);
    } else if (segments[0] === "requests" && segments[1] && segments.length <= 3) {
      const id = identifier.parse(segments[1]);
      const operation = segments[2];
      if (request.method === "GET" && !operation) result = await getApproval(actor, id, request.headers.get("x-approval-token") ?? "");
      else if (request.method === "GET" && operation === "recordia") result = await exportApproval(actor, id);
      else if (request.method === "POST" && operation === "options") {
        const input = z.object({ token, decision: z.enum(["approved", "rejected"]) }).strict().parse(body);
        result = await approvalOptions(actor, id, input.token, input.decision);
      } else if (request.method === "POST" && operation === "confirm") {
        const input = z.object({ token, challengeId: identifier, response: authenticationResponseSchema }).strict().parse(body);
        result = await confirmApproval(actor, id, input.token, input.challengeId, input.response as AuthenticationResponseJSON);
      } else if (request.method === "POST" && operation === "consume") {
        z.object({}).strict().parse(body); result = await consumeApproval(actor, id);
      } else if (request.method === "POST" && operation === "cancel") {
        z.object({}).strict().parse(body); result = await cancelApproval(actor, id);
      } else throw new ApprovalError("Operación no disponible", 404);
    } else throw new ApprovalError("Operación no disponible", 404);
    return NextResponse.json(result, { headers });
  } catch (error) {
    const status = error instanceof z.ZodError ? 422 : error instanceof ApprovalError ? error.status : 400;
    const message = error instanceof z.ZodError ? "Datos de ensayo inválidos" : error instanceof ApprovalError ? error.message : "No fue posible verificar la operación. Recarga e intenta de nuevo.";
    return NextResponse.json({ error: message }, { status, headers });
  }
}
export const GET = handle;
export const POST = handle;
