// This application uses server actions and Server Components exclusively for Auth.
// No browser Supabase client needs to read the session cookie.
export const authCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};
