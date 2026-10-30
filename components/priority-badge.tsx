import { getI18n } from "@/lib/i18n/server";
import { Badge } from "@/components/ui/badge";
import { PRIORITY, type Priority } from "@/lib/application-filters";

export async function PriorityBadge({ priority }: { priority: Priority }) {
  const { locale } = await getI18n();
  const entry = PRIORITY[priority];
  return (
    <Badge className={entry.tone} title={entry[locale]}>
      <span className="size-1.5 rounded-full bg-current" />
      {entry[locale]}
    </Badge>
  );
}
