import { handleAiRequest } from "@/services/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Leave room for authorization and database rechecks around the 30s provider call.
export const maxDuration = 60;
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; feature: string }> },
) {
  return handleAiRequest(request, await context.params);
}
