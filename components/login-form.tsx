"use client";
import { useI18n } from "@/components/language-provider";

import { useActionState, useState } from "react";
import { ArrowRight, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { login, type LoginState } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { translateMessage } from "@/lib/i18n";
import { Input } from "@/components/ui/input";

export function LoginForm({
  next,
  configured,
}: {
  next: string;
  configured: boolean;
}) {
  const { t, locale } = useI18n();

  const [state, action, pending] = useActionState<LoginState, FormData>(
    login,
    {},
  );
  const [showPassword, setShowPassword] = useState(false);
  return (
    <form noValidate action={action} className="mt-8 space-y-5">
      <input type="hidden" name="next" value={next} />
      <div className="space-y-2">
        <label htmlFor="email" className="block text-sm font-semibold">
          {t("Email address")}{" "}
        </label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          placeholder={t("officer@example.com")}
          required
          maxLength={254}
          aria-invalid={!!state.fieldErrors?.email}
          aria-describedby={
            state.fieldErrors?.email ? "email-error" : undefined
          }
        />
        {state.fieldErrors?.email && (
          <p id="email-error" className="text-xs text-destructive">
            {translateMessage(state.fieldErrors.email[0], locale)}
          </p>
        )}
      </div>
      <div className="space-y-2">
        <label htmlFor="password" className="block text-sm font-semibold">
          {t("Password")}{" "}
        </label>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            maxLength={128}
            className="pr-12"
            aria-invalid={!!state.fieldErrors?.password}
            aria-describedby={
              state.fieldErrors?.password ? "password-error" : undefined
            }
          />
          <button
            type="button"
            className="absolute top-0 right-0 flex size-11 items-center justify-center text-muted-foreground"
            onClick={() => setShowPassword(!showPassword)}
            aria-label={showPassword ? t("Hide password") : t("Show password")}
            aria-pressed={showPassword}
          >
            {showPassword ? (
              <EyeOff className="size-4" />
            ) : (
              <Eye className="size-4" />
            )}
          </button>
        </div>
        {state.fieldErrors?.password && (
          <p id="password-error" className="text-xs text-destructive">
            {translateMessage(state.fieldErrors.password[0], locale)}
          </p>
        )}
      </div>
      <div aria-live="polite">
        {state.error && (
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-800"
          >
            {translateMessage(state.error, locale)}
          </p>
        )}
      </div>
      <Button
        type="submit"
        className="h-12 w-full"
        disabled={pending || !configured}
      >
        {pending ? (
          <LoaderCircle className="animate-spin" aria-hidden="true" />
        ) : null}
        {pending ? t("Signing in…") : t("Sign in")}
        {!pending && <ArrowRight className="ml-auto" aria-hidden="true" />}
      </Button>
      <p className="text-center text-xs leading-6 text-muted-foreground">
        {t("Contact your administrator for account access.")}
      </p>
    </form>
  );
}
