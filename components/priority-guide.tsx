import { getI18n } from "@/lib/i18n/server";
import { Info } from "lucide-react";
import { getWorkflowSettings } from "@/services/applications";

export async function PriorityGuide() {
  const { t } = await getI18n();

  const settings = await getWorkflowSettings();
  return (
    <details className="group rounded-xl border border-border bg-white text-sm">
      <summary className="flex min-h-12 cursor-pointer items-center gap-2 rounded-xl p-4 font-medium focus-visible:outline-offset-2">
        <Info className="size-4 shrink-0 text-primary" />
        {t("Demo priority rules")}
        <span
          className="ml-auto text-primary group-open:rotate-45"
          aria-hidden="true"
        >
          +
        </span>
      </summary>
      <div className="space-y-3 border-t border-border p-4 text-xs leading-7 text-muted-foreground">
        <p className="font-medium text-foreground">
          {t(
            "Configurable demo thresholds, not official government deadlines.",
          )}
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            {t(
              "Immediate: target passed, at least {days} days in this stage, or {actions} unresolved actions.",
              {
                days: settings.stage_attention_days * 2,
                actions: settings.urgent_action_count,
              },
            )}
          </li>
          <li>
            {t(
              "High: at least {days} days in this stage, any unresolved action, or target due within {due} days.",
              {
                days: settings.stage_attention_days,
                due: settings.due_soon_days,
              },
            )}
          </li>
          <li>
            {t(
              "Target: recorded date, otherwise {days} calendar days after submission. Dates use India time; a case becomes overdue the following day.",
              { days: settings.target_days },
            )}
          </li>
          <li>
            {t(
              "Completed applications have no active priority. Recently processed means a human decision recorded in the last {days} days.",
              { days: settings.recent_processed_days },
            )}
          </li>
        </ul>
        <p>{t("An administrator can change the demo thresholds.")}</p>
      </div>
    </details>
  );
}
