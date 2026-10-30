import { STATUS } from "@/lib/status";

export const PAGE_SIZE = 10;
export const PRIORITY = {
  URGENT: {
    kn: "ತುರ್ತು",
    en: "Immediate",
    tone: "bg-rose-50 text-rose-900 ring-rose-200",
  },
  HIGH: {
    kn: "ಹೆಚ್ಚಿನ ಆದ್ಯತೆ",
    en: "High",
    tone: "bg-amber-50 text-amber-900 ring-amber-200",
  },
  NORMAL: {
    kn: "ಸಾಮಾನ್ಯ",
    en: "Normal",
    tone: "bg-teal-50 text-teal-900 ring-teal-200",
  },
  CLOSED: {
    kn: "ಪೂರ್ಣಗೊಂಡಿದೆ",
    en: "Completed",
    tone: "bg-slate-100 text-slate-700 ring-slate-200",
  },
} as const;
export type Priority = keyof typeof PRIORITY;
export type SearchParams = Record<string, string | string[] | undefined>;
export type ApplicationFilters = ReturnType<typeof parseApplicationFilters>;

export function parseApplicationFilters(params: SearchParams) {
  const value = (key: string) =>
    typeof params[key] === "string" ? (params[key] as string) : "";
  const requestedPage = Number(value("page"));
  return {
    q: value("q").trim().slice(0, 80),
    village: value("village").slice(0, 120),
    status: Object.hasOwn(STATUS, value("status")) ? value("status") : "",
    priority: Object.hasOwn(PRIORITY, value("priority"))
      ? value("priority")
      : "",
    overdue: ["yes", "no"].includes(value("overdue")) ? value("overdue") : "",
    view: ["pending", "attention", "final-review", "recent"].includes(
      value("view"),
    )
      ? value("view")
      : "",
    sort: ["oldest", "target", "priority", "recent"].includes(value("sort"))
      ? value("sort")
      : "oldest",
    page:
      Number.isSafeInteger(requestedPage) && requestedPage > 0
        ? Math.min(requestedPage, 100000)
        : 1,
  };
}

export function applicationPageHref(filters: ApplicationFilters, page: number) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (key !== "page" && value) params.set(key, String(value));
  }
  params.set("page", String(page));
  return `/applications?${params.toString()}`;
}

// Quote PostgREST grammar separately from SQL LIKE escaping. This keeps commas,
// quotes, parentheses and wildcard characters in search input literal.
export function applicationSearchExpression(search: string) {
  const pattern = `%${search.replace(/[\\%_*]/g, "\\$&")}%`;
  const quoted = `"${pattern.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  const parts = [
    `reference_number.ilike.${quoted}`,
    `applicant_name.ilike.${quoted}`,
  ];
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      search,
    )
  )
    parts.push(`id.eq.${search}`);
  return parts.join(",");
}
