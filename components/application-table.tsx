import { getI18n } from "@/lib/i18n/server";
import { priorityReason, demoRecordText, locationLabel } from "@/lib/i18n/records";
import Link from "next/link";
import { ArrowUpRight, FolderOpen } from "lucide-react";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { PriorityBadge } from "@/components/priority-badge";
import { formatDate } from "@/lib/utils";
import type { ApplicationWorklist } from "@/types/domain";

async function PriorityReasons({
  application,
}: {
  application: ApplicationWorklist;
}) {
  const { locale } = await getI18n();

  return (
    <ul className="mt-2 space-y-1 text-xs leading-6 text-muted-foreground">
      {application.priority_reasons.map((reason) => (
        <li key={reason}>{priorityReason(reason, locale)}</li>
      ))}
    </ul>
  );
}

export async function ApplicationTable({
  applications,
}: {
  applications: ApplicationWorklist[];
}) {
  const { t, locale } = await getI18n();

  if (!applications.length)
    return (
      <Card className="flex flex-col items-center px-5 py-12 text-center">
        <FolderOpen className="mb-4 size-9 text-muted-foreground" />
        <p className="font-semibold">{t("No applications found")}</p>
        <p
          lang={locale}
          className="mt-2 max-w-sm text-sm leading-7 text-muted-foreground"
        >
          {t(
            "No applications match this view. Clear your filters or check your assignments.",
          )}
        </p>
        <Link
          href="/applications"
          className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-primary underline underline-offset-4"
        >
          {t("All applications")}
        </Link>
      </Card>
    );
  return (
    <>
      <div className="space-y-4 xl:hidden" data-testid="application-cards">
        {applications.map((application) => (
          <Card key={application.id} className="min-w-0 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Link
                href={`/applications/${application.id}`}
                className="inline-flex min-h-11 items-center font-mono text-sm font-semibold text-primary underline-offset-4 hover:underline"
              >
                {application.reference_number}
              </Link>
              <PriorityBadge priority={application.priority} />
            </div>
            <p className="mt-2 text-base leading-8 font-semibold">
              {demoRecordText(application.applicant_name, locale, application.is_demo)}
            </p>
            <p className="mb-4 text-sm text-muted-foreground">
              {locationLabel(application.village, locale)}
            </p>
            <StatusBadge status={application.status} />
            {application.clarification_pending && (
              <p className="mt-3 text-xs leading-7 font-medium text-amber-900">
                {t("Clarification required")}
              </p>
            )}
            <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-border pt-4 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">
                  {t("Days pending")}
                </dt>
                <dd className="mt-2 font-semibold tabular-nums">
                  {application.days_pending}
                  {!application.is_pending && (
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      {t("(total)")}
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">
                  {t("Demo target")}
                </dt>
                <dd
                  className={`mt-2 font-medium ${application.is_overdue ? "text-rose-800" : ""}`}
                >
                  {formatDate(application.effective_target_date, locale)}
                </dd>
              </div>
            </dl>
            <PriorityReasons application={application} />
            <Link
              href={`/applications/${application.id}`}
              className="mt-4 flex min-h-11 items-center justify-between rounded-lg bg-accent px-3 text-sm font-medium text-primary"
              aria-label={t("View details for {number}", {
                number: application.reference_number,
              })}
            >
              {t("View details")}
              <ArrowUpRight className="size-4 shrink-0" />
            </Link>
          </Card>
        ))}
      </div>
      <Card
        className="hidden overflow-hidden xl:block"
        data-testid="application-table"
      >
        <table className="w-full table-fixed text-left text-sm">
          <caption className="sr-only">
            {t("Applications with priority reasons and demo targets")}
          </caption>
          <thead className="border-b border-border bg-slate-50 text-xs leading-6 text-muted-foreground">
            <tr>
              <th scope="col" className="w-[16%] px-4 py-4 font-medium">
                {t("Application number")}
              </th>
              <th scope="col" className="w-[19%] px-4 py-4 font-medium">
                {t("Applicant / village")}
              </th>
              <th scope="col" className="w-[18%] px-4 py-4 font-medium">
                {t("Current stage")}
              </th>
              <th scope="col" className="w-[22%] px-4 py-4 font-medium">
                {t("Priority & reason")}
              </th>
              <th scope="col" className="w-[9%] px-3 py-4 font-medium">
                {t("Days pending")}
              </th>
              <th scope="col" className="w-[16%] px-4 py-4 font-medium">
                {t("Demo target")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {applications.map((application) => (
              <tr
                key={application.id}
                className="align-top transition-colors hover:bg-slate-50/80"
              >
                <td className="px-4 py-5">
                  <Link
                    href={`/applications/${application.id}`}
                    className="inline-flex min-h-11 items-center break-all font-mono text-xs font-semibold text-primary underline-offset-4 hover:underline"
                  >
                    {application.reference_number}
                  </Link>
                  <Link
                    href={`/applications/${application.id}`}
                    className="flex min-h-11 items-center gap-1 text-xs text-primary"
                    aria-label={t("View details for {number}", {
                      number: application.reference_number,
                    })}
                  >
                    {t("Details")}
                    <ArrowUpRight className="size-3 shrink-0" />
                  </Link>
                </td>
                <td className="px-4 py-5">
                  <p className="leading-7 font-medium">
                    {demoRecordText(application.applicant_name, locale, application.is_demo)}
                  </p>
                  <p className="mt-2 text-xs leading-6 text-muted-foreground">
                    {locationLabel(application.village, locale)}
                  </p>
                </td>
                <td className="px-4 py-5">
                  <StatusBadge status={application.status} />
                  {application.clarification_pending && (
                    <p className="mt-2 text-xs leading-7 text-amber-900">
                      {t("Clarification")}
                    </p>
                  )}
                </td>
                <td className="px-4 py-5">
                  <PriorityBadge priority={application.priority} />
                  <PriorityReasons application={application} />
                </td>
                <td className="px-3 py-5 font-semibold tabular-nums">
                  {application.days_pending}
                  <span className="mt-2 block text-xs font-normal text-muted-foreground">
                    {application.is_pending ? t("Pending") : t("Total")}
                  </span>
                </td>
                <td className="px-4 py-5 text-xs leading-6">
                  <span
                    className={
                      application.is_overdue ? "font-medium text-rose-800" : ""
                    }
                  >
                    {formatDate(application.effective_target_date, locale)}
                  </span>
                  {application.is_overdue && (
                    <span className="mt-2 block text-rose-800">
                      {t("{count} days overdue", {
                        count: application.days_overdue,
                      })}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
