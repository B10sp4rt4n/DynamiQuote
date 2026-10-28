import { z } from "zod";
import { mexicoCalendarDate } from "./commercial-close-date";

export const dispositionSchema = z.object({
  state: z.enum(["open", "paused", "no_decision", "lost"]),
  reason: z.string().trim().min(3, "Indica un motivo de al menos 3 caracteres").max(500),
  resumeOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  revision: z.number().int().nonnegative(),
}).strict().superRefine((data, ctx) => {
  if (data.state === "paused" && !data.resumeOn) ctx.addIssue({ code: "custom", path: ["resumeOn"], message: "Elige una fecha para retomar" });
  if (data.state !== "paused" && data.resumeOn) ctx.addIssue({ code: "custom", path: ["resumeOn"], message: "La fecha solo corresponde a una pausa" });
  if (data.resumeOn) {
    const date = new Date(`${data.resumeOn}T12:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== data.resumeOn || data.resumeOn < mexicoCalendarDate(new Date()))
      ctx.addIssue({ code: "custom", path: ["resumeOn"], message: "La fecha para retomar debe ser hoy o posterior" });
  }
});
export type DispositionInput = z.infer<typeof dispositionSchema>;
const recordSchema = z.object({ state: z.enum(["open", "paused", "no_decision", "lost"]), reason: z.string(),
  resumeOn: z.string().nullable(), changedAt: z.string(), changedBy: z.string(), revision: z.number().int().positive(), taskId: z.string().nullable() });
export type OpportunityDisposition = z.infer<typeof recordSchema>;
export function readDisposition(metadata: unknown): OpportunityDisposition | null {
  const value = metadata && typeof metadata === "object" ? (metadata as Record<string,unknown>).commercialDisposition : null;
  const parsed = recordSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
export const DISPOSITION_LABELS = { open: "Abierta", paused: "Pausada", no_decision: "Cerrada sin decisión", lost: "Perdida", won: "Ganada" };
