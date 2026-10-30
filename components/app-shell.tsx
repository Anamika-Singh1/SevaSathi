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
  ShieldCheck,
  ChevronRight,
  Menu,
} from "lucide-react";
import { NavLink } from "@/components/nav-link";
import { Brand } from "@/components/brand";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Button } from "@/components/ui/button";
import { logout } from "@/app/login/actions";
import { canAccessPath, ROLE_LABELS } from "@/lib/roles";
import { getI18n } from "@/lib/i18n/server";
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
        <Link href="/dashboard" className="px-7 py-8">
          <Brand />
        </Link>
        <p className="px-7 pt-2 pb-4 text-xs leading-7 font-semibold text-muted-foreground">
          {t("Officer workspace")}
        </p>
        <nav aria-label={t("Main navigation")} className="space-y-1 px-4">
          {navItems}
        </nav>
        <div className="mx-5 mt-auto mb-5 rounded-xl bg-[#12384b] p-4 text-white">
          <ShieldCheck
            className="mb-3 size-5 text-teal-200"
            aria-hidden="true"
          />
          <p className="text-sm leading-7 font-medium">
            {t("Secure workspace")}
          </p>
          <p className="mt-2 text-xs leading-7 text-slate-200">
            {t("Access follows your assigned role and jurisdiction.")}
          </p>
        </div>
        <form action={logout} className="border-t border-border p-4">
          <Button
            variant="ghost"
            className="w-full justify-start text-muted-foreground"
          >
            <LogOut />
            {t("Sign out")}
          </Button>
        </form>
      </aside>
      <header className="border-b border-border bg-white px-4 py-4 sm:px-8">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-4">
          <Link href="/dashboard" className="lg:hidden">
            <Brand />
          </Link>
          <div className="hidden items-center gap-2 text-xs leading-7 text-muted-foreground lg:flex">
            <MapPin
              className="size-4 shrink-0 text-primary"
              aria-hidden="true"
            />
            <span>
              {profile.district} · {t("District")}
            </span>
            <span aria-hidden="true">/</span>
            <span>
              {profile.taluk} · {t("Taluk")}
            </span>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-4 lg:ml-auto">
            <LanguageSwitcher />
            <div className="min-w-0 border-l border-border pl-4">
              <p className="text-sm leading-7 font-semibold break-words">
                {profile.full_name}
              </p>
              <p className="text-xs leading-7 text-muted-foreground">
                {ROLE_LABELS[profile.role][locale]}
              </p>
            </div>
          </div>
        </div>
        <details
          className="mt-4 rounded-xl border border-border lg:hidden"
          key={profile.role}
        >
          <summary className="flex min-h-12 cursor-pointer items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold">
            <Menu className="size-5 text-primary" aria-hidden="true" />
            {t("Navigation")}
            <ChevronRight className="ml-auto size-4" aria-hidden="true" />
          </summary>
          <nav
            aria-label={t("Mobile navigation")}
            className="grid gap-1 border-t border-border p-2 sm:grid-cols-2"
          >
            {navItems}
            <form action={logout} className="p-1">
              <Button variant="ghost" className="min-h-12 w-full justify-start">
                <LogOut />
                {t("Sign out")}
              </Button>
            </form>
          </nav>
        </details>
      </header>
      <main
        id="main-content"
        className="mx-auto min-w-0 max-w-[1720px] p-4 sm:p-8 xl:p-10"
      >
        {children}
      </main>
      <footer className="mx-4 flex flex-wrap justify-between gap-2 border-t border-border py-5 text-xs leading-7 text-muted-foreground sm:mx-8 xl:mx-10">
        <span>{t("SevaSathi · Kannada first")}</span>
        <span>{t("Phase 5 · Demonstration · Fictional data only")}</span>
      </footer>
    </div>
  );
}
