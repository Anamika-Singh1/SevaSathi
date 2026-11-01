import { getI18n } from "@/lib/i18n/server";
import { locationLabel } from "@/lib/i18n/records";
import Link from "next/link";
import {
  Search,
  SlidersHorizontal,
  ArrowLeft,
  ArrowRight,
  Plus,
  X,
} from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { ApplicationTable } from "@/components/application-table";
import { PriorityGuide } from "@/components/priority-guide";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireOfficer } from "@/lib/auth";
import { STATUS } from "@/lib/status";
import {
  PRIORITY,
  parseApplicationFilters,
  applicationPageHref,
  type SearchParams,
} from "@/lib/application-filters";
import { listApplications, getVillages } from "@/services/applications";

const viewLabels: Record<string, import("@/lib/i18n").MessageKey> = {
  pending: "Pending applications",
  attention: "Immediate attention",
  "final-review": "Final review",
  recent: "Recently processed",
};
const selectClass =
  "min-h-11 w-full min-w-0 rounded-lg border border-input bg-white px-3 py-2 text-sm";

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { t, locale } = await getI18n();

  const { profile } = await requireOfficer();
  const filters = parseApplicationFilters(await searchParams);
  const [{ applications, count, page, totalPages, pageSize }, villages] =
    await Promise.all([listApplications(filters), getVillages()]);
  const activeCount = [
    filters.q,
    filters.village,
    filters.status,
    filters.priority,
    filters.overdue,
    filters.view,
  ].filter(Boolean).length;
  return (
    <>
      <PageHeading
        eyebrow={t("Application management")}
        title={t("Applications")}
        description={t(
          "Search and manage your authorized application register.",
        )}
      >
        {profile.role === "OPERATOR" && (
          <Button asChild>
            <Link href="/applications/new">
              <Plus aria-hidden="true" />
              {t("Add application")}
            </Link>
          </Button>
        )}
      </PageHeading>
      <form
        key={JSON.stringify(filters)}
        action="/applications"
        className="mb-6 rounded-xl border border-border bg-white p-4 sm:p-6"
      >
        <div className="mb-5 flex flex-wrap items-center gap-2 text-sm font-semibold">
          <SlidersHorizontal className="size-4 text-primary" />
          {t("Search & filters")}{" "}
          {activeCount > 0 && (
            <span className="rounded-full bg-accent px-2 py-1 text-xs text-primary">
              {activeCount}
            </span>
          )}
        </div>
        {filters.view && (
          <div className="mb-5">
            <input type="hidden" name="view" value={filters.view} />
            <span className="inline-flex flex-wrap items-center gap-2 rounded-lg bg-accent px-3 py-2 text-xs leading-6 text-primary">
              {t(viewLabels[filters.view])}
              <Link
                href={applicationPageHref({ ...filters, view: "" }, 1)}
                className="inline-flex size-11 items-center justify-center rounded-lg hover:bg-primary/10"
                aria-label={t("Remove view filter")}
              >
                <X className="size-4" />
              </Link>
            </span>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <div className="min-w-0 space-y-2 sm:col-span-2 xl:col-span-2">
            <label htmlFor="search" className="text-xs font-medium">
              {t("Name or application ID")}
            </label>
            <div className="relative">
              <Search className="absolute top-3.5 left-3 size-4 text-muted-foreground" />
              <Input
                id="search"
                name="q"
                defaultValue={filters.q}
                maxLength={80}
                placeholder={t("Name, SS-2026-0001…")}
                className="pl-9"
              />
            </div>
          </div>
          <div className="min-w-0 space-y-2">
            <label htmlFor="village" className="text-xs font-medium">
              {t("Village")}
            </label>
            <select
              id="village"
              name="village"
              defaultValue={filters.village}
              className={selectClass}
            >
              <option value="">{t("All villages")}</option>
              {filters.village && !villages.includes(filters.village) && (
                <option value={filters.village}>{locationLabel(filters.village, locale)}</option>
              )}
              {villages.map((village) => (
                <option key={village} value={village}>
                  {locationLabel(village, locale)}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-0 space-y-2">
            <label htmlFor="status" className="text-xs font-medium">
              {t("Workflow stage")}
            </label>
            <select
              id="status"
              name="status"
              defaultValue={filters.status}
              className={selectClass}
            >
              <option value="">{t("All stages")}</option>
              {Object.entries(STATUS).map(([value, entry]) => (
                <option key={value} value={value}>
                  {entry[locale]}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-0 space-y-2">
            <label htmlFor="priority" className="text-xs font-medium">
              {t("Priority")}
            </label>
            <select
              id="priority"
              name="priority"
              defaultValue={filters.priority}
              className={selectClass}
            >
              <option value="">{t("All priorities")}</option>
              {Object.entries(PRIORITY).map(([value, entry]) => (
                <option key={value} value={value}>
                  {entry[locale]}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-0 space-y-2">
            <label htmlFor="overdue" className="text-xs font-medium">
              {t("Overdue status")}
            </label>
            <select
              id="overdue"
              name="overdue"
              defaultValue={filters.overdue}
              className={selectClass}
            >
              <option value="">{t("All applications")}</option>
              <option value="yes">{t("Overdue")}</option>
              <option value="no">{t("Not overdue")}</option>
            </select>
          </div>
          <div className="min-w-0 space-y-2">
            <label htmlFor="sort" className="text-xs font-medium">
              {t("Sort by")}
            </label>
            <select
              id="sort"
              name="sort"
              defaultValue={filters.sort}
              className={selectClass}
            >
              <option value="oldest">{t("Oldest pending")}</option>
              <option value="target">{t("Target date")}</option>
              <option value="priority">{t("Priority first")}</option>
              <option value="recent">{t("Recently processed")}</option>
            </select>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-5">
          <Button type="submit">
            <Search />
            {t("Apply")}
          </Button>
          <Button asChild variant="outline">
            <Link href="/applications">
              <X />
              {t("Clear filters")}
            </Link>
          </Button>
        </div>
      </form>
      <div className="mb-4 flex flex-wrap justify-between gap-2 text-xs leading-6 text-muted-foreground">
        <p role="status" aria-live="polite" data-testid="result-count">
          {count
            ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, count)} / ${count}`
            : "0"}{" "}
          {t("applications")}
        </p>
        <p>{t("Page {page} of {total}", { page, total: totalPages })}</p>
      </div>
      <ApplicationTable applications={applications} />
      {totalPages > 1 && (
        <nav
          aria-label={t("Application pages")}
          className="mt-5 flex flex-wrap items-center justify-between gap-3"
        >
          {page > 1 ? (
            <Button asChild variant="outline">
              <Link href={applicationPageHref(filters, page - 1)} rel="prev">
                <ArrowLeft />
                {t("Previous")}
              </Link>
            </Button>
          ) : (
            <Button variant="outline" disabled>
              <ArrowLeft />
              {t("Previous")}
            </Button>
          )}
          <span className="text-sm tabular-nums">
            {page} / {totalPages}
          </span>
          {page < totalPages ? (
            <Button asChild variant="outline">
              <Link href={applicationPageHref(filters, page + 1)} rel="next">
                {t("Next")}
                <ArrowRight />
              </Link>
            </Button>
          ) : (
            <Button variant="outline" disabled>
              {t("Next")}
              <ArrowRight />
            </Button>
          )}
        </nav>
      )}
      <div className="mt-7">
        <PriorityGuide />
      </div>
    </>
  );
}
