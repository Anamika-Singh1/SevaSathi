"use client";
import { useI18n } from "@/components/language-provider";

import { translateMessage } from "@/lib/i18n";
import { aiErrorMessage } from "@/lib/ai/errors";
import { useEffect, useRef, useState } from "react";
import {
  Sparkles,
  Copy,
  RefreshCw,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AI_FEATURES,
  aiSuccessSchema,
  type AiFeature,
  type AiSuccess,
} from "@/lib/ai/contracts";

export function AiAssistantPanel({
  applicationId,
  feature,
  version,
  allowed,
  closed = false,
}: {
  applicationId: string;
  feature: AiFeature;
  version: number;
  allowed: boolean;
  closed?: boolean;
}) {
  const { t, locale } = useI18n();

  const [selection, setSelection] = useState({ locale, language: locale });
  // Follow a changed interface locale without discarding an edited AI draft.
  if (selection.locale !== locale) setSelection({ locale, language: locale });
  const language = selection.locale === locale ? selection.language : locale;
  const [humanAction, setHumanAction] = useState("");
  const [rationale, setRationale] = useState("");
  const [response, setResponse] = useState<AiSuccess | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retryAfter, setRetryAfter] = useState(0);
  const [copyMessage, setCopyMessage] = useState("");
  const controllerRef = useRef<AbortController | null>(null);
  const aliveRef = useRef(true);
  const draftRef = useRef<HTMLTextAreaElement>(null);
  const rule = AI_FEATURES[feature];
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      controllerRef.current?.abort();
    };
  }, []);
  useEffect(() => () => controllerRef.current?.abort(), [locale]);
  useEffect(() => {
    if (retryAfter <= 0) return;
    const timer = setTimeout(
      () => setRetryAfter((value) => Math.max(0, value - 1)),
      1000,
    );
    return () => clearTimeout(timer);
  }, [retryAfter]);

  async function generate() {
    if (!allowed || controllerRef.current || retryAfter > 0) return;
    if (
      response &&
      draft !== response.suggestions.draftNote &&
      !window.confirm(t("Replace your edited AI draft?"))
    )
      return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setError("");
    setCopyMessage("");
    try {
      const body = {
        version,
        language,
        ...(feature === "decision" && !closed
          ? { humanAction: humanAction || null, rationale }
          : {}),
      };
      const result = await fetch(
        `/api/applications/${applicationId}/ai/${feature}`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        },
      );
      const data: unknown = await result.json();
      if (!aliveRef.current || controller.signal.aborted) return;
      if (!result.ok) {
        const failure = data as {
          error?: {
            code?: unknown;
            message?: unknown;
            retryAfterSeconds?: unknown;
          };
        };
        setError(
          typeof failure.error?.code === "string"
            ? aiErrorMessage(failure.error.code, locale)
            : t("AI request failed. Continue manually or retry."),
        );
        const seconds = Number(
          result.headers.get("Retry-After") ??
            failure.error?.retryAfterSeconds ??
            0,
        );
        setRetryAfter(
          Number.isFinite(seconds)
            ? Math.max(0, Math.min(300, Math.ceil(seconds)))
            : 0,
        );
        return;
      }
      const parsed = aiSuccessSchema.safeParse(data);
      if (
        !parsed.success ||
        parsed.data.feature !== feature ||
        parsed.data.suggestions.stage !== rule.assistanceStage ||
        parsed.data.sourceVersion !== version ||
        parsed.data.suggestions.language !== language
      ) {
        setError(t("Invalid or stale AI response. Reload the case and retry."));
        return;
      }
      setResponse(parsed.data);
      setDraft(parsed.data.suggestions.draftNote);
    } catch {
      if (aliveRef.current && !controller.signal.aborted)
        setError(
          t(
            "AI connection failed. Your previous draft is retained. Retry or continue manually.",
          ),
        );
    } finally {
      controllerRef.current = null;
      if (aliveRef.current) setLoading(false);
    }
  }
  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(draft);
      setCopyMessage(t("Draft copied"));
    } catch {
      draftRef.current?.focus();
      draftRef.current?.select();
      setCopyMessage(t("Draft selected. Copy it manually."));
    }
  }
  function changeLanguage(next: "kn" | "en") {
    if (
      response &&
      draft !== response.suggestions.draftNote &&
      !window.confirm(t("Clear the edited AI draft to change language?"))
    )
      return;
    setSelection({ locale, language: next });
    setResponse(null);
    setDraft("");
    setError("");
    setCopyMessage("");
  }
  return (
    <Card
      id="ai-assistance"
      className="scroll-mt-6 border-primary/25"
      data-testid="ai-assistant"
    >
      <CardHeader>
        <div className="flex items-center gap-2">
          <Sparkles className="size-5 shrink-0 text-primary" />
          <h2 className="text-base leading-8 font-semibold">
            {t("AI assistance")}
          </h2>
        </div>
        <p className="text-sm leading-7 text-primary">{rule[locale]}</p>
        <p className="text-xs leading-7 text-muted-foreground">
          {t(rule.description)}
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex gap-2 rounded-lg border border-teal-200 bg-teal-50 p-4 text-xs leading-7 text-teal-950">
          <ShieldCheck className="mt-1 size-4 shrink-0" />
          <p>
            {t(
              "AI draft only. Verify against saved records. Only an authorized human officer may make the official decision.",
            )}
          </p>
        </div>
        <p className="text-xs leading-7 text-muted-foreground">
          {t(
            "Uses saved records only. Save manual edits first. Generating, editing or copying AI text never changes the case.",
          )}
        </p>
        {!allowed ? (
          <p className="rounded-lg bg-muted p-4 text-sm leading-8 text-muted-foreground">
            {t(
              "Contextual AI is available to the assigned officer at the relevant stage.",
            )}
          </p>
        ) : (
          <>
            <label className="block text-xs font-medium">
              {t("Suggestion language")}
              <select
                value={language}
                onChange={(event) =>
                  changeLanguage(event.target.value as "kn" | "en")
                }
                disabled={loading}
                className="mt-2 min-h-11 w-full rounded-lg border border-input bg-white px-3 text-sm"
              >
                <option value="kn">{t("Kannada")}</option>
                <option value="en">{t("English")}</option>
              </select>
            </label>
            {feature === "decision" && !closed && (
              <fieldset
                disabled={loading}
                className="min-w-0 space-y-3 rounded-lg border border-border p-4"
              >
                <legend className="px-1 text-xs font-medium">
                  {t("Human intent (optional)")}
                </legend>
                <label className="block text-xs">
                  {t("Human-selected action")}
                  <select
                    value={humanAction}
                    onChange={(event) => setHumanAction(event.target.value)}
                    className="mt-2 min-h-11 w-full rounded-lg border border-input bg-white px-3 text-sm"
                  >
                    <option value="">{t("Not selected")}</option>
                    <option value="APPROVE">{t("Approve")}</option>
                    <option value="REJECT">{t("Reject")}</option>
                    <option value="RETURN">{t("Return")}</option>
                  </select>
                </label>
                <label className="block text-xs">
                  {t("Rationale context")}
                  <textarea
                    value={rationale}
                    onChange={(event) => setRationale(event.target.value)}
                    maxLength={1000}
                    className="mt-2 min-h-24 w-full rounded-lg border border-input bg-white p-3 text-sm leading-8"
                  />
                </label>
                <p className="text-xs leading-7 text-muted-foreground">
                  {t(
                    "This only provides drafting context. Record the actual decision through the manual workflow.",
                  )}
                </p>
              </fieldset>
            )}
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                data-testid="ai-generate"
                onClick={generate}
                disabled={loading || retryAfter > 0}
                className="h-auto min-h-11 w-full min-w-0 max-w-full whitespace-normal leading-7 sm:w-auto"
              >
                <span aria-hidden="true" className="shrink-0">
                  {loading ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : response ? (
                    <RefreshCw className="size-4" />
                  ) : (
                    <Sparkles className="size-4" />
                  )}
                </span>
                <span>
                  {loading
                    ? t("Generating…")
                    : response
                      ? t("Regenerate")
                      : t("Generate AI Assistance")}
                </span>
              </Button>
            </div>
          </>
        )}
        {loading && (
          <p role="status" className="text-xs leading-7 text-primary">
            {t(
              "Generating from saved records. Manual workflow remains available.",
            )}
          </p>
        )}
        {error && (
          <div
            role="alert"
            className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm leading-8 text-rose-950"
          >
            <p>{translateMessage(error, locale)}</p>
            <Button
              type="button"
              variant="outline"
              onClick={generate}
              disabled={loading || retryAfter > 0}
              className="mt-3 h-auto min-h-11 max-w-full whitespace-normal leading-7"
            >
              <RefreshCw />
              {retryAfter > 0
                ? t("Retry in {seconds}s", { seconds: retryAfter })
                : t("Retry")}
            </Button>
          </div>
        )}
        {response && (
          <div className="space-y-5" data-testid="ai-suggestions">
            <div>
              <h3 className="text-sm font-semibold">{t("Summary")}</h3>
              <p
                lang={response.suggestions.language}
                className="mt-2 text-sm leading-8 whitespace-pre-wrap"
              >
                {response.suggestions.summary}
              </p>
            </div>
            {(
              [
                ["evidence", t("Recorded evidence")],
                ["missingInformation", t("Missing information")],
                ["followUpQuestions", t("Follow-up questions")],
                ["inconsistencies", t("Recorded inconsistencies")],
                ["unverifiedInformation", t("Unverified information")],
                ["limitations", t("AI limitations")],
              ] as const
            ).map(([key, label]) => (
              <section key={key}>
                <h3 className="text-sm leading-7 font-semibold">{label}</h3>
                {response.suggestions[key].length ? (
                  <ul className="mt-2 list-disc space-y-2 pl-5 text-xs leading-7">
                    {response.suggestions[key].map((item, index) => (
                      <li lang={response.suggestions.language} key={index}>
                        {item}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs leading-7 text-muted-foreground">
                    {t(
                      "None listed by AI; officer verification is still required.",
                    )}
                  </p>
                )}
              </section>
            ))}
            <label className="block text-sm font-semibold">
              {t("Editable AI draft")}
              <textarea
                ref={draftRef}
                data-testid="ai-draft"
                lang={response.suggestions.language}
                value={draft}
                disabled={loading}
                onChange={(event) => {
                  setDraft(event.target.value);
                  setCopyMessage("");
                }}
                maxLength={4000}
                rows={10}
                className="mt-2 w-full min-w-0 rounded-lg border border-input bg-white p-3 text-sm leading-8 font-normal"
              />
            </label>
            <Button
              type="button"
              variant="outline"
              onClick={copyDraft}
              disabled={!draft.trim()}
            >
              <Copy />
              {t("Copy draft")}
            </Button>
            {copyMessage && (
              <p role="status" className="text-xs leading-7 text-primary">
                {translateMessage(copyMessage, locale)}
              </p>
            )}
            <p className="text-xs leading-7 text-muted-foreground">
              {t(
                "To save this draft, copy it into the workflow notes, review it, then explicitly save. Copying does not save or submit it.",
              )}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
