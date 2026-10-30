import "server-only";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { readOfficer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAiHandler } from "@/lib/ai/handler";
import { createGeminiGenerator } from "@/lib/ai/gemini-provider";
import { AiError } from "@/lib/ai/errors";
import type { AiCase } from "@/lib/ai/context";

function config() {
  if (!process.env.GEMINI_API_KEY?.trim())
    throw new AiError("AI_NOT_CONFIGURED", 503);
  const parsed = z
    .object({
      key: z.string().trim().min(10),
      model: z
        .string()
        .trim()
        .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{1,99}$/),
    })
    .safeParse({
      key: process.env.GEMINI_API_KEY,
      model: process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite",
    });
  if (!parsed.success) throw new AiError("AI_INVALID_CONFIG", 503);
  return parsed.data;
}
async function loadCase(id: string): Promise<AiCase | null> {
  const supabase = await createClient();
  const [application, workflow, checklist] = await Promise.all([
    supabase
      .from("applications")
      .select(
        "id,certificate_type,annual_income,purpose,status,assigned_field_officer_id,updated_at",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("application_workflow")
      .select("*")
      .eq("application_id", id)
      .maybeSingle(),
    supabase
      .from("application_checklist")
      .select("label_kn,label_en,required,receipt_status,note")
      .eq("application_id", id)
      .order("key"),
  ]);
  if (application.error || workflow.error || checklist.error)
    throw new AiError("AI_UNAVAILABLE", 503);
  if (!application.data || !workflow.data) return null;
  return {
    application: application.data,
    workflow: workflow.data,
    checklist: checklist.data,
  };
}
export const handleAiRequest = createAiHandler({
  authenticate: async () => {
    const officer = await readOfficer();
    if (!officer) return null;
    if (!officer.profile) throw new AiError("AI_FORBIDDEN", 403);
    return { id: officer.profile.id, role: officer.profile.role };
  },
  load: loadCase,
  configured: () => {
    config();
  },
  reserve: async (id, feature, version) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("reserve_ai_request", {
      target_id: id,
      feature,
      expected_version: version,
    });
    if (error) {
      if (error.message === "AI_FORBIDDEN")
        throw new AiError("AI_FORBIDDEN", 403);
      if (error.message === "AI_STALE_CONTEXT")
        throw new AiError("AI_STALE_CONTEXT", 409);
      throw new AiError("AI_UNAVAILABLE", 503);
    }
    const limit = z
      .object({ allowed: z.boolean(), retry_after: z.number().int().min(0) })
      .safeParse(data);
    if (!limit.success) throw new AiError("AI_UNAVAILABLE", 503);
    if (!limit.data.allowed)
      throw new AiError(
        "AI_RATE_LIMITED",
        429,
        Math.max(1, limit.data.retry_after),
      );
  },
  generate: async (feature, input, context, signal) => {
    const settings = config();
    const client = new GoogleGenAI({ apiKey: settings.key, vertexai: false });
    return createGeminiGenerator(client, settings.model)(
      feature,
      input,
      context,
      signal,
    );
  },
});
