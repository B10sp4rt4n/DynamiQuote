import type { ClientSummary } from "@/lib/db/clients";
import type { OpportunityWithStage } from "@/lib/db/opportunities";
import type { PendingTask } from "@/lib/db/tasks";
import { mexicoCalendarDate } from "./commercial-close-date";

export type AccountFilter = "attention" | "open" | "won" | "all";
type Opportunity = Pick<OpportunityWithStage, "opportunityId" | "opportunityNumber" | "clientId" | "title" | "stage" | "createdAt" | "closedAt" | "expectedCloseDate" | "disposition">;
export type AccountFollowUp = {
  clientId: string; company: string; opportunities: Opportunity[]; tasks: PendingTask[];
  open: Opportunity[]; won: Opportunity[]; paused: Opportunity[];
  needsAttention: boolean; rank: number; sortDate: string; activityAt: string;
};

// Task due dates and expected closing dates are calendar selections stored at UTC midnight.
export function selectedDay(value: string | null | undefined): string {
  return value && Number.isFinite(new Date(value).getTime()) ? value.slice(0, 10) : "";
}
const byOpenDate = (a: Opportunity, b: Opportunity) =>
  (selectedDay(a.expectedCloseDate) || "9999").localeCompare(selectedDay(b.expectedCloseDate) || "9999") || b.createdAt.localeCompare(a.createdAt);
const winDate = (opportunity?: Opportunity) => opportunity?.closedAt || "";

export function buildAccountFollowUps(clients: Pick<ClientSummary, "clientId" | "company">[], opportunities: Opportunity[], tasks: PendingTask[], today: string): AccountFollowUp[] {
  return clients.map(client => {
    const related = opportunities.filter(opportunity => opportunity.clientId === client.clientId);
    const open = related.filter(opportunity => opportunity.stage === "open").sort(byOpenDate);
    const won = related.filter(opportunity => opportunity.stage === "won").sort((a, b) => winDate(b).localeCompare(winDate(a)) || b.createdAt.localeCompare(a.createdAt));
    const paused = related.filter(opportunity => opportunity.stage === "paused").sort((a, b) =>
      (selectedDay(a.disposition?.resumeOn) || "9999").localeCompare(selectedDay(b.disposition?.resumeOn) || "9999"));
    const pending = tasks.filter(task => task.clientId === client.clientId).sort((a, b) =>
      (selectedDay(a.dueDate) || "9999").localeCompare(selectedDay(b.dueDate) || "9999") || a.taskId.localeCompare(b.taskId));
    const due = selectedDay(pending[0]?.dueDate);
    const close = selectedDay(open[0]?.expectedCloseDate);
    const resume = paused.map(opportunity => selectedDay(opportunity.disposition?.resumeOn)).filter(day => day && day <= today).sort()[0];
    const rank = due && due < today ? 0 : due === today ? 1 : close && close <= today ? 2 : pending.length ? 3 : resume ? 4 : open.length ? 5 : won.length ? 6 : paused.length ? 7 : related.length ? 8 : 9;
    const sortDate = rank <= 1 || rank === 3 ? due || "9999" : rank === 2 || rank === 5 ? close || "9999" : rank === 4 ? resume! : "9999";
    const activityAt = related.map(opportunity => opportunity.closedAt || opportunity.createdAt).sort().at(-1) || "";
    return { ...client, opportunities: related, tasks: pending, open, won, paused, needsAttention: Boolean(pending.length || open.length || resume), rank, sortDate, activityAt };
  }).sort((a, b) => a.rank - b.rank || a.sortDate.localeCompare(b.sortDate) ||
    b.activityAt.localeCompare(a.activityAt) || a.company.localeCompare(b.company, "es"));
}

export function accountMatchesFilter(account: AccountFollowUp, filter: AccountFilter): boolean {
  return filter === "all" || (filter === "attention" ? account.needsAttention : account[filter].length > 0);
}

export function sortAccountsForFilter(accounts: AccountFollowUp[], filter: AccountFilter): AccountFollowUp[] {
  if (filter !== "won") return accounts;
  return [...accounts].sort((a, b) => winDate(b.won[0]).localeCompare(winDate(a.won[0])) || a.company.localeCompare(b.company, "es"));
}

function displayDay(day: string) {
  return day ? new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`)) : "Fecha por confirmar";
}

export function accountNextAction(account: AccountFollowUp, filter: AccountFilter, today: string) {
  const accountHref = `/clientes/${encodeURIComponent(account.clientId)}`;
  const task = account.tasks[0];
  if (task && filter !== "won" && filter !== "open" && account.rank !== 2) {
    const due = selectedDay(task.dueDate);
    const linked = account.opportunities.find(opportunity => opportunity.opportunityId === task.opportunityId);
    return { kind: "task", label: due && due < today ? "Tarea vencida" : due === today ? "Tarea para hoy" : "Tarea programada",
      detail: task.description, date: displayDay(due), action: "Revisar tarea",
      href: linked ? `/oportunidades/${encodeURIComponent(linked.opportunityId)}#pendientes` : accountHref };
  }
  const duePause = account.paused.find(opportunity => {
    const resume = selectedDay(opportunity.disposition?.resumeOn); return resume && resume <= today;
  });
  const opportunity = filter === "won" ? account.won[0] : filter === "attention" && duePause && !account.open.length ? duePause
    : account.open[0] ?? account.won[0] ?? account.paused[0] ?? account.opportunities[0];
  if (!opportunity) return { kind: "account", label: "Sin oportunidades vinculadas", detail: "Consulta el historial de esta cuenta.", date: "", action: "Ver cuenta", href: accountHref };
  const href = `/oportunidades/${encodeURIComponent(opportunity.opportunityId)}`;
  const detail = `${opportunity.opportunityNumber} · ${opportunity.title}`;
  if (opportunity.stage === "won") return { kind: "won", label: "Ganada", detail,
    date: opportunity.closedAt ? `Cierre: ${displayDay(mexicoCalendarDate(opportunity.closedAt))}` : "Cierre sin fecha registrada", action: "Ver cierre", href };
  if (opportunity.stage === "open") {
    const close = selectedDay(opportunity.expectedCloseDate);
    return { kind: "open", label: close && close < today ? "Cierre esperado vencido" : close === today ? "Cierre esperado hoy" : "Oportunidad abierta", detail,
      date: close ? `Cierre esperado: ${displayDay(close)}` : "Sin fecha de cierre esperado", action: "Continuar oportunidad", href };
  }
  return { kind: opportunity.stage, label: opportunity.stage === "paused" ? (opportunity === duePause ? "Pausa por revisar" : "Oportunidad pausada") : opportunity.stage === "lost" ? "Perdida" : "Cerrada sin decisión",
    detail, date: "", action: opportunity.stage === "paused" ? "Revisar pausa" : "Ver resultado", href };
}
