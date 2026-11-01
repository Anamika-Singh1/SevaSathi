import { z } from "zod";
import { requestLanguage } from "@/lib/i18n";
import { AiError, aiErrorResponse } from "./errors";
import { assertAiRequestOrigin, readAiRequestBody } from "./handler";
import {
  readingRequestSchema, translatedTextSchema,
  type ReadingSnapshot, type ReadingRequest, type ReadingField, type TranslatedText,
} from "./reading-view";

export type ReadingDependencies = {
  authenticate: () => Promise<{ id: string } | null>;
  load: (id: string, field: string) => Promise<ReadingSnapshot | null>;
  configured: () => void;
  acquire: (officerId: string) => () => void;
  generate: (field: ReadingField, language: ReadingRequest["language"], signal: AbortSignal) => Promise<TranslatedText>;
};

// No mutation dependency: translations cannot save notes or operate workflow.
export function createReadingHandler(deps: ReadingDependencies) {
  return async (request: Request, id: string) => {
    let release: (() => void) | undefined;
    try {
      assertAiRequestOrigin(request);
      const officer = await deps.authenticate();
      if (!officer) throw new AiError("AI_UNAUTHENTICATED", 401);
      if (!z.uuid().safeParse(id).success) throw new AiError("AI_INVALID_REQUEST", 400);
      const parsed = readingRequestSchema.safeParse(await readAiRequestBody(request));
      if (!parsed.success) throw new AiError("AI_INVALID_REQUEST", 400);
      const input = parsed.data;
      const record = await deps.load(id, input.field);
      if (!record) throw new AiError("AI_NOT_FOUND", 404);
      if (record.version !== input.version) throw new AiError("AI_TRANSLATION_STALE", 409);
      const field = record.fields.find(item => item.key === input.field);
      if (!field) throw new AiError("AI_INVALID_REQUEST", 400);
      if (field.original.length > 4000) throw new AiError("AI_CONTEXT_TOO_LARGE", 422);
      deps.configured();
      release = deps.acquire(officer.id);
      const output = translatedTextSchema.safeParse(await deps.generate(field, input.language, request.signal));
      if (!output.success || output.data.language !== input.language)
        throw new AiError("AI_TRANSLATION_INVALID_RESPONSE", 502);
      const latestOfficer = await deps.authenticate();
      if (!latestOfficer) throw new AiError("AI_UNAUTHENTICATED", 401);
      if (latestOfficer.id !== officer.id) throw new AiError("AI_TRANSLATION_FORBIDDEN", 403);
      const latest = await deps.load(id, input.field);
      if (!latest) throw new AiError("AI_NOT_FOUND", 404);
      if (latest.version !== input.version || latest.updatedAt !== record.updatedAt
        || latest.fields.find(item => item.key === input.field)?.original !== field.original)
        throw new AiError("AI_TRANSLATION_STALE", 409);
      return Response.json({
        ok: true, field: field.key, sourceVersion: input.version,
        original: field.original, ...output.data,
      }, { headers: {
        "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie",
        "X-Content-Type-Options": "nosniff",
      } });
    } catch (error) {
      return aiErrorResponse(error instanceof AiError && error.code === "AI_FORBIDDEN"
        ? new AiError("AI_TRANSLATION_FORBIDDEN", 403) : error,
      requestLanguage(request.headers.get("cookie")));
    } finally { release?.(); }
  };
}
