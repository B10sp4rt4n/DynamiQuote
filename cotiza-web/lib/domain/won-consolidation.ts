import { z } from "zod";

export const winRuleSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/),
  label: z.string().trim().min(3).max(100),
  approverRoles: z.array(z.enum(["owner", "admin", "user", "superadmin"])).max(4),
  approverUserIds: z.array(z.string().min(1).max(200)).max(30),
  allowSelfApproval: z.boolean(),
  evidenceRequired: z.boolean(),
  allowWaiver: z.boolean(),
  dependsOn: z.array(z.string()).max(20),
  minimumAmount: z.number().finite().nonnegative().max(1e12).nullable(),
  currency: z.enum(["MXN", "USD", "EUR"]).nullable(),
}).strict().refine(r => r.approverRoles.length + r.approverUserIds.length > 0, "Define quién autoriza cada requisito")
  .refine(r => r.minimumAmount === null || r.currency !== null, "Indica la moneda del umbral");
export const winPolicySchema = z.object({
  rules: z.array(winRuleSchema).max(20),
  reviewNoticeUserIds: z.array(z.string().min(1).max(200)).max(30).optional(),
  approvalEmailEnabled: z.boolean().optional(),
}).strict().superRefine(({ rules }, ctx) => {
  const ids = new Set(rules.map(r => r.id));
  if (ids.size !== rules.length) ctx.addIssue({ code: "custom", message: "Cada requisito necesita una clave única" });
  const done = new Set<string>(), visiting = new Set<string>();
  const byId = new Map(rules.map(rule => [rule.id, rule]));
  const visit = (id: string): boolean => {
    if (done.has(id)) return true;
    if (!ids.has(id) || visiting.has(id)) return false;
    visiting.add(id);
    if (!(byId.get(id)?.dependsOn ?? []).every(dep => visit(dep))) return false;
    visiting.delete(id); done.add(id); return true;
  };
  if (rules.some(r => !visit(r.id))) ctx.addIssue({ code: "custom", message: "Las dependencias deben existir y no formar ciclos" });
  // A conditional prerequisite may not apply. Reject such ambiguous policies.
  if (rules.some(r => r.dependsOn.some(id => rules.find(dep => dep.id === id)?.minimumAmount !== null))) {
    ctx.addIssue({ code: "custom", message: "Una dependencia debe ser un requisito sin umbral" });
  }
});
export type WinRule = z.infer<typeof winRuleSchema>;
export type WinPolicy = z.infer<typeof winPolicySchema>;
export type WinActor = { userId: string; userRole: "owner" | "admin" | "user" | "superadmin"; isSuperAdmin: boolean };
export type WinDecision = { decision: "approved" | "rejected" | "waived"; actorId: string; actorRole: string; evidence: string; recordedAt: string };
export type WinCase = {
  revision: number; policyRevision: number; rules: WinRule[]; fingerprint: string;
  acceptedOn: string; acceptedAt: string; acceptedBy: string; acceptanceEvidence: string;
  decisions: Record<string, WinDecision>; consolidatedAt: string | null; cancelledAt: string | null;
};
export type WinPolicyVersion = WinPolicy & { revision: number };
export type WinView = {
  people?: Record<string, string>;
  tenantId: string; proposalId: string; policy: WinPolicyVersion; case: WinCase | null;
  state: "not_accepted" | "pending" | "blocked" | "stale" | "consolidated" | "legacy" | "cancelled";
  canRecordAcceptance: boolean; canConsolidate: boolean; canCancel: boolean;
  requirements: Array<WinRule & { decision: WinDecision | null; canDecide: boolean; canWaive: boolean; waitingFor: string[] }>;
};
export const winActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("accept"), expectedRevision: z.number().int().nonnegative(), expectedPolicyRevision: z.number().int().nonnegative(), acceptedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), evidence: z.string().trim().min(3).max(2000) }).strict(),
  z.object({ action: z.literal("decide"), expectedRevision: z.number().int().positive(), ruleId: z.string(), decision: z.enum(["approved", "rejected", "waived"]), evidence: z.string().trim().max(2000) }).strict(),
  z.object({ action: z.enum(["consolidate", "cancel"]), expectedRevision: z.number().int().positive() }).strict(),
]);
export type WinAction = z.infer<typeof winActionSchema>;
export function isSatisfied(decision?: WinDecision | null) { return decision?.decision === "approved" || decision?.decision === "waived"; }
export function mayApprove(rule: WinRule, actor: WinActor, sellerId: string | null) {
  return (rule.allowSelfApproval || (sellerId !== null && sellerId !== actor.userId))
    && (rule.approverRoles.includes(actor.userRole) || rule.approverUserIds.includes(actor.userId));
}
export function applicableRules(policy: WinPolicy, amount: number, currency: string | null): WinRule[] {
  // Comparing an MXN threshold to USD is unsafe; require an explicit policy for that currency.
  if (policy.rules.some(r => r.minimumAmount !== null && r.currency !== currency)) {
    throw new Error("La moneda de la propuesta no coincide con un umbral. Ajusta la política antes de registrar la aceptación");
  }
  return policy.rules.filter(r => r.minimumAmount === null || amount >= r.minimumAmount);
}
