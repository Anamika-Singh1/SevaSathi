"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/language-provider";
import type { MessageKey } from "@/lib/i18n";

const titles: Record<string, MessageKey> = {
  "/dashboard": "Dashboard", "/applications": "Applications",
  "/applications/new": "Add application", "/field-work": "Field verification",
  "/reviews": "Caseworker review", "/decisions": "Final decision",
  "/settings": "Account details",
};

export function WorkspaceTitle() {
  const pathname = usePathname();
  const { t } = useI18n();
  return <span className="block text-sm leading-7 font-semibold" data-testid="workspace-title">
    {t(titles[pathname] ?? (pathname.startsWith("/applications/") ? "Application details" : "Officer workspace"))}
  </span>;
}

export function WorkspaceAddAction() {
  const pathname = usePathname();
  const { t } = useI18n();
  if (["/dashboard", "/applications", "/applications/new"].includes(pathname)) return null;
  return <Button asChild><Link href="/applications/new"><Plus aria-hidden="true" />{t("Add application")}</Link></Button>;
}
