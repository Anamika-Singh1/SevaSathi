"use client";

import { useEffect, useRef, useState } from "react";
import { Languages, LoaderCircle, RefreshCw } from "lucide-react";
import { useI18n } from "@/components/language-provider";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { aiErrorMessage } from "@/lib/ai/errors";
import { READING_LABELS, readingSuccessSchema, type ReadingField, type ReadingSuccess } from "@/lib/ai/reading-view";

export function RecordedTextReadingView({ applicationId, version, fields }: {
  applicationId: string; version: number; fields: ReadingField[];
}) {
  const { t, locale } = useI18n();
  const [selectedKey, setSelectedKey] = useState(fields[0]?.key ?? "");
  const [result, setResult] = useState<ReadingSuccess | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retryAfter, setRetryAfter] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const selected = fields.find(field => field.key === selectedKey) ?? fields[0];
  const reading = result && selected && result.field === selected.key
    && result.sourceVersion === version && result.original === selected.original
    && result.language === locale ? result : null;
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; controllerRef.current?.abort(); };
  }, []);
  useEffect(() => () => controllerRef.current?.abort(), [locale, applicationId, version]);
  useEffect(() => {
    if (retryAfter <= 0) return;
    const timer = setTimeout(() => setRetryAfter(value => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [retryAfter]);

  async function translate() {
    if (!selected || controllerRef.current || retryAfter > 0) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/applications/${applicationId}/translation`, {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version, language: locale, field: selected.key }),
        signal: controller.signal,
      });
      const data: unknown = await response.json();
      if (!alive.current || controller.signal.aborted) return;
      if (!response.ok) {
        const failure = data as { error?: { code?: unknown; retryAfterSeconds?: unknown } };
        const code = typeof failure.error?.code === "string" ? failure.error.code : "AI_UNAVAILABLE";
        setError(code);
        if (["AI_TRANSLATION_STALE", "AI_TRANSLATION_FORBIDDEN", "AI_UNAUTHENTICATED", "AI_NOT_FOUND"].includes(code)) setResult(null);
        const seconds = Number(response.headers.get("Retry-After") ?? failure.error?.retryAfterSeconds ?? 0);
        setRetryAfter(Number.isFinite(seconds) ? Math.max(0, Math.min(300, Math.ceil(seconds))) : 0);
        return;
      }
      const parsed = readingSuccessSchema.safeParse(data);
      if (!parsed.success || parsed.data.field !== selected.key || parsed.data.language !== locale
        || parsed.data.sourceVersion !== version || parsed.data.original !== selected.original) {
        setError("AI_TRANSLATION_STALE");
        setResult(null);
        return;
      }
      setResult(parsed.data);
    } catch {
      if (alive.current && !controller.signal.aborted) setError("AI_UNAVAILABLE");
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        if (alive.current) setLoading(false);
      }
    }
  }

  if (!selected) return null;
  return (
    <Card id="translated-reading" className="scroll-mt-6" data-testid="reading-view">
      <CardHeader>
        <h2 className="flex items-center gap-2 text-base leading-8 font-semibold">
          <Languages className="size-5 shrink-0 text-primary" aria-hidden="true" />
          {t("Translated reading view")}
        </h2>
        <p className="text-xs leading-7 text-muted-foreground">
          {t("Select saved text to translate with Gemini. Only the selected text is sent; original records stay unchanged.")}
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <label className="block text-sm font-medium">
          {t("Saved text to read")}
          <select value={selected.key} disabled={loading}
            onChange={event => { setSelectedKey(event.target.value); setResult(null); setError(""); }}
            className="mt-2 min-h-11 w-full rounded-lg border border-input bg-white px-3 py-2 text-sm">
            {fields.map(field => <option key={field.key} value={field.key}>
              {t(READING_LABELS[field.type])}{field.ordinal ? ` · ${field.ordinal}` : ""}
            </option>)}
          </select>
        </label>
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <section className="min-w-0 rounded-lg border border-border p-4">
            <h3 className="text-sm font-semibold">{t("Original saved text")}</h3>
            <p translate="no" data-testid="reading-original" className="mt-3 max-h-80 overflow-y-auto text-sm leading-8 whitespace-pre-wrap break-words">
              {selected.original}
            </p>
          </section>
          <section className="min-w-0 rounded-lg border border-primary/20 bg-accent/40 p-4" aria-live="polite">
            <h3 className="text-sm font-semibold">{t("Reading translation")} · {locale === "kn" ? t("Kannada") : t("English")}</h3>
            {reading ? <p lang={reading.language} translate="no" data-testid="reading-translation"
              className="mt-3 max-h-80 overflow-y-auto text-sm leading-8 whitespace-pre-wrap break-words">{reading.translation}</p>
              : <p className="mt-3 text-xs leading-7 text-muted-foreground">{t("Translate when you need help reading this text.")}</p>}
          </section>
        </div>
        <Button type="button" onClick={translate} disabled={loading || retryAfter > 0} data-testid="reading-generate"
          className="h-auto min-h-11 max-w-full whitespace-normal leading-7">
          {loading ? <LoaderCircle className="animate-spin" /> : reading ? <RefreshCw /> : <Languages />}
          {loading ? t("Translating…") : retryAfter > 0 ? t("Retry in {seconds}s", { seconds: retryAfter })
            : reading ? t("Translate again") : t("Translate saved text")}
        </Button>
        {loading && <p role="status" className="text-xs leading-7 text-primary">{t("Translating selected text. You can continue working with the original.")}</p>}
        {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm leading-8 text-rose-950">{aiErrorMessage(error, locale)}</p>}
        <p className="text-xs leading-7 text-muted-foreground">
          {t("For reading only. Check names, numbers and meaning against the original; this translation is not an official record.")}
        </p>
      </CardContent>
    </Card>
  );
}
