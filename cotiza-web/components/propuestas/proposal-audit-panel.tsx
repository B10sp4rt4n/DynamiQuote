import type { ProposalAuditTimelineItem } from "@/lib/db/proposal-audit";

const STATUS_LABELS: Record<string, string> = {
  approved: "Aprobada",
  draft: "Borrador",
  expired: "Vencida",
  in_review: "En revisión",
  rejected: "Rechazada",
  sent: "Enviada",
};

const VIA_LABELS: Record<string, string> = {
  email: "correo",
  pdf: "PDF",
  xlsx: "Excel",
};

const DECISION_LABELS: Record<string, string> = {
  approved: "aprobada",
  overridden: "override",
  rejected: "rechazada",
};

type Tone = "neutral" | "ok" | "warn";

function statusLabel(value: unknown): string {
  return typeof value === "string" ? (STATUS_LABELS[value] ?? value) : "—";
}

function viaLabel(value: unknown): string {
  return typeof value === "string" ? (VIA_LABELS[value] ?? value) : "documento";
}

function describe(item: ProposalAuditTimelineItem): { detail: string | null; title: string; tone: Tone } {
  const d = item.details;

  switch (item.type) {
    case "status_change_requested": {
      const isApprovalRequest =
        d["fromStatus"] === "draft" && (d["requestedStatus"] === "approved" || d["requestedStatus"] === "in_review");
      const title = isApprovalRequest ? "Solicitud de aprobación" : "Cambio de estatus solicitado";

      if (d["ok"] === false) {
        return { detail: `No se pudo: ${String(d["error"] ?? "error desconocido")}`, title, tone: "warn" };
      }

      const margin = typeof d["marginPct"] === "number" ? ` · margen ${d["marginPct"]}%` : "";
      return {
        detail: `${statusLabel(d["fromStatus"])} → ${statusLabel(d["resultStatus"])}${margin}`,
        title,
        tone: "ok",
      };
    }
    case "document_issued": {
      const notes = [
        `estatus ${statusLabel(d["status"])}`,
        d["watermark"] === true ? "con marca de agua (no validado)" : null,
        d["forced"] === true ? "emisión forzada" : null,
      ].filter(Boolean);
      return {
        detail: notes.join(" · "),
        title: d["via"] === "email" ? "Enviada por correo (al vendedor)" : `${viaLabel(d["via"])} descargado`.replace(/^./, (c) => c.toUpperCase()),
        tone: d["watermark"] === true ? "warn" : "neutral",
      };
    }
    case "document_blocked":
      return {
        detail: String(d["reason"] ?? ""),
        title: `Intento bloqueado de emitir ${viaLabel(d["via"])}`,
        tone: "warn",
      };
    case "approval_decision": {
      const reason = typeof d["reason"] === "string" && d["reason"] ? ` — ${d["reason"]}` : "";
      return {
        detail: `${String(d["approverRole"] ?? "")}${reason}`,
        title: `Aprobación registrada: ${DECISION_LABELS[String(d["decision"])] ?? String(d["decision"])}`,
        tone: d["decision"] === "rejected" ? "warn" : "ok",
      };
    }
    case "proposal_force_issue_consumed":
      return { detail: `vía ${viaLabel(d["consumedVia"])}`, title: "Emisión forzada consumida", tone: "warn" };
    case "margin_override_window_granted":
      return { detail: null, title: "Ventana de override de margen otorgada", tone: "neutral" };
    case "margin_override_denied":
      return { detail: null, title: "Override de margen denegado", tone: "warn" };
    default:
      return { detail: null, title: item.type, tone: "neutral" };
  }
}

const TONE_DOT: Record<Tone, string> = {
  neutral: "bg-zinc-400",
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
};

function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    timeZone: "America/Mexico_City",
    year: "numeric",
  }).format(new Date(iso));
}

// Historial de solicitudes y emision de documentos -- solo lectura, solo
// para owner/admin/superadmin (la pagina decide si lo monta). Salvador,
// 2026-09-19: hoy no habia forma de saber si un vendedor pidio aprobacion,
// bajo el PDF de un borrador o si un intento fallo.
export function ProposalAuditPanel({ items }: { items: ProposalAuditTimelineItem[] }) {
  return (
    <details className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm" open>
      <summary className="cursor-pointer text-sm font-semibold text-zinc-900">
        Historial ({items.length})
      </summary>

      {items.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">
          Sin eventos registrados. El historial de solicitudes y documentos empezó a registrarse el 19 de septiembre de
          2026 — no incluye lo anterior a esa fecha.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-zinc-100">
          {items.map((item) => {
            const { detail, title, tone } = describe(item);
            return (
              <li className="flex gap-3 py-2 text-sm" key={item.id}>
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TONE_DOT[tone]}`} />
                <div className="min-w-0">
                  <p className="font-medium text-zinc-900">{title}</p>
                  {detail ? <p className="text-zinc-600">{detail}</p> : null}
                  <p className="text-xs text-zinc-500">
                    {formatWhen(item.createdAt)}
                    {item.actorName ? ` · ${item.actorName}` : ""}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </details>
  );
}
