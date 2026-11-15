import { gmailGet,gmailPost } from "@/lib/integrations/gmail/routes";
export const runtime="nodejs";
type Context={params:Promise<{opportunityId:string}>};
export async function GET(request:Request,context:Context) {return gmailGet(request,(await context.params).opportunityId);}
export async function POST(request:Request,context:Context) {return gmailPost(request,(await context.params).opportunityId);}
