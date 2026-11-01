import Link from "next/link";
import {
  LayoutDashboard,
  Files,
  MapPinned,
  ClipboardCheck,
  Stamp,
  Settings2,
  LogOut,
  MapPin,
  ChevronRight,
  Menu,
} from "lucide-react";
import { NavLink } from "@/components/nav-link";
import { Brand } from "@/components/brand";
import { LanguageSwitcher } from "@/components/language-switcher";
import { WorkspaceTitle, WorkspaceAddAction } from "@/components/workspace-title";
import { Button } from "@/components/ui/button";
import { logout } from "@/app/login/actions";
import { canAccessPath, ROLE_LABELS } from "@/lib/roles";
import { getI18n } from "@/lib/i18n/server";
import { locationLabel, officerLabel } from "@/lib/i18n/records";
import type { MessageKey } from "@/lib/i18n";
import type { Profile } from "@/types/domain";

const navigation: { href: string; label: MessageKey; icon: typeof Files }[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/applications", label: "Applications", icon: Files },
  { href: "/field-work", label: "Field verification", icon: MapPinned },
  { href: "/reviews", label: "Caseworker review", icon: ClipboardCheck },
  { href: "/decisions", label: "Final decision", icon: Stamp },
  { href: "/settings", label: "Account details", icon: Settings2 },
];
export async function AppShell({
  profile,
  children,
}: {
  profile: Profile;
  children: React.ReactNode;
}) {
  const { t, locale } = await getI18n();
  const navItems = navigation
    .filter((item) => canAccessPath(profile.role, item.href))
    .map(({ href, label, icon: Icon }) => (
      <NavLink
        key={href}
        href={href}
        className="workspace-nav-link group flex min-h-12 min-w-0 items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-primary"
      >
        <Icon className="size-[18px] shrink-0" aria-hidden="true" />
        <span className="min-w-0 leading-7 font-medium">{t(label)}</span>
        <ChevronRight
          className="ml-auto size-3 shrink-0 opacity-0 group-hover:opacity-100"
          aria-hidden="true"
        />
      </NavLink>
    ));
  return (
    <div className="min-h-svh min-w-0">
      <header className="portal-header border-b-[3px] border-[#41698e] px-4 py-3 lg:px-0 lg:py-4">
        <div className="mx-auto flex max-w-[1720px] flex-wrap items-center justify-between gap-3 lg:gap-0">
          <Link href="/dashboard" className="shrink-0 lg:w-60 lg:px-6"><Brand dark /></Link>
          <div className="hidden min-w-0 border-l border-white/20 px-8 lg:block">
            <WorkspaceTitle />
            <p className="mt-1 text-xs leading-7 text-slate-200">
              {locationLabel(profile.taluk, locale)} · {t("Taluk")}
            </p>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-3 lg:ml-auto lg:pr-7">
            {profile.role === "OPERATOR" && <WorkspaceAddAction className="border border-white/30 bg-white text-primary hover:bg-slate-100" />}
            <LanguageSwitcher />
            <Link href="/settings" title={t("Account details")} className="hidden min-w-0 rounded border-l border-white/25 py-1 pl-4 lg:block">
              <p className="text-sm leading-7 font-semibold break-words">{officerLabel(profile.full_name, locale)}</p>
              <p className="text-xs leading-7 text-slate-200">{ROLE_LABELS[profile.role][locale]}</p>
            </Link>
            <form action={logout} className="hidden lg:block">
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 hover:text-white" aria-label={t("Sign out")} title={t("Sign out")}>
                <LogOut aria-hidden="true" />
              </Button>
            </form>
          </div>
        </div>
        <details className="mt-3 rounded border border-white/25 lg:hidden" key={profile.role}>
          <summary className="flex min-h-12 cursor-pointer items-center gap-2 rounded px-3 py-2 text-sm font-semibold">
            <Menu className="size-5 shrink-0" aria-hidden="true" />
            <span className="sr-only">{t("Navigation")}: </span><WorkspaceTitle />
            <ChevronRight className="ml-auto size-4 shrink-0" aria-hidden="true" />
          </summary>
          <div className="border-t border-white/20 bg-white text-foreground">
            <nav aria-label={t("Mobile navigation")} className="grid gap-1 p-2 sm:grid-cols-2">{navItems}</nav>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
              <NavLink href="/settings" className="min-w-0 rounded px-2 py-1 text-sm leading-7 font-medium">{officerLabel(profile.full_name, locale)}</NavLink>
              <form action={logout}><Button variant="outline"><LogOut aria-hidden="true" />{t("Sign out")}</Button></form>
            </div>
          </div>
        </details>
      </header>
      <div className="mx-auto grid min-w-0 max-w-[1720px] lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="portal-sidebar hidden border-r border-border bg-white lg:block">
          <div className="sticky top-0 flex min-h-[calc(100svh_-_108px)] flex-col py-6">
            <p className="mb-4 px-6 text-sm leading-7 font-semibold text-primary">{t("Officer workspace")}</p>
            <nav aria-label={t("Main navigation")} className="space-y-1 px-3">{navItems}</nav>
            <div className="mx-5 mt-auto border-t border-border pt-5 text-sm leading-7 text-muted-foreground">
              <MapPin className="mb-2 size-4 text-primary" aria-hidden="true" />
              <p className="font-semibold text-foreground">{locationLabel(profile.taluk, locale)}</p>
              <p>{locationLabel(profile.district, locale)} · {t("District")}</p>
            </div>
          </div>
        </aside>
        <main id="main-content" className="min-w-0 p-4 sm:p-7 xl:p-8">{children}</main>
      </div>
    </div>
  );
}
