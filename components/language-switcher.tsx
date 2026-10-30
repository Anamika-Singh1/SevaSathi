"use client";
import { useId, useState, useTransition } from "react";
import { Languages, LoaderCircle } from "lucide-react";
import { setLanguage } from "@/app/language-actions";
import { useI18n } from "@/components/language-provider";

export function LanguageSwitcher() {
  const { locale, t } = useI18n();
  const id = useId();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);
  return (
    <div className="min-w-0" data-testid="language-switcher">
      <label htmlFor={id} className="sr-only">
        {t("Interface language")}
      </label>
      <div className="relative">
        {pending ? (
          <LoaderCircle
            aria-hidden="true"
            className="pointer-events-none absolute top-3.5 left-3 size-4 animate-spin text-primary"
          />
        ) : (
          <Languages
            aria-hidden="true"
            className="pointer-events-none absolute top-3.5 left-3 size-4 text-primary"
          />
        )}
        <select
          id={id}
          value={locale}
          disabled={pending}
          aria-busy={pending}
          onChange={(event) => {
            const next = event.target.value;
            setError(false);
            startTransition(async () => {
              try {
                if (!(await setLanguage(next)).ok) setError(true);
              } catch {
                setError(true);
              }
            });
          }}
          className="min-h-11 max-w-full rounded-lg border border-input bg-white py-2 pr-8 pl-9 text-sm font-medium text-foreground disabled:opacity-70"
        >
          <option value="kn" lang="kn">
            ಕನ್ನಡ
          </option>
          <option value="en" lang="en">
            English
          </option>
        </select>
      </div>
      {pending && (
        <span className="sr-only" role="status">
          {t("Changing language…")}
        </span>
      )}
      {error && (
        <p
          role="alert"
          className="mt-2 max-w-60 text-xs leading-7 text-destructive"
        >
          {t("Unable to change language. Try again.")}
        </p>
      )}
    </div>
  );
}
