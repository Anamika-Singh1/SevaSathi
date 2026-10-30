import { z } from "zod";
import { createTranslator, type Language } from "@/lib/i18n";

export function createLoginSchema(locale: Language) {
  const t = createTranslator(locale);
  return z.object({
    email: z
      .email(t("Enter a valid email"))
      .max(254, t("Email must be at most 254 characters."))
      .transform((v) => v.toLowerCase()),
    password: z
      .string()
      .min(1, t("Enter your password"))
      .max(128, t("Password must be at most 128 characters.")),
  });
}
export const loginSchema = createLoginSchema("kn");
export const applicationIdSchema = z.uuid();
