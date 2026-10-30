"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { LANGUAGE_COOKIE } from "@/lib/i18n";

export async function setLanguage(value: unknown) {
  if (value !== "kn" && value !== "en") return { ok: false };
  const store = await cookies();
  store.set(LANGUAGE_COOKIE, value, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: true,
    secure: (await headers()).get("x-forwarded-proto") === "https",
  });
  revalidatePath("/", "layout");
  return { ok: true };
}
