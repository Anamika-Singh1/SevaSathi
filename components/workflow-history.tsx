import { getI18n } from "@/lib/i18n/server";
import { languageTag } from "@/lib/i18n";
import { eventLabel } from "@/lib/i18n/records";
import { Circle } from "lucide-react";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import {
  stageLabel,
  VERIFICATION_STATUS,
  RECEIPT_STATUS,
} from "@/lib/workflow";
import { STATUS } from "@/lib/status";
import type {
  ApplicationEvent,
  ApplicationStatus,
  ChecklistItem,
} from "@/types/domain";

export async function WorkflowHistory({
  events,
  checklist = [],
}: {
  events: ApplicationEvent[];
  checklist?: ChecklistItem[];
}) {
  const { t, locale } = await getI18n();

  return (
    <ol className="space-y-6" data-testid="workflow-history">
      {events.map((event) => {
        const metadata =
          event.metadata &&
          typeof event.metadata === "object" &&
          !Array.isArray(event.metadata)
            ? event.metadata
            : {};
        const stage = (value: unknown) =>
          typeof value === "string" && Object.hasOwn(STATUS, value)
            ? stageLabel(value as ApplicationStatus, locale)
            : "—";
        const prior =
          event.previous_state &&
          typeof event.previous_state === "object" &&
          !Array.isArray(event.previous_state)
            ? event.previous_state
            : {};
        const following =
          event.new_state &&
          typeof event.new_state === "object" &&
          !Array.isArray(event.new_state)
            ? event.new_state
            : {};
        const from = prior.stage ?? metadata.from_status;
        const to = following.stage ?? metadata.to_status ?? metadata.status;
        const note =
          event.reason ??
          metadata.screening_notes ??
          metadata.observations ??
          metadata.caseworker_notes;
        const labels: Record<string, string> = {
          verification_status: t("Verification"),
          follow_up_questions: t("Follow-up questions"),
          follow_up_resolved: t("Questions resolved"),
          review_issues: t("Review issues"),
          review_issues_resolved: t("Issues resolved"),
          return_to_stage: t("Return destination"),
        };
        const display = (key: string, value: unknown) =>
          key === "return_to_stage"
            ? stage(value)
            : typeof value === "boolean"
              ? value
                ? t("Yes")
                : t("No")
              : key === "verification_status" && typeof value === "string"
                ? VERIFICATION_STATUS[value as keyof typeof VERIFICATION_STATUS]
                  ? t(
                      VERIFICATION_STATUS[
                        value as keyof typeof VERIFICATION_STATUS
                      ],
                    )
                  : value
                : String(value ?? "—");
        return (
          <li
            key={event.id}
            className="flex gap-3"
            data-event-type={event.event_type}
            data-event-sequence={event.sequence}
          >
            <Circle className="mt-2 size-3 shrink-0 fill-teal-100 text-primary" />
            <div className="min-w-0">
              <p className="text-sm leading-8 font-medium">
                {eventLabel(event.event_type, locale)}
              </p>
              <p className="mt-1 text-xs leading-7 text-muted-foreground">
                {event.actor_role === "SYSTEM" ? (
                  t("System")
                ) : (
                  <>
                    {event.actor_role === "LEGACY_UNKNOWN" &&
                    event.actor_name === "ಹಿಂದಿನ ಅಧಿಕಾರಿ / Historical officer"
                      ? t("Historical officer")
                      : event.actor_name}{" "}
                    ·{" "}
                    {ROLE_LABELS[event.actor_role as Role]?.[locale] ??
                      t("Historical role unknown")}
                  </>
                )}
              </p>
              <time
                dateTime={event.created_at}
                className="text-xs leading-7 text-muted-foreground"
              >
                {new Intl.DateTimeFormat(languageTag(locale), {
                  dateStyle: "medium",
                  timeStyle: "medium",
                  timeZone: "Asia/Kolkata",
                }).format(new Date(event.created_at))}
              </time>
              {from || to ? (
                <p className="mt-2 text-xs leading-7">
                  <span className="font-medium">{t("Before:")}</span>{" "}
                  {stage(from)}
                  <br />
                  <span className="font-medium">{t("After:")}</span> {stage(to)}
                </p>
              ) : null}
              {event.event_type === "CHECKLIST_CHANGED" && (
                <p className="mt-2 text-xs leading-7">
                  {(
                    locale === "kn"
                      ? metadata.label_kn
                      : checklist.find((item) => item.key === metadata.key)
                          ?.label_en
                  )
                    ? String(
                        locale === "kn"
                          ? metadata.label_kn
                          : checklist.find((item) => item.key === metadata.key)
                              ?.label_en,
                      )
                    : String(metadata.key)}
                  :{" "}
                  {t(
                    RECEIPT_STATUS[
                      String(metadata.before) as keyof typeof RECEIPT_STATUS
                    ] ?? "Not recorded",
                  )}{" "}
                  →{" "}
                  {t(
                    RECEIPT_STATUS[
                      String(metadata.after) as keyof typeof RECEIPT_STATUS
                    ] ?? "Not recorded",
                  )}
                  {metadata.note ? ` · ${String(metadata.note)}` : ""}
                </p>
              )}
              <ul className="mt-2 space-y-1 text-xs leading-7">
                {Object.entries(labels)
                  .filter(
                    ([key]) =>
                      Object.hasOwn(following, key) &&
                      JSON.stringify(prior[key]) !==
                        JSON.stringify(following[key]),
                  )
                  .map(([key, label]) => (
                    <li key={key}>
                      <span className="font-medium">{label}:</span>{" "}
                      {display(key, prior[key])} →{" "}
                      {display(key, following[key])}
                    </li>
                  ))}
              </ul>
              {typeof note === "string" && note && (
                <p className="mt-2 border-l-2 border-primary/25 pl-3 text-sm leading-8 whitespace-pre-wrap">
                  {t("Reason / note:")}
                  {note}
                </p>
              )}
            </div>
          </li>
        );
      })}
      {!events.length && (
        <li className="text-sm text-muted-foreground">
          {t("No recorded activity")}
        </li>
      )}
    </ol>
  );
}
