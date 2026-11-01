import { getI18n } from "@/lib/i18n/server";
import { locationLabel, demoRecordText } from "@/lib/i18n/records";
import Link from "next/link";
import {
  ArrowRight,
  Plus,
  ArrowUpRight,
} from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ApplicationTable } from "@/components/application-table";
import { PriorityGuide } from "@/components/priority-guide";
import { StatusBadge } from "@/components/status-badge";
import { requireOfficer } from "@/lib/auth";
import { formatDate } from "@/lib/utils";
import {
  getDashboardApplications,
  getApplicationStats,
  getWorkflowSettings,
} from "@/services/applications";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const { t, locale } = await getI18n();

  const { profile } = await requireOfficer();
  const [{ queue, recent, screening }, stats, settings, params] = await Promise.all([
    getDashboardApplications(),
    getApplicationStats(),
    getWorkflowSettings(),
    searchParams,
  ]);
  const additionalScreening = screening.filter(application => !queue.some(item => item.id === application.id));
  const metrics = [
    {
      label: t("Pending applications"),
      en: "Total pending",
      count: stats.pending,
      href: "view=pending",
      hint: t("All active stages"),
    },
    {
      label: t("Immediate attention"),
      en: "Immediate attention",
      count: stats.attention,
      href: "view=attention&sort=priority",
      hint: t("Immediate priority"),
    },
    {
      label: t("Field verification pending"),
      en: "Field verification pending",
      count: stats.field,
      href: "status=FIELD_VERIFICATION",
      hint: t("Field stage"),
    },
    {
      label: t("Final review pending"),
      en: "Final review pending",
      count: stats.review,
      href: "view=final-review",
      hint: t("Review + approval"),
    },
    {
      label: t("Overdue applications"),
      en: "Overdue applications",
      count: stats.overdue,
      href: "overdue=yes&sort=target",
      hint: t("Past target date"),
    },
    {
      label: t("Recently processed"),
      en: "Recently processed",
      count: stats.recent,
      href: "view=recent&sort=recent",
      hint: t("Last {count} days", { count: settings.recent_processed_days }),
    },
  ];
  return (
    <>
      <PageHeading
        title={t("Dashboard")}
        description={t(
          "{taluk} taluk · Your applications and today’s priorities.",
          { taluk: locationLabel(profile.taluk, locale) },
        )}
      >
        <div className="flex min-w-0 flex-wrap gap-3">
          {profile.role === "OPERATOR" && (
            <Button asChild>
              <Link href="/applications/new">
                <Plus aria-hidden="true" />
                {t("Add application")}
              </Link>
            </Button>
          )}
          <Button asChild variant="outline">
            <Link href="/applications">
              {t("View applications")}
              <ArrowRight />
            </Link>
          </Button>
        </div>
      </PageHeading>
      {params.notice === "forbidden" && (
        <p
          role="alert"
          className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-900"
        >
          {t("Your role does not have access to that page.")}
        </p>
      )}
      <Card className="overflow-hidden">
        <div className="border-b border-border bg-slate-50 px-4 py-3 sm:px-5">
          <h2 className="text-base leading-8 font-semibold text-primary">{t("Application summary")}</h2>
        </div>
        <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3 xl:grid-cols-6" data-testid="dashboard-metrics">
        {metrics.map(({ label, en, count, href, hint }) => (
          <Link
            key={en}
            href={`/applications?${href}`}
            className="group min-w-0 bg-white p-4 transition-colors hover:bg-accent focus-visible:relative focus-visible:z-10 sm:p-5"
          >
              <div className="flex items-center justify-between gap-2">
                <p className={`text-[32px] leading-tight font-semibold tabular-nums ${count > 0 && (en === "Immediate attention" || en === "Overdue applications") ? "text-rose-800" : "text-primary"}`} data-metric={en}>{count}</p>
                <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" aria-hidden="true" />
              </div>
              <h3 className="mt-3 text-sm leading-7 font-medium">{label}</h3>
              <p className={en === "Recently processed" ? "mt-1 text-xs leading-7 text-muted-foreground" : "sr-only"}>{hint}</p>
          </Link>
        ))}
        </div>
      </Card>
      <section className="mt-7" aria-labelledby="attention-heading">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2
              id="attention-heading"
              className="text-lg leading-8 font-semibold"
            >
              {t("Applications needing attention")}
            </h2>
            <p className="mt-1 text-xs leading-6 text-muted-foreground">
              {t("High and immediate priority · Top 5")}
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/applications?sort=priority">
              {t("All applications")}
              <ArrowRight />
            </Link>
          </Button>
        </div>
        <ApplicationTable applications={queue} />
      </section>
      {profile.role === "OPERATOR" && additionalScreening.length > 0 && (
        <section className="mt-9" aria-labelledby="screening-heading" data-testid="dashboard-screening-queue">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 id="screening-heading" className="text-lg leading-8 font-semibold">{t("Document screening queue")}</h2>
            <Button asChild variant="ghost"><Link href="/applications?status=SUBMITTED">{t("View applications")}<ArrowRight aria-hidden="true" /></Link></Button>
          </div>
          <ApplicationTable applications={additionalScreening} />
        </section>
      )}
      <section className="mt-9" aria-labelledby="processed-heading">
        <h2
          id="processed-heading"
          className="mb-4 text-lg leading-8 font-semibold"
        >
          {t("Recently processed applications")}{" "}
          <span
            lang={locale}
            className="block text-xs font-normal text-muted-foreground"
          >
            {t("Last {count} days", { count: settings.recent_processed_days })}
          </span>
        </h2>
        <Card className="divide-y divide-border">
          {recent.length ? (
            recent.map((application) => (
              <Link
                key={application.id}
                href={`/applications/${application.id}`}
                className="flex min-h-20 flex-wrap items-center justify-between gap-3 p-5 transition-colors hover:bg-muted/50"
              >
                <div className="min-w-0">
                  <p className="font-mono text-xs font-semibold text-primary">
                    {application.reference_number}
                  </p>
                  <p className="mt-2 text-sm leading-7">
                    {demoRecordText(application.applicant_name, locale, application.is_demo)} · {locationLabel(application.village, locale)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <StatusBadge status={application.status} />
                  <span className="text-xs text-muted-foreground">
                    {formatDate(application.processed_at!, locale)}
                  </span>
                  <ArrowUpRight className="size-4 text-primary" />
                </div>
              </Link>
            ))
          ) : (
            <p className="p-6 text-sm leading-7 text-muted-foreground">
              {t("No applications processed in this period.")}
            </p>
          )}
        </Card>
      </section>
      <div className="mt-7">
        <PriorityGuide />
      </div>
    </>
  );
}
