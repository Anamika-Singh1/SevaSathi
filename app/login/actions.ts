"use server";
import { getI18n } from "@/lib/i18n/server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseConfig } from "@/lib/env";
import { createLoginSchema } from "@/lib/validation";
import { safeNextPath, canAccessPath } from "@/lib/roles";

export type LoginState = {
  error?: string;
  fieldErrors?: { email?: string[]; password?: string[] };
};

export async function login(
  _state: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const { locale, t } = await getI18n();
  const parsed = createLoginSchema(locale).safeParse({
    email: String(formData.get("email") ?? "").trim(),
    password: formData.get("password"),
  });
  if (!parsed.success)
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  if (!getSupabaseConfig())
    return {
      error: t("Supabase setup is required."),
    };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user)
    return {
      error: t("Unable to sign in. Check your details or try again shortly."),
    };
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .eq("is_active", true)
    .maybeSingle();
  if (profileError || !profile) {
    await supabase.auth.signOut({ scope: "local" });
    return {
      error: t(
        profileError
          ? "Unable to verify officer access. Try again or ask your administrator to check the database setup."
          : "An active officer profile is required. Contact your administrator.",
      ),
    };
  }
  const next = safeNextPath(formData.get("next"));
  redirect(
    canAccessPath(profile.role, new URL(next, "http://localhost").pathname)
      ? next
      : "/dashboard",
  );
}

export async function logout() {
  if (getSupabaseConfig()) {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) redirect("/settings?error=logout");
  }
  redirect("/login?loggedOut=1");
}
