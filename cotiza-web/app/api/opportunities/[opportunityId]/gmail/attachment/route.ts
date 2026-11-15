import { gmailAttachment } from "@/lib/integrations/gmail/routes";
export const runtime="nodejs";
export async function GET(request:Request,context:{params:Promise<{opportunityId:string}>}) {
  return gmailAttachment(request,(await context.params).opportunityId);
}
