import { z } from "zod";
import { reasonLabel, type Recipient } from "./won";
// Validate stored events as well as newly captured ones before rendering or delivering.
export const wonEventSchema = z.object({
  schema_version: z.literal("1.0.0"), event_id: z.string().uuid(), tenant_id: z.string().min(1),
  event_type: z.literal("opportunity.closed_won"), opportunity_id: z.string().min(1),
  closed_on: z.string(), occurred_at: z.string(),
  opportunity: z.object({ folio: z.string(), title: z.string(), owner_user_id: z.string(),
    customer: z.object({ id: z.string(), name: z.string() }),
    winning_proposal: z.object({ id: z.string(), folio: z.string(), version: z.number().int().positive(), amount: z.string(), currency: z.string(), amount_basis: z.literal("net_before_tax") }),
  }),
  notification: z.object({ recipients: z.array(z.object({ user_id: z.string(), reasons: z.array(z.enum(["opportunity_owner", "tenant_designated"])), channels: z.array(z.enum(["email", "in_app"])) })) }),
});
export type WonEvent = z.infer<typeof wonEventSchema>;
export function renderWonMessage(event: WonEvent, reasons: Recipient["reasons"], baseUrl?: string) {
  const proposal = event.opportunity.winning_proposal;
  const linkPath = `/propuestas/${encodeURIComponent(proposal.id)}`;
  return {
    subject: `Oportunidad ganada · ${event.opportunity.folio}`.replace(/[\r\n]/g, " "),
    text: `Se registró como ganada la oportunidad ${event.opportunity.folio}: ${event.opportunity.title}.\n\nCliente: ${event.opportunity.customer.name}\nPropuesta ganadora: ${proposal.folio} · Revisión ${proposal.version}\nImporte neto antes de impuestos: ${proposal.amount} ${proposal.currency}\nFecha comercial de cierre: ${event.closed_on}\nFecha de registro: ${event.occurred_at}\n\nRecibes este aviso como: ${[...new Set(reasons)].map(r => reasonLabel[r]).join(" y ")}.\n\nVer propuesta: ${baseUrl ? new URL(linkPath, baseUrl).href : linkPath}\n\nCotiza`,
    linkPath,
  };
}
export function deliveryFlags() {
  const pilot = process.env.COTIZA_WON_EVENT_PILOT === "true";
  return { inApp: pilot && process.env.COTIZA_WON_IN_APP_ENABLED === "true", email: pilot && process.env.COTIZA_WON_EMAIL_ENABLED === "true" };
}
