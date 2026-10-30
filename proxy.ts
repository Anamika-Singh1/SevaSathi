import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig } from "@/lib/env";
import { isProtectedPath } from "@/lib/roles";
import { authCookieOptions } from "@/lib/supabase/cookies";
import type { Database } from "@/types/database";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const config = getSupabaseConfig();
  const protect = isProtectedPath(request.nextUrl.pathname);

  function loginRedirect() {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set(
      "next",
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
    );
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    redirect.headers.set("Cache-Control", "private, no-store, max-age=0");
    return redirect;
  }

  if (!config) return protect ? loginRedirect() : response;
  const supabase = createServerClient<Database>(config.url, config.key, {
    cookieOptions: authCookieOptions,
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, {
            ...options,
            ...authCookieOptions,
          }),
        );
        if (headers)
          Object.entries(headers).forEach(([name, value]) =>
            response.headers.set(name, value),
          );
      },
    },
  });

  // Refresh before generating a response. Pages and services independently authorize access.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (protect && !user) return loginRedirect();
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

export const config = {
  matcher: [
    "/",
    "/login",
    "/dashboard/:path*",
    "/applications/:path*",
    "/field-work/:path*",
    "/reviews/:path*",
    "/decisions/:path*",
    "/settings/:path*",
  ],
};
