import { getI18n } from "@/lib/i18n/server";
export default async function Loading() {
  const { t } = await getI18n();

  return (
    <div role="status" aria-busy="true" className="space-y-5">
      <p className="text-sm text-muted-foreground">
        {t("Loading your workspace…")}
      </p>
      <div className="h-12 w-60 animate-pulse rounded-lg bg-muted" />
      <div
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
        aria-hidden="true"
      >
        {[1, 2, 3, 4, 5, 6].map((key) => (
          <div
            key={key}
            className="h-36 animate-pulse rounded-xl border border-border bg-white"
          />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-xl border border-border bg-white" />
    </div>
  );
}
