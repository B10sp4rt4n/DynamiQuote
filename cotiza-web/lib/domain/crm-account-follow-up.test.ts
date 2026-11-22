import { expect, it } from "vitest";
import type { OpportunityWithStage } from "@/lib/db/opportunities";
import type { PendingTask } from "@/lib/db/tasks";
import { accountMatchesFilter, accountNextAction, buildAccountFollowUps, sortAccountsForFilter } from "./crm-account-follow-up";

const today = "2026-11-22";
const opportunity = (clientId: string, stage: OpportunityWithStage["stage"], id = clientId): OpportunityWithStage => ({
  clientId, stage, opportunityId: id, opportunityNumber: `OPP-${id}`, title: `Negocio ${id}`, createdAt: "2026-10-01T06:00:00Z",
  closedAt: stage === "won" ? "2026-11-21T06:00:00Z" : null, expectedCloseDate: null, clientCompany: clientId, amount: 100, lifetimeDays: null, ownerUserId: "user-a",
});
const task = (clientId: string, dueDate = "2026-11-20T00:00:00Z"): PendingTask => ({ clientId, clientCompany: clientId,
  taskId: `task-${clientId}`, description: `Revisar entrega de ${clientId}`, dueDate, opportunityId: clientId, opportunityNumber: `OPP-${clientId}` });

it("prioritizes an overdue task instead of the first alphabetical account with a won business", () => {
  const accounts = buildAccountFollowUps([{ clientId: "won", company: "Alfredo" }, { clientId: "open", company: "Beta" }, { clientId: "task", company: "Zeta" }],
    [opportunity("won", "won"), opportunity("open", "open")], [task("task")], today);
  expect(accounts.filter(account => accountMatchesFilter(account, "attention")).map(account => account.clientId)).toEqual(["task", "open"]);
  const won = accounts.find(account => account.clientId === "won")!;
  expect(won.needsAttention).toBe(false);
  expect(accountNextAction(won, "won", today)).toMatchObject({ label: "Ganada", action: "Ver cierre", href: "/oportunidades/won" });
});

it("keeps real post-sale tasks actionable without presenting the won opportunity as open", () => {
  const [account] = buildAccountFollowUps([{ clientId: "won", company: "Ganada con entrega pendiente" }], [opportunity("won", "won")], [task("won")], today);
  expect(account.open).toHaveLength(0); expect(account.won).toHaveLength(1); expect(account.needsAttention).toBe(true);
  expect(accountNextAction(account, "attention", today)).toMatchObject({ label: "Tarea vencida", action: "Revisar tarea", href: "/oportunidades/won#pendientes" });
  expect(accountNextAction(account, "won", today).action).toBe("Ver cierre");
  const [completed] = buildAccountFollowUps([{ clientId: "won", company: "Ganada con entrega pendiente" }], [opportunity("won", "won")], [], today);
  expect(completed.needsAttention).toBe(false);
});

it("represents accounts with both open and won opportunities and links each filter to the right business", () => {
  const [account] = buildAccountFollowUps([{ clientId: "mixed", company: "Mixta" }], [opportunity("mixed", "won", "closed"), opportunity("mixed", "open", "current")], [], today);
  expect(accountMatchesFilter(account, "open")).toBe(true); expect(accountMatchesFilter(account, "won")).toBe(true);
  expect(accountNextAction(account, "open", today).href).toBe("/oportunidades/current");
  expect(accountNextAction(account, "won", today).href).toBe("/oportunidades/closed");
});

it("sorts wins by actual close date and leaves historical missing dates explicit", () => {
  const historical = { ...opportunity("old", "won"), closedAt: null, createdAt: "2026-11-22T15:00:00Z" };
  const recent = { ...opportunity("recent", "won"), closedAt: "2026-11-23T02:00:00Z" };
  const accounts = buildAccountFollowUps([{ clientId: "old", company: "A" }, { clientId: "recent", company: "Z" }], [historical, recent], [], today);
  const sorted = sortAccountsForFilter(accounts, "won"); expect(sorted.map(account => account.clientId)).toEqual(["recent", "old"]);
  expect(accountNextAction(sorted[0]!, "won", today).date).toBe("Cierre: 22 nov 2026");
  expect(accountNextAction(sorted[1]!, "won", today).date).toBe("Cierre sin fecha registrada");
});

it("keeps date-only tasks on their selected calendar day and does not shift tomorrow to today", () => {
  const [account] = buildAccountFollowUps([{ clientId: "next", company: "Próxima" }], [], [task("next", "2026-11-23T00:00:00Z")], today);
  expect(accountNextAction(account, "attention", today)).toMatchObject({ label: "Tarea programada", date: "23 nov 2026", href: "/clientes/next" });
});

it("does not follow a task's reference to a different account's opportunity", () => {
  const [account] = buildAccountFollowUps([{ clientId: "a", company: "A" }], [opportunity("b", "open", "foreign")], [{ ...task("a"), opportunityId: "foreign" }], today);
  expect(accountNextAction(account, "attention", today).href).toBe("/clientes/a");
});

it("exposes a due pause for review while retaining its paused status", () => {
  const paused = { ...opportunity("pause", "paused"), disposition: { state: "paused" as const, reason: "Retomar en fecha", resumeOn: today, changedAt: "2026-11-20", changedBy: "user-a", revision: 1, taskId: null } };
  const [account] = buildAccountFollowUps([{ clientId: "pause", company: "Pausa" }], [paused], [], today);
  expect(account.needsAttention).toBe(true); expect(account.open).toHaveLength(0);
  expect(accountNextAction(account, "attention", today)).toMatchObject({ label: "Pausa por revisar", action: "Revisar pausa" });
});

it("uses recent commercial activity to order undated open accounts instead of alphabetical order", () => {
  const accounts = buildAccountFollowUps([{ clientId: "old", company: "A" }, { clientId: "new", company: "Z" }], [opportunity("old", "open"),
    { ...opportunity("new", "open"), createdAt: "2026-11-22T06:00:00Z" }], [], today);
  expect(accounts.map(account => account.clientId)).toEqual(["new", "old"]);
});

it("shows an overdue expected close before a future task on the same account", () => {
  const [account] = buildAccountFollowUps([{ clientId: "a", company: "A" }], [{ ...opportunity("a", "open"), expectedCloseDate: "2026-11-20" }],
    [task("a", "2026-11-25T00:00:00Z")], today);
  expect(accountNextAction(account, "attention", today)).toMatchObject({ label: "Cierre esperado vencido", action: "Continuar oportunidad" });
});
