import { AppShell } from "@/components/app-shell";
import { requireOfficer } from "@/lib/auth";

export const dynamic = "force-dynamic";
export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireOfficer();
  return <AppShell profile={profile}>{children}</AppShell>;
}
