import { z } from "zod";

export const RECURRING_CAPABILITY = "recurring_services_pilot";
export const RECURRING_TENANT_ID = "389b6cc1-2f8d-4fe4-bc3d-f50f92df3157";
export const RECURRING_TENANT_SLUG = "sys";
export class RecurringError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}

export function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString().slice(0, 10) === value && value >= "2000-01-01" && value <= "2199-12-31";
}
const date = z.string().refine(validDate, "Fecha inválida (2000–2199)");
const nullableDate = date.nullable();
const money = z.string().regex(/^(0|[1-9]\d{0,7})(\.\d{1,4})?$/, "Precio decimal no negativo, hasta 4 decimales").nullable();
const quantity = z.string().regex(/^(0|[1-9]\d{0,7})(\.\d{1,4})?$/, "Cantidad decimal válida").refine(v => /[1-9]/.test(v), "La cantidad debe ser mayor a cero").nullable();
const timezone = z.string().max(100).refine(v => { try { new Intl.DateTimeFormat("es-MX", { timeZone: v }); return true; } catch { return false; } }, "Zona horaria IANA inválida");
export const recurringTermsSchema = z.object({
  title: z.string().trim().min(3).max(150),
  clientId: z.string().min(1).max(200).nullable(),
  contractKind: z.enum(["month_to_month", "fixed_term"]).nullable(),
  startsOn: nullableDate, endsOn: nullableDate,
  autoRenew: z.boolean().nullable(), noticeDays: z.number().int().min(0).max(365).nullable(),
  cadence: z.enum(["monthly", "quarterly", "annual"]).nullable(),
  basis: z.enum(["advance", "arrears"]).nullable(),
  anchorDay: z.number().int().min(1).max(31).nullable(),
  timezone, dueDays: z.number().int().min(0).max(365).nullable(),
  currency: z.enum(["MXN", "USD", "EUR"]).nullable(),
  effectiveFrom: nullableDate,
  acceptanceEvidence: z.string().trim().max(2000),
  lines: z.array(z.object({
    lineId: z.string().min(1).max(100), description: z.string().trim().min(1).max(500),
    sku: z.string().trim().max(100).nullable(), quantity, unitPrice: money,
  }).strict()).max(50),
}).strict().superRefine((v, ctx) => {
  if (new Set(v.lines.map(l => l.lineId)).size !== v.lines.length) ctx.addIssue({code:"custom", message:"Cada partida necesita una identidad única"});
  if (v.startsOn && v.endsOn && v.endsOn <= v.startsOn) ctx.addIssue({code:"custom", message:"El fin exclusivo debe ser posterior al inicio"});
});
export type RecurringTerms = z.infer<typeof recurringTermsSchema>;
export type RecurringStatus = "draft" | "active" | "paused" | "ended";
export type RecurringPeriod = { start: string; end: string; prepareOn: string; dueOn: string; termsRevision: number; state: string };
export type RecurringRenewalReview = {
  state: "draft" | "ended" | "incomplete" | "open_ended" | "scheduled" | "expired" | "t30" | "t60" | "notice_due" | "current";
  asOf: string; timezone: string; endsOn: string | null; lastCoveredOn: string | null;
  daysToEnd: number | null; noticeOn: string | null; noticeDue: boolean; autoRenew: boolean | null;
};
export type RecurringView = {
  id: string; number: string; revision: number; status: RecurringStatus;
  terms: RecurringTerms; missing: string[]; periods: RecurringPeriod[];
  renewalReview: RecurringRenewalReview;
  createdAt: string; updatedAt: string;
};
export type RecurringWorkspace = { agreements: RecurringView[]; clients: { id: string; name: string }[]; hasMore: boolean; clientsTruncated: boolean };

