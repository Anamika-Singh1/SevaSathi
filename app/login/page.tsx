import { getI18n } from "@/lib/i18n/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  ArrowUpRight,
  FileCheck2,
  LockKeyhole,
  ShieldCheck,
  Languages,
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
      <section className="login-pattern relative flex flex-col justify-between overflow-hidden bg-[#143e32] px-7 py-9 text-white sm:px-12 lg:min-h-svh lg:px-16 lg:py-12">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Brand dark />
          <LanguageSwitcher />
        </div>
        <div className="relative my-14 max-w-lg lg:my-24">
          <span className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] text-emerald-100">
            <span className="size-1.5 rounded-full bg-emerald-300" />
            {t("Revenue officer workspace")}
          </span>
          <h1 className="text-4xl leading-[1.65] font-semibold tracking-tight sm:text-5xl">
            {t("Simpler service.")}
            <br />
            <span className="text-[#bddec6]">{t("Clearer decisions.")}</span>
          </h1>
          <p
            lang={locale}
            className="mt-5 max-w-sm text-base leading-7 text-emerald-50/65"
          >
            {t(
              "A clearer path from application to income certificate. Built around the officers who make it happen.",
            )}
          </p>
          <div className="mt-10 flex gap-4 border-t border-white/15 pt-7">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/10">
              <FileCheck2 className="size-5 text-emerald-200" />
            </div>
            <div>
              <p className="text-sm font-medium">
                {t("One workspace. Every stage.")}
              </p>
              <p
                lang={locale}
                className="mt-2 text-xs leading-6 text-emerald-50/55"
              >
                {t("Applications · Field verification · Review · Approval")}
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-emerald-50/55">
          <span lang={locale}>{t("Karnataka · Revenue workflow")}</span>
          <span className="inline-flex items-center gap-1.5">
            <Languages className="size-4" />
            {t("Kannada first")}
          </span>
        </div>
      </section>
      <section className="flex flex-col justify-center px-7 py-12 sm:px-14 lg:px-20">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-7 flex size-12 items-center justify-center rounded-xl border border-border bg-white text-primary">
            <LockKeyhole className="size-5" />
          </div>
          <p
            lang={locale}
            className="mb-3 text-[10px] font-semibold tracking-[0.2em] text-primary uppercase"
          >
            {t("Officer workspace")}
          </p>
          <h2 className="text-3xl leading-relaxed font-bold">
            {t("Welcome back")}
          </h2>
          <p className="mt-2 text-sm leading-7 text-muted-foreground">
            {t("Sign in with your official account.")}
            <br />
            <span lang={locale}>
              {t("Sign in to your SevaSathi workspace.")}
            </span>
          </p>
          {!configured && (
            <div
              role="status"
              className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900"
            >
              <p className="font-semibold">{t("Setup required")}</p>
              <p lang={locale} className="mt-1">
                {t("Add your Supabase URL and publishable key to")}{" "}
                <code>{t(".env.local")}</code>
                {t(
                  ", run the migration and demo setup, then restart. See README.md.",
                )}
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
          <div className="mt-10 flex items-start gap-3 border-t border-border pt-6 text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
            <p className="text-[11px] leading-6">
              <span lang={locale}>
                {t(
                  "Access is limited to provisioned officers. Your role is managed by an administrator.",
                )}
              </span>
            </p>
          </div>
          <div className="mt-7 flex items-center justify-between gap-3 text-[10px] text-muted-foreground">
            <span lang={locale}>{t("Phase 5 · Fictional demonstration")}</span>
            <span className="flex items-center gap-1" lang={locale}>
              {t("Kenpath assignment")}
              <ArrowUpRight className="size-3" />
            </span>
          </div>
        </div>
      </section>
    </main>
  );
}
