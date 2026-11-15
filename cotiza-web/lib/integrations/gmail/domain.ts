export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export class GmailError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}
export type GmailActor = { tenantId: string; actorId: string };
export type GmailTarget = GmailActor & { opportunityId: string; clientId: string };
export type GmailAttachment = { partId: string; filename: string; mimeType: string; size: number;
  sha256: string; data: string };
export type GmailSnapshot = {
  messageId: string; threadId: string; internetMessageId: string; subject: string;
  from: string; to: string; cc: string; date: string; receivedAt: string;
  bodyText: string; bodyFormat: "plain" | "html_as_text" | "unavailable";
  attachments: GmailAttachment[]; observedAt: string;
};
export type GmailMessageView = Omit<GmailSnapshot, "attachments"> & {
  attachments: Omit<GmailAttachment, "data">[];
};
export type GmailLink = { linkId: string; snapshotHash: string; linkedAt: string; message: GmailMessageView };
export type GmailConnectionView = { email: string; status: string } | null;
export function messageView(snapshot: GmailSnapshot): GmailMessageView {
  return { ...snapshot, attachments: snapshot.attachments.map(attachment => ({ partId: attachment.partId,
    filename: attachment.filename, mimeType: attachment.mimeType, size: attachment.size, sha256: attachment.sha256 })) };
}
