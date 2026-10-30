import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createTranslator, LANGUAGE_COOKIE, parseLanguage } from "./index";

export const getI18n = cache(async () => {
  const locale = parseLanguage((await cookies()).get(LANGUAGE_COOKIE)?.value);
  return { locale, t: createTranslator(locale) };
});
