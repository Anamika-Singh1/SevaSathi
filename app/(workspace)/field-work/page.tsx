import { getI18n } from "@/lib/i18n/server";
import { RoleQueue } from "@/components/role-queue";
export default async function FieldWorkPage() {
  const { t } = await getI18n();

  return (
    <RoleQueue
      path="/field-work"
      status="FIELD_VERIFICATION"
      title={t("Field verification")}
      description={t("Applications assigned to you for field verification.")}
    />
  );
}
