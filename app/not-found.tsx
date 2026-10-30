import { getI18n } from "@/lib/i18n/server";
import Link from "next/link";
import { Button } from "@/components/ui/button";
export default async function NotFound() {
  const { t, locale } = await getI18n();

  return (
    <main id="main-content" className="mx-auto max-w-xl px-6 py-24 text-center">
      <p className="text-xs font-semibold tracking-widest text-primary">404</p>
      <h1 className="mt-4 text-2xl leading-relaxed font-semibold">
        {t("Page or application unavailable")}
      </h1>
      <p className="mt-4 text-sm leading-7 text-muted-foreground">
        <span lang={locale}>
          {t(
            "This page or application is unavailable, or you do not have access.",
          )}
        </span>
      </p>
      <Button asChild className="mt-7">
        <Link href="/dashboard">{t("Go to dashboard")}</Link>
      </Button>
    </main>
  );
}
