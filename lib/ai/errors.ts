import { createTranslator, type Language, type MessageKey } from "@/lib/i18n";
export class AiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    public readonly retryAfterSeconds?: number,
  ) {
    super(code);
  }
}
const messages: Record<string, MessageKey> = {
  AI_UNAUTHENTICATED: "Sign in to use AI assistance.",
  AI_FORBIDDEN:
    "AI assistance is restricted to the assigned officer for this stage.",
  AI_INVALID_REQUEST:
    "Invalid AI request. Use a saved case and a supported language.",
  AI_NOT_FOUND: "Application unavailable or outside your access.",
  AI_STALE_CONTEXT:
    "The saved case changed. Reload it before generating suggestions.",
  AI_NOT_CONFIGURED:
    "AI is not configured. Set GEMINI_API_KEY on the server; manual workflow remains available.",
  AI_INVALID_CONFIG:
    "Ask the administrator to check GEMINI_API_KEY and GEMINI_MODEL.",
  AI_RATE_LIMITED:
    "AI request limit reached. Wait before retrying; manual work remains available.",
  AI_PROVIDER_RATE_LIMITED: "Gemini is rate limited. Wait before retrying.",
  AI_TIMEOUT: "AI request timed out. You can retry or continue manually.",
  AI_INVALID_RESPONSE:
    "AI returned an unusable draft. Retry or continue manually.",
  AI_NO_SUGGESTIONS:
    "Gemini did not return suggestions. Continue manually or retry.",
  AI_CONTEXT_TOO_LARGE:
    "The saved case is too large for this assistant. Continue manually.",
  AI_UNAVAILABLE:
    "AI is temporarily unavailable. Retry or continue with the manual workflow.",
};
export function aiErrorResponse(error: unknown, locale: Language = "kn") {
  const known =
    error instanceof AiError ? error : new AiError("AI_UNAVAILABLE", 503);
  return Response.json(
    {
      ok: false,
      error: {
        code: known.code,
        message: aiErrorMessage(known.code, locale),
        ...(known.retryAfterSeconds
          ? { retryAfterSeconds: known.retryAfterSeconds }
          : {}),
      },
    },
    {
      status: known.status,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        Vary: "Cookie",
        "X-Content-Type-Options": "nosniff",
        ...(known.retryAfterSeconds
          ? { "Retry-After": String(known.retryAfterSeconds) }
          : {}),
      },
    },
  );
}

export function aiErrorMessage(code: string, locale: Language) {
  return createTranslator(locale)(messages[code] ?? messages.AI_UNAVAILABLE);
}
