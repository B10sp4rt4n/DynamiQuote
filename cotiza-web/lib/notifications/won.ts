import { z } from "zod";
export const wonPolicySchema = z.object({
  enabled: z.boolean(), includeOwner: z.boolean(),
  designatedUserIds: z.array(z.string().min(1)).max(30).transform(ids => [...new Set(ids)]),
});
export type WonPolicy = z.infer<typeof wonPolicySchema> & { version: number };
export type Recipient = { user_id: string; reasons: ("opportunity_owner" | "tenant_designated")[]; channels: ("in_app" | "email")[] };
export function wonRecipients(owner: string | null, policy: WonPolicy, activeUserIds: string[]): Recipient[] {
  if (!policy.enabled) return [];
  const eligible = new Set(activeUserIds);
  const recipients = new Map<string, Recipient>();
  function add(id: string, reason: Recipient["reasons"][number]) {
    if (!eligible.has(id)) return;
    const r = recipients.get(id) ?? { user_id: id, reasons: [], channels: ["in_app", "email"] };
    if (!r.reasons.includes(reason)) r.reasons.push(reason);
    recipients.set(id, r);
  }
  if (policy.includeOwner && owner) add(owner, "opportunity_owner");
  for (const id of policy.designatedUserIds) add(id, "tenant_designated");
  return [...recipients.values()];
}
// Delivery identity is separate from role: two roles never create two emails.
// Also collapse accounts sharing a normalized mailbox, without merging in-app IDs.
export function emailPreview(recipients: Recipient[], users: { user_id: string; email: string | null }[]) {
  const mailboxes = new Map<string, { email: string; userIds: string[]; reasons: Recipient["reasons"] }>();
  for (const r of recipients) {
    if (!r.channels.includes("email")) continue;
    const email = users.find(u => u.user_id === r.user_id)?.email?.trim().toLowerCase();
    if (!email || !z.email().safeParse(email).success) continue;
    const existing = mailboxes.get(email) ?? { email, userIds: [], reasons: [] };
    if (!existing.userIds.includes(r.user_id)) existing.userIds.push(r.user_id);
    existing.reasons = [...new Set([...existing.reasons, ...r.reasons])];
    mailboxes.set(email, existing);
  }
  return [...mailboxes.values()];
}
export const reasonLabel = { opportunity_owner: "Responsable de la oportunidad", tenant_designated: "Designado por administración" };
