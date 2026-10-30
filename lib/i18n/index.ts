import english from "./en.json";
import kannada from "./kn.json";

export type Language = "kn" | "en";
export type MessageKey = keyof typeof english;
export const LANGUAGE_COOKIE = "sevasathi_language";
export const DEFAULT_LANGUAGE: Language = "kn";
export const catalogs: Record<Language, Record<MessageKey, string>> = {
  kn: kannada,
  en: english,
};
export function parseLanguage(value: unknown): Language {
  return value === "en" ? "en" : "kn";
}
export function requestLanguage(cookie: string | null): Language {
  const value = cookie?.match(/(?:^|;\s*)sevasathi_language=([^;]*)/)?.[1];
  try {
    return parseLanguage(value ? decodeURIComponent(value) : undefined);
  } catch {
    return DEFAULT_LANGUAGE;
  }
}
export function createTranslator(language: Language) {
  return (key: MessageKey, values: Record<string, string | number> = {}) =>
    catalogs[language][key].replace(/\{(\w+)\}/g, (match, name: string) =>
      Object.hasOwn(values, name) ? String(values[name]) : match,
    );
}
export type Translator = ReturnType<typeof createTranslator>;
const messageKeys = new Map<string, MessageKey>(
  (Object.keys(english) as MessageKey[]).flatMap((key) => [
    [english[key], key],
    [kannada[key], key],
  ]),
);
// Only system messages use this lookup; officer-entered notes are never translated.
export function translateMessage(message: string, language: Language) {
  const key = messageKeys.get(message);
  return key ? createTranslator(language)(key) : message;
}
export function languageTag(language: Language) {
  return language === "kn" ? "kn-IN" : "en-IN";
}
export function localizedLabel<T extends { kn: string; en: string }>(
  entry: T,
  language: Language,
) {
  return entry[language];
}
