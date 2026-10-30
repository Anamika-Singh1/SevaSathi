import { getI18n } from "@/lib/i18n/server";
import { RoleQueue } from "@/components/role-queue";
export default async function ReviewsPage() {
  const { t } = await getI18n();

  return (
    <RoleQueue
      path="/reviews"
      status="UNDER_REVIEW"
      title={t("Caseworker review")}
      eyebrow={t("Caseworker queue")}
      description={t("Applications awaiting caseworker review in your taluk.")}
    />
  );
}
