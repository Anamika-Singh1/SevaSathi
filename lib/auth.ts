import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseConfig } from "@/lib/env";
import { canAccessPath, type Role } from "@/lib/roles";

// API operations spanning external work must call this again before returning data.
export async function readOfficer() {
  if (!getSupabaseConfig()) return null;
  const supabase = await createClient();
  // Verify identity with Auth; profile RLS additionally requires a live session
  // and active officer record. Never trust getSession().user.
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .eq("is_active", true)
    .maybeSingle();
  if (profileError || !profile) return { user, profile: null };
  return { user, profile };
}

export const getOfficer = cache(readOfficer);

export async function requireOfficer(roles?: readonly Role[]) {
  const officer = await getOfficer();
  if (!officer) redirect("/login");
  if (!officer.profile) redirect("/login?error=profile");
  if (roles && !roles.includes(officer.profile.role))
    redirect("/dashboard?notice=forbidden");
  return { user: officer.user, profile: officer.profile };
}

export async function requirePath(path: string) {
  const officer = await requireOfficer();
  if (!canAccessPath(officer.profile.role, path))
    redirect("/dashboard?notice=forbidden");
  return officer;
}
