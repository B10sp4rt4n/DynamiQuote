import "server-only";
import { after } from "next/server";
import { sendApprovalNotices } from "./approval-notice";
export function scheduleApprovalEmails(tenantId: string, proposalId: string) {
  if (process.env.VERCEL_ENV !== "production" && !(process.env.NODE_ENV === "production" && !process.env.VERCEL_ENV && process.env.APP_ENV === "production")) return;
  after(async () => {
    try {
      const result = await sendApprovalNotices(tenantId, proposalId);
      if (result.issues) console.error("[approval-email] Avisos con entrega pendiente de verificar", { tenantId, proposalId, issues: result.issues });
    } catch { console.error("[approval-email] No se pudo completar la notificación", { tenantId, proposalId }); }
  });
}
