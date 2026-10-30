import { getI18n } from "@/lib/i18n/server";
import { RoleQueue } from "@/components/role-queue";
export default async function DecisionsPage() {
  const { t } = await getI18n();

  return (
    <RoleQueue
      path="/decisions"
      status="PENDING_APPROVAL"
      title={t("Final decision")}
      eyebrow={t("Approving officer queue")}
      description={t("Applications awaiting a final decision in your taluk.")}
    />
  );
}
