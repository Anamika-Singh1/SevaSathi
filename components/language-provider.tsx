"use client";

import { createContext, useContext, useEffect, useMemo } from "react";
import { createTranslator, type Language, type Translator } from "@/lib/i18n";

const Context = createContext<{ locale: Language; t: Translator } | null>(null);
export function LanguageProvider({
  locale,
  children,
}: {
  locale: Language;
  children: React.ReactNode;
}) {
  const value = useMemo(
    () => ({ locale, t: createTranslator(locale) }),
    [locale],
  );
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useI18n() {
  const value = useContext(Context);
  if (!value) throw new Error("LanguageProvider is required");
  return value;
}
