import { getI18n } from "@/lib/i18n/server";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ShieldCheck, LockKeyhole } from "lucide-react";
import { requireOfficer } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/roles";
import { PageHeading } from "@/components/page-heading";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { logout } from "@/app/login/actions";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { t, locale } = await getI18n();

  const { user, profile } = await requireOfficer();
  const params = await searchParams;
  const fields = [
    [t("Name"), profile.full_name],
    [t("Email"), user.email ?? "—"],
    [t("Role"), ROLE_LABELS[profile.role][locale]],
    [t("District"), profile.district],
    [t("Taluk"), profile.taluk],
  ];
  return (
    <>
      <PageHeading
        eyebrow={t("Account & access")}
        title={t("Account details")}
        description={t("Your officer profile and security details.")}
      />
      {params.error === "logout" && (
        <p
          role="alert"
          className="mb-6 rounded-lg bg-red-50 p-4 text-sm text-red-800"
        >
          {t("Sign out failed. Please try again.")}
        </p>
      )}
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold">{t("Officer profile")}</h2>
          </CardHeader>
          <CardContent>
            <dl className="space-y-6">
              {fields.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="mt-2 text-sm font-medium break-words">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold">
                {t("Language preference")}
              </h2>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-sm leading-8 text-muted-foreground">
                {t("Your language is saved in this browser for future visits.")}
              </p>
              <LanguageSwitcher />
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <ShieldCheck className="mb-4 size-6 text-primary" />
              <h2 className="text-sm font-semibold">
                {t("Role & jurisdiction")}
              </h2>
              <p className="mt-3 text-xs leading-7 text-muted-foreground">
                <span lang={locale}>
                  {t(
                    "Only an administrator can change your role, jurisdiction, or account status. Contact them if these details need updating.",
                  )}
                </span>
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <LockKeyhole className="mb-4 size-6 text-primary" />
              <h2 className="text-sm font-semibold">{t("Secure sign out")}</h2>
              <p
                lang={locale}
                className="my-3 text-xs leading-6 text-muted-foreground"
              >
                {t(
                  "End the session on this browser when you finish your work.",
                )}
              </p>
              <form action={logout}>
                <Button type="submit" variant="outline">
                  {t("Sign out")}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
