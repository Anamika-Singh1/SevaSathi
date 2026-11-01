import { z } from "zod";
import { requestLanguage } from "@/lib/i18n";
import {
  aiFeatureSchema,
  AI_FEATURES,
  aiRequestSchema,
  aiSuggestionsSchema,
  canUseAi,
  type AiFeature,
  type AiRequest,
  type AiSuggestions,
} from "./contracts";
import { buildAiContext, type AiCase } from "./context";
import { AiError, aiErrorResponse } from "./errors";
import type { Role } from "@/lib/roles";

export type AiHandlerDependencies = {
  // Must read fresh identity/profile data, including on the post-generation check.
  authenticate: () => Promise<{ id: string; role: Role } | null>;
  load: (id: string) => Promise<AiCase | null>;
  configured: () => void;
  reserve: (id: string, feature: AiFeature, version: number) => Promise<void>;
  generate: (
    feature: AiFeature,
    input: AiRequest,
    context: Record<string, unknown>,
    signal: AbortSignal,
  ) => Promise<AiSuggestions>;
};
export async function readAiRequestBody(request: Request) {
  if (
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  )
    throw new AiError("AI_INVALID_REQUEST", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new AiError("AI_INVALID_REQUEST", 400);
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > 8192) {
        await reader.cancel();
        throw new AiError("AI_INVALID_REQUEST", 413);
      }
      chunks.push(chunk.value);
    }
    const all = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      all.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(all),
    ) as unknown;
  } catch (error) {
    if (error instanceof AiError) throw error;
    throw new AiError("AI_INVALID_REQUEST", 400);
  }
}

export function assertAiRequestOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const target = new URL(request.url);
  const protocol = request.headers.get("x-forwarded-proto")?.split(",")[0].trim()
    ?? target.protocol.slice(0, -1);
  const host = request.headers.get("host") ?? target.host;
  let validOrigin = !origin;
  if (origin) {
    try {
      validOrigin = ["http", "https"].includes(protocol)
        && new URL(origin).origin === new URL(`${protocol}://${host}`).origin;
    } catch { validOrigin = false; }
  }
  if (!validOrigin || request.headers.get("sec-fetch-site") === "cross-site")
    throw new AiError("AI_FORBIDDEN", 403);
}

// The handler only reads case records and reserves an AI quota slot. Its
// dependency contract deliberately has no workflow-mutation capability.
export function createAiHandler(deps: AiHandlerDependencies) {
  return async (request: Request, params: { id: string; feature: string }) => {
    try {
      assertAiRequestOrigin(request);
      const officer = await deps.authenticate();
      if (!officer) throw new AiError("AI_UNAUTHENTICATED", 401);
      const path = z
        .object({ id: z.uuid(), feature: aiFeatureSchema })
        .safeParse(params);
      if (!path.success) throw new AiError("AI_INVALID_REQUEST", 400);
      const parsed = aiRequestSchema.safeParse(await readAiRequestBody(request));
      if (!parsed.success) throw new AiError("AI_INVALID_REQUEST", 400);
      const input = parsed.data,
        { id, feature } = path.data;
      if (
        feature !== "decision" &&
        (input.humanAction != null || input.rationale)
      )
        throw new AiError("AI_INVALID_REQUEST", 400);
      const record = await deps.load(id);
      if (!record) throw new AiError("AI_NOT_FOUND", 404);
      if (!canUseAi(feature, record, officer))
        throw new AiError("AI_FORBIDDEN", 403);
      if (record.workflow.version !== input.version)
        throw new AiError("AI_STALE_CONTEXT", 409);
      if (
        feature === "decision" &&
        ["APPROVED", "REJECTED"].includes(record.application.status) &&
        input.humanAction &&
        input.humanAction !==
          (record.application.status === "APPROVED" ? "APPROVE" : "REJECT")
      )
        throw new AiError("AI_INVALID_REQUEST", 400);
      deps.configured();
      const context = buildAiContext(feature, record, input);
      if (JSON.stringify(context).length > 32000)
        throw new AiError("AI_CONTEXT_TOO_LARGE", 422);
      await deps.reserve(id, feature, input.version);
      const suggestions = aiSuggestionsSchema.parse(
        await deps.generate(feature, input, context, request.signal),
      );
      if (
        suggestions.language !== input.language ||
        suggestions.stage !== AI_FEATURES[feature].assistanceStage
      )
        throw new AiError("AI_INVALID_RESPONSE", 502);
      // Do not surface a draft if its case changed or access was revoked while Gemini ran.
      const latestOfficer = await deps.authenticate();
      if (!latestOfficer) throw new AiError("AI_UNAUTHENTICATED", 401);
      if (latestOfficer.id !== officer.id) throw new AiError("AI_FORBIDDEN", 403);
      const latest = await deps.load(id);
      if (!latest || !canUseAi(feature, latest, latestOfficer))
        throw new AiError("AI_FORBIDDEN", 403);
      if (
        latest.workflow.version !== input.version ||
        latest.application.updated_at !== record.application.updated_at ||
        latest.application.status !== record.application.status ||
        JSON.stringify(buildAiContext(feature, latest, input)) !==
          JSON.stringify(context)
      )
        throw new AiError("AI_STALE_CONTEXT", 409);
      return Response.json(
        {
          ok: true,
          feature,
          sourceVersion: input.version,
          generatedAt: new Date().toISOString(),
          suggestions,
        },
        {
          headers: {
            "Cache-Control": "private, no-store, max-age=0",
            Vary: "Cookie",
            "X-Content-Type-Options": "nosniff",
          },
        },
      );
    } catch (error) {
      return aiErrorResponse(
        error,
        requestLanguage(request.headers.get("cookie")),
      );
    }
  };
}
