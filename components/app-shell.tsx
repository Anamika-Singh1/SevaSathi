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
  UserRound,
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
        className="group flex min-h-12 min-w-0 items-center gap-3 rounded-lg px-3 py-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-primary"
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
    <div className="min-h-svh min-w-0 lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col overflow-y-auto border-r border-border bg-white lg:flex">
        <Link href="/dashboard" className="border-b border-border px-6 py-6">
          <Brand />
        </Link>
        <p className="px-6 pt-6 pb-3 text-xs leading-7 font-medium text-muted-foreground">
          {t("Officer workspace")}
        </p>
        <nav aria-label={t("Main navigation")} className="space-y-1 px-4">
          {navItems}
        </nav>
        <div className="mt-auto border-t border-border p-6 text-sm leading-7 text-muted-foreground">
          <MapPin className="mb-2 size-4 text-primary" aria-hidden="true" />
          <p className="font-medium text-foreground">{locationLabel(profile.taluk, locale)}</p>
          <p>{locationLabel(profile.district, locale)} · {t("District")}</p>
        </div>
      </aside>
      <header className="border-b border-border bg-white px-4 py-4 sm:px-8">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-4">
          <Link href="/dashboard" className="lg:hidden">
            <Brand />
          </Link>
          <div className="hidden lg:block">
            <WorkspaceTitle />
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-3 lg:ml-auto">
            {profile.role === "OPERATOR" && <WorkspaceAddAction />}
            <LanguageSwitcher />
            <Button asChild variant="ghost" size="icon" className="sm:hidden">
              <Link href="/settings" aria-label={t("Account details")} title={officerLabel(profile.full_name, locale)}><UserRound aria-hidden="true" /></Link>
            </Button>
            <Link href="/settings" title={t("Account details")} className="hidden min-w-0 rounded-lg border-l border-border py-1 pl-4 sm:block hover:text-primary">
              <p className="text-sm leading-7 font-semibold break-words">
                {officerLabel(profile.full_name, locale)}
              </p>
              <p className="text-xs leading-7 text-muted-foreground">
                {ROLE_LABELS[profile.role][locale]}
              </p>
            </Link>
            <form action={logout}>
              <Button variant="ghost" size="icon" aria-label={t("Sign out")} title={t("Sign out")}>
                <LogOut aria-hidden="true" />
              </Button>
            </form>
          </div>
        </div>
        <details
          className="mt-4 rounded-xl border border-border lg:hidden"
          key={profile.role}
        >
          <summary className="flex min-h-12 cursor-pointer items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold">
            <Menu className="size-5 text-primary" aria-hidden="true" />
            <span className="sr-only">{t("Navigation")}: </span>
            <WorkspaceTitle />
            <ChevronRight className="ml-auto size-4" aria-hidden="true" />
          </summary>
          <nav
            aria-label={t("Mobile navigation")}
            className="grid gap-1 border-t border-border p-2 sm:grid-cols-2"
          >
            {navItems}
          </nav>
        </details>
      </header>
      <main
        id="main-content"
        className="mx-auto min-w-0 max-w-[1720px] p-4 sm:p-8 xl:p-10"
      >
        {children}
      </main>
    </div>
  );
}
