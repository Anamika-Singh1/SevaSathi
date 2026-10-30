"use client";
import { useI18n } from "@/components/language-provider";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
export default function WorkspaceError({ reset }: { reset: () => void }) {
  const { t, locale } = useI18n();

  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div role="alert" className="rounded-xl border border-border bg-white p-8">
      <h1 className="text-xl font-semibold">{t("Unable to load data")}</h1>
      <p className="mt-3 text-sm leading-7 text-muted-foreground">
        <span lang={locale}>
          {t(
            "Unable to load data. Try again, or ask your administrator to check Supabase connectivity and migrations.",
          )}
        </span>
      </p>
      <Button
        onClick={() =>
          startTransition(() => {
            router.refresh();
            reset();
          })
        }
        disabled={pending}
        className="mt-5"
      >
        {pending ? t("Retrying…") : t("Retry")}
      </Button>
    </div>
  );
}
