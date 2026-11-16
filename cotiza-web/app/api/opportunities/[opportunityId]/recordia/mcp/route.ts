import { handleRecordiaMcp } from "@/lib/integrations/recordia/mcp";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export async function POST(request: Request, context: { params: Promise<{ opportunityId: string }> }) {
  return handleRecordiaMcp(request, (await context.params).opportunityId);
}
