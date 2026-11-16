import { ApprovalError } from "@/lib/domain/verified-authorization";

export function checkApprovalPost(request: Request, origin: string, tenantId: string) {
  if (request.headers.get("origin") !== origin || new URL(request.url).origin !== origin) throw new ApprovalError("Origen de confirmación no permitido");
  if (request.headers.get("x-approval-tenant") !== tenantId) throw new ApprovalError("La empresa del ensayo cambió. Recarga la pantalla.", 409);
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") throw new ApprovalError("Se requiere JSON", 415);
  if (Number(request.headers.get("content-length") ?? 0) > 65_536) throw new ApprovalError("Solicitud demasiado grande", 413);
}
