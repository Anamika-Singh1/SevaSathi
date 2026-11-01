import { z } from "zod";
import { AiError } from "./errors";

// Call only from the server or trusted Node scripts. No environment values are
// read at module load, and callers must never send the result to the browser.
export function getGeminiConfig(env: Readonly<Record<string, string | undefined>>) {
  if (!env.GEMINI_API_KEY?.trim()) throw new AiError("AI_NOT_CONFIGURED", 503);
  const parsed = z
    .object({
      key: z.string().trim().min(10),
      model: z.string().trim().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{1,99}$/),
    })
    .safeParse({
      key: env.GEMINI_API_KEY,
      model: env.GEMINI_MODEL ?? "gemini-3.5-flash-lite",
    });
  if (!parsed.success) throw new AiError("AI_INVALID_CONFIG", 503);
  return parsed.data;
}