export function missingTerms(t: RecurringTerms): string[] {
  const fields: [string, boolean][] = [
    ["Cliente", !!t.clientId], ["Modalidad contractual", !!t.contractKind], ["Inicio", !!t.startsOn],
    ["Fin del contrato fijo", t.contractKind !== "fixed_term" || !!t.endsOn],
    ["Renovación pactada", t.autoRenew !== null], ["Preaviso", t.noticeDays !== null],
    ["Periodicidad", !!t.cadence], ["Adelantado o vencido", !!t.basis], ["Día ancla", t.anchorDay !== null],
    ["Días de pago", t.dueDays !== null], ["Moneda", !!t.currency],
    ["Aceptación / contrato", t.acceptanceEvidence.length >= 3], ["Fecha efectiva", !!t.effectiveFrom],
    ["Partidas y precios", t.lines.length > 0 && t.lines.every(l => l.quantity !== null && l.unitPrice !== null)],
  ];
  return fields.filter(([, ok]) => !ok).map(([label]) => label);
}
export function assertActivatable(t: RecurringTerms) {
  const missing = missingTerms(t);
  if (missing.length) throw new RecurringError(`Completa: ${missing.join(", ")}`, 422);
  if (t.effectiveFrom !== t.startsOn) throw new RecurringError("La primera revisión debe empezar con el contrato", 422);
  if (dayOf(t.startsOn!) !== Math.min(t.anchorDay!, monthDays(t.startsOn!))) {
    throw new RecurringError("El inicio debe coincidir con el día ancla; los periodos parciales requieren revisión", 422);
  }
  if (t.endsOn && !isBoundary(t, t.endsOn)) throw new RecurringError("El fin no coincide con un periodo completo; requiere revisión", 422);
}
function dayOf(date: string) { return Number(date.slice(8,10)); }
function monthDays(date: string) { return new Date(Date.UTC(Number(date.slice(0,4)), Number(date.slice(5,7)), 0)).getUTCDate(); }
const step = (cadence: RecurringTerms["cadence"]) => cadence === "monthly" ? 1 : cadence === "quarterly" ? 3 : 12;
export function boundary(t: RecurringTerms, index: number): string {
  if (!t.startsOn || !t.cadence || !t.anchorDay) throw new RecurringError("Calendario incompleto", 422);
  const d = new Date(`${t.startsOn}T00:00:00Z`);
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + step(t.cadence) * index);
  const year = d.getUTCFullYear(), month = d.getUTCMonth();
  const value = new Date(Date.UTC(year, month, Math.min(t.anchorDay, new Date(Date.UTC(year,month+1,0)).getUTCDate()))).toISOString().slice(0,10);
  if (!validDate(value)) throw new RecurringError("Calendario fuera del intervalo permitido", 422);
  return value;
}
export function isBoundary(t: RecurringTerms, value: string): boolean {
  if (!t.startsOn || !t.cadence || !validDate(value) || value < t.startsOn) return false;
  const months = (Number(value.slice(0,4))-Number(t.startsOn.slice(0,4)))*12 + Number(value.slice(5,7))-Number(t.startsOn.slice(5,7));
  return months % step(t.cadence) === 0 && boundary(t, months/step(t.cadence)) === value;
}
export function todayInZone(zone:string, at:Date = new Date()):string {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(at);
  const part=(type:string)=>parts.find(p=>p.type===type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** Read-only contract review. End is exclusive; billing dates and supplier coverage are independent. */
export function reviewRecurringRenewal(
  terms: RecurringTerms, status: RecurringStatus, at: Date = new Date(),
): RecurringRenewalReview {
  const asOf = todayInZone(terms.timezone, at);
  const review: RecurringRenewalReview = {
    state: "incomplete", asOf, timezone: terms.timezone, endsOn: terms.endsOn,
    lastCoveredOn: null, daysToEnd: null, noticeOn: null, noticeDue: false, autoRenew: terms.autoRenew,
  };
  if (status === "draft" || status === "ended") return { ...review, state: status };
  if (!terms.startsOn || !validDate(terms.startsOn)) return review;
  if (!terms.endsOn) {
    return { ...review, state: terms.contractKind === "month_to_month" ? "open_ended" : "incomplete" };
  }
  if (!validDate(terms.endsOn) || terms.endsOn <= terms.startsOn) return review;
  // Subtract civil dates in UTC only after resolving today's date in the agreement's zone.
  // This counts calendar days across DST rather than treating a local day as 24 hours.
  const shift = (value: string, days: number) =>
    new Date(Date.parse(`${value}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
  review.lastCoveredOn = shift(terms.endsOn, -1);
  review.daysToEnd = (Date.parse(`${terms.endsOn}T00:00:00Z`) - Date.parse(`${asOf}T00:00:00Z`)) / 86_400_000;
  if (terms.noticeDays !== null) review.noticeOn = shift(terms.endsOn, -terms.noticeDays);
  review.noticeDue = review.noticeOn !== null && asOf >= review.noticeOn;
  review.state = review.daysToEnd <= 0 ? "expired"
    : asOf < terms.startsOn ? "scheduled"
    : review.daysToEnd <= 30 ? "t30"
    : review.daysToEnd <= 60 ? "t60"
    : review.noticeDue ? "notice_due" : "current";
  return review;
}
function plusDays(date: string, count: number) {
  const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate()+count);
  const value = d.toISOString().slice(0,10);
  if (!validDate(value)) throw new RecurringError("Fecha de pago fuera del intervalo permitido", 422);
  return value;
}
/** Pure local calendar: never emits documents, computes totals, or changes a contract. */
export function planPeriods(t: RecurringTerms, from: string, count: number): RecurringPeriod[] {
  if (!Number.isInteger(count) || count < 1 || count > 24 || !validDate(from) || !isBoundary(t, from)) throw new RecurringError("Selecciona un límite de periodo y entre 1 y 24 periodos", 422);
  const months=(Number(from.slice(0,4))-Number(t.startsOn!.slice(0,4)))*12+Number(from.slice(5,7))-Number(t.startsOn!.slice(5,7));
  const offset=months/step(t.cadence), result: RecurringPeriod[]=[];
  for(let i=0;i<count;i++) {
    const start=boundary(t,offset+i), end=boundary(t,offset+i+1);
    if(t.endsOn && end>t.endsOn) break;
    const prepareOn=t.basis==="advance"?start:end;
    result.push({start,end,prepareOn,dueOn:plusDays(prepareOn,t.dueDays!),termsRevision:0,state:"planned"});
  }
  if(!result.length) throw new RecurringError("No hay periodos completos dentro de la vigencia",422);
  return result;
}

const revision=z.number().int().positive();
export const recurringActionSchema=z.discriminatedUnion("action",[
  z.object({action:z.literal("create"),requestId:z.string().uuid(),terms:recurringTermsSchema}).strict(),
  z.object({action:z.literal("revise"),id:z.string().uuid(),expectedRevision:revision,terms:recurringTermsSchema}).strict(),
  z.object({action:z.enum(["activate","pause","end"]),id:z.string().uuid(),expectedRevision:revision,evidence:z.string().trim().min(3).max(2000)}).strict(),
  z.object({action:z.literal("resume"),id:z.string().uuid(),expectedRevision:revision,resumeOn:date,evidence:z.string().trim().min(3).max(2000)}).strict(),
  z.object({action:z.literal("generate"),id:z.string().uuid(),expectedRevision:revision,from:date,count:z.number().int().min(1).max(24)}).strict(),
]);
export type RecurringAction=z.infer<typeof recurringActionSchema>;

/** Commercial pilot policy, separate from the extensible calendar model. */
export function subscriptionMode(t: RecurringTerms): "monthly" | "annual" | null {
  if (t.contractKind === "month_to_month" && t.cadence === "monthly") return "monthly";
  if (t.contractKind === "fixed_term" && t.cadence === "annual") return "annual";
  return null;
}
export function assertSubscriptionPilot(t: RecurringTerms): void {
  // Incomplete drafts remain possible, but known unsupported choices are rejected.
  if (t.cadence === "quarterly" || (t.contractKind && t.cadence && !subscriptionMode(t))) {
    throw new RecurringError("El piloto admite mensual renovable y anual con pago único. Anual facturado mensualmente queda previsto para después.", 422);
  }
  if (subscriptionMode(t) === "annual" && t.startsOn && t.endsOn && t.anchorDay) {
    if (t.endsOn !== boundary(t, 1)) throw new RecurringError("El acuerdo anual debe cubrir un solo periodo de doce meses; confirma su fin exclusivo.", 422);
  }
}
