import { handleReadingRequest } from "@/services/reading-view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleReadingRequest(request, (await context.params).id);
}
