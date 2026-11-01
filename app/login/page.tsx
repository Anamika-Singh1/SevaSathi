import { getI18n } from "@/lib/i18n/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  FileCheck2,
  LockKeyhole,
  CircleCheck,
} from "lucide-react";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Brand } from "@/components/brand";
import { LoginForm } from "@/components/login-form";
import { ClearSignedOutDrafts } from "@/components/clear-signed-out-drafts";
import { getSupabaseConfig } from "@/lib/env";
import { getOfficer } from "@/lib/auth";
import { safeNextPath, canAccessPath } from "@/lib/roles";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("Login") };
}
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { t, locale } = await getI18n();

  const params = await searchParams;
  const next = safeNextPath(params.next);
  const officer = await getOfficer();
  if (officer?.profile)
    redirect(
      canAccessPath(
        officer.profile.role,
        new URL(next, "http://localhost").pathname,
      )
        ? next
        : "/dashboard",
    );
  const configured = !!getSupabaseConfig();
  return (
    <main
      id="main-content"
      className="grid min-h-svh lg:grid-cols-[1.05fr_1fr]"
    >
      {params.loggedOut === "1" && <ClearSignedOutDrafts />}
      <section className="portal-header flex flex-col justify-between px-6 py-6 text-white sm:px-12 lg:min-h-svh lg:px-16 lg:py-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Brand dark />
          <LanguageSwitcher />
        </div>
        <div className="my-16 hidden max-w-lg lg:block">
          <FileCheck2 className="mb-6 size-9 text-blue-200" aria-hidden="true" />
          <h2 className="text-4xl leading-[1.65] font-semibold tracking-tight">{t("Income certificate workspace")}</h2>
          <p className="mt-4 text-base leading-8 text-slate-200">{t("Track applications, record evidence and make informed decisions.")}</p>
          <ol className="mt-10 space-y-5 border-t border-white/20 pt-8">
            {(["Document screening", "Field verification", "Caseworker review", "Final decision"] as const).map((label, index) => (
              <li key={label} className="flex items-center gap-4 text-sm leading-7">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-white/30 text-xs text-teal-100" aria-hidden="true">{index + 1}</span>
                {t(label)}
              </li>
            ))}
          </ol>
        </div>
        <div className="hidden text-sm leading-7 text-slate-200 lg:block">
          <span lang={locale}>{t("Karnataka · Revenue workflow")}</span>
        </div>
      </section>
      <section className="flex flex-col justify-center px-4 py-8 sm:px-10 lg:px-14">
        <div className="mx-auto w-full max-w-lg rounded-xl border border-border bg-white p-5 sm:p-8 lg:p-10">
          <div className="mb-5 flex size-10 items-center justify-center rounded-lg bg-accent text-primary">
            <LockKeyhole className="size-5" aria-hidden="true" />
          </div>
          <h1 className="text-3xl leading-relaxed font-semibold">
            {t("Welcome back")}
          </h1>
          <p className="mt-2 text-sm leading-7 text-muted-foreground">
            {t("Sign in to your SevaSathi workspace.")}
          </p>
          {!configured && (
            <div
              role="status"
              className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900"
            >
              <p className="font-semibold">{t("Setup required")}</p>
              <p lang={locale} className="mt-1">
                {t("Sign-in is not configured. Contact your administrator.")}
              </p>
            </div>
          )}
          {params.error === "profile" && (
            <p
              role="alert"
              className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-800"
            >
              {t("An administrator must activate your officer profile.")}
            </p>
          )}
          {params.loggedOut === "1" && (
            <p
              role="status"
              className="mt-5 flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800"
            >
              <CircleCheck className="size-4" />
              {t("Signed out.")}
            </p>
          )}
          <LoginForm next={next} configured={configured} />
          <p className="mt-8 border-t border-border pt-5 text-xs leading-7 text-muted-foreground">
            {t("Independent demonstration. Fictional data only. Not an official government service.")}
          </p>
        </div>
      </section>
    </main>
  );
}
