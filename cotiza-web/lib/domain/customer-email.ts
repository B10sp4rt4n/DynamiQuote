import { z } from "zod";

export const customerEmailSchema = z.object({
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  senderName: z.string().max(200).nullable(),
  senderEmail: z.string().max(300).nullable(),
  fromHeader: z.string().max(2000),
  sentAt: z.iso.datetime().nullable(),
  dateHeader: z.string().max(500),
  subject: z.string().max(1000),
  messageId: z.string().max(1000).nullable(),
  inReplyTo: z.string().max(1000).nullable(),
  replyText: z.string().max(20000),
  quotedContext: z.string().max(20000),
  textTruncated: z.boolean(),
  warnings: z.array(z.string().max(500)).max(8),
}).strict();
export type CustomerEmail = z.infer<typeof customerEmailSchema>;
export const customerEmailPreviewSchema = z.object({ email: customerEmailSchema, acceptedOn: z.iso.date().nullable(), suggestedEvidence: z.string().max(20000) });
export type CustomerEmailPreview = z.infer<typeof customerEmailPreviewSchema>;
