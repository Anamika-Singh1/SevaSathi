import { getI18n } from "@/lib/i18n/server";
import { ApplicationTable } from "@/components/application-table";
import Link from "next/link";
import { PageHeading } from "@/components/page-heading";
import { requirePath } from "@/lib/auth";
import { listApplications } from "@/services/applications";
import type { ApplicationStatus } from "@/types/domain";

export async function RoleQueue({
  path,
  status,
  title,
  eyebrow,
  description,
}: {
  path: string;
  status: ApplicationStatus;
  title: string;
  eyebrow: string;
  description: string;
}) {
  const { t, locale } = await getI18n();

  await requirePath(path);
  const { applications, count } = await listApplications({ status });
  return (
    <>
      <PageHeading title={title} eyebrow={eyebrow} description={description} />
      <div className="mb-6 rounded-lg border border-border bg-white p-4 text-xs leading-6 text-muted-foreground">
        <span lang={locale}>
          {t(
            "Open a case to save progress, submit work, or handle clarification. Actions are restricted to the assigned officer.",
          )}
        </span>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        {count} {t("applications")}
      </p>
      <ApplicationTable applications={applications} />
      {count > applications.length && (
        <Link
          href={`/applications?status=${status}`}
          className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-primary underline underline-offset-4"
        >
          {t("View all {count} applications", { count })}
        </Link>
      )}
    </>
  );
}
