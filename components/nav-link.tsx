"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function NavLink({
  href,
  className,
  children,
}: {
  href: string;
  className: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      onClick={(event) =>
        event.currentTarget.closest("details")?.removeAttribute("open")
      }
      aria-current={active ? "page" : undefined}
      className={cn(
        className,
        active && "bg-accent text-primary ring-1 ring-inset ring-primary/10",
      )}
    >
      {children}
    </Link>
  );
}
