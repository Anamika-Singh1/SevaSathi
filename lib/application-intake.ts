import { z } from "zod";
import { createTranslator, type Language } from "@/lib/i18n";

export const INTAKE_DOCUMENTS = [
  { key: "income_declaration", label: "Income declaration" },
  { key: "identity_proof", label: "Identity proof" },
  { key: "residence_proof", label: "Residence proof" },
] as const;

export function intakeToday(now = new Date()) {
  return new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

export function createApplicationSchema(locale: Language) {
  const t = createTranslator(locale);
  const nameMessage = t("Enter the applicant name (1–120 characters).");
  const villageMessage = t("Enter a village (1–120 characters).");
  const incomeMessage = t("Enter annual income from 0 to 9999999999.99, with at most two decimal places.");
  const purposeMessage = t("Enter a purpose (1–500 characters).");
  return z.strictObject({
    requestId: z.uuid(),
    applicant_name: z.string({ error: nameMessage }).trim().min(1, nameMessage).max(120, nameMessage),
    village: z.string({ error: villageMessage }).trim().min(1, villageMessage).max(120, villageMessage),
    annual_income: z.string({ error: incomeMessage })
      .regex(/^\d{1,10}(?:\.\d{1,2})?$/, incomeMessage)
      .transform(Number),
    purpose: z.string({ error: purposeMessage }).trim().min(1, purposeMessage).max(500, purposeMessage),
    certificate_type: z.literal("INCOME", { error: t("Select the income certificate service.") }),
    application_date: z.iso.date({ error: t("Enter a valid application date, today or earlier.") })
      .refine((date) => date >= "1900-01-01" && date <= intakeToday(), t("Enter a valid application date, today or earlier.")),
    documents: z.array(z.strictObject({
      key: z.enum(["income_declaration", "identity_proof", "residence_proof"]),
      status: z.enum(["RECEIVED", "MISSING"]),
    }), { error: t("Record a receipt status for every required document.") })
      .length(3, t("Record a receipt status for every required document."))
      .refine((items) => new Set(items.map((item) => item.key)).size === 3,
        t("Record a receipt status for every required document.")),
    notes: z.string({ error: t("Notes must contain at most 4000 characters.") }).trim()
      .max(4000, t("Notes must contain at most 4000 characters.")).optional().default(""),
  });
}
