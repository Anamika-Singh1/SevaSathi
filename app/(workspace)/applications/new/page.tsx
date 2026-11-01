import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ApplicationCreateForm } from "@/components/application-create-form";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/ui/button";
import { requireOfficer } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { intakeToday } from "@/lib/application-intake";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("Add application") };
}

export default async function NewApplicationPage() {
  const { profile } = await requireOfficer(["OPERATOR"]);
  const { t } = await getI18n();

  return (
    <>
      <PageHeading
        title={t("Add application")}
        description={t("Create a new income-certificate application.")}
      >
        <Button asChild variant="outline">
          <Link href="/applications">
            <ArrowLeft aria-hidden="true" />
            {t("Back to applications")}
          </Link>
        </Button>
      </PageHeading>
      <ApplicationCreateForm
        requestId={randomUUID()}
        district={profile.district}
        taluk={profile.taluk}
        today={intakeToday()}
      />
    </>
  );
}
