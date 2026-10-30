import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseConfig } from "@/lib/env";
import { authCookieOptions } from "@/lib/supabase/cookies";
import type { Database } from "@/types/database";

export async function createClient() {
  const config = getSupabaseConfig();
  if (!config) throw new Error("Supabase is not configured. Follow README.md.");
  const cookieStore = await cookies();
  return createServerClient<Database>(config.url, config.key, {
    cookieOptions: authCookieOptions,
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, { ...options, ...authCookieOptions }),
          );
        } catch {
          // Server Components cannot mutate cookies; proxy.ts handles refresh before rendering.
        }
      },
    },
  });
}
