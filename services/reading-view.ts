import "server-only";
import { GoogleGenAI } from "@google/genai";
import { readOfficer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getGeminiConfig } from "@/lib/ai/config";
import { AiError } from "@/lib/ai/errors";
import { readingFields, type ReadingSnapshot } from "@/lib/ai/reading-view";
import { createReadingHandler } from "@/lib/ai/reading-handler";
import { createReadingGenerator } from "@/lib/ai/reading-provider";
import { createReadingLimiter } from "@/lib/ai/reading-limiter";

const readingProcess = globalThis as typeof globalThis & {
  sevasathiReadingLimiter?: ReturnType<typeof createReadingLimiter>;
};
const acquire = readingProcess.sevasathiReadingLimiter ??= createReadingLimiter();

async function load(id: string, field: string): Promise<ReadingSnapshot | null> {
  const client = await createClient();
  const [application, workflow, notes, checklist] = await Promise.all([
    client.from("applications")
      .select("applicant_name,village,district,taluk,purpose,field_report,updated_at")
      .eq("id", id).maybeSingle(),
    client.from("application_workflow")
      .select("version,screening_notes,field_observations,caseworker_notes,follow_up_questions,review_issues,return_reason,decision_reason")
      .eq("application_id", id).maybeSingle(),
    field.startsWith("note:")
      ? client.from("application_notes").select("id,body").eq("application_id", id).eq("id", field.slice(5))
      : Promise.resolve({ data: [], error: null }),
    field.startsWith("document:")
      ? client.from("application_checklist").select("key,note").eq("application_id", id).eq("key", field.slice(9))
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (application.error || workflow.error || notes.error || checklist.error)
    throw new AiError("AI_UNAVAILABLE", 503);
  if (!application.data || !workflow.data) return null;
  return {
    version: workflow.data.version, updatedAt: application.data.updated_at,
    fields: readingFields({ application: application.data, workflow: workflow.data,
      notes: notes.data ?? [], checklist: checklist.data ?? [] }),
  };
}

export const handleReadingRequest = createReadingHandler({
  authenticate: async () => {
    const officer = await readOfficer();
    if (!officer) return null;
    if (!officer.profile) throw new AiError("AI_TRANSLATION_FORBIDDEN", 403);
    return { id: officer.profile.id };
  },
  // Every query uses the caller's session/RLS. Translation is a read capability,
  // available across stages, including closed cases, without approval powers.
  load,
  configured: () => { getGeminiConfig(process.env); },
  acquire,
  generate: (field, language, signal) => {
    const config = getGeminiConfig(process.env);
    return createReadingGenerator(new GoogleGenAI({ apiKey: config.key, vertexai: false }), config.model)(field, language, signal);
  },
});
