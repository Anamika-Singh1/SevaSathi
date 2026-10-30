import { getI18n } from "@/lib/i18n/server";
import { Badge } from "@/components/ui/badge";
import { STATUS } from "@/lib/status";
import type { ApplicationStatus } from "@/types/domain";

export async function StatusBadge({ status }: { status: ApplicationStatus }) {
  const { locale } = await getI18n();
  const entry = STATUS[status];
  return (
    <Badge className={entry.tone} title={entry[locale]}>
      <span className="size-1.5 rounded-full bg-current opacity-60" />
      {entry[locale]}
    </Badge>
  );
}
