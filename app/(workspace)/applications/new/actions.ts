"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOfficer } from "@/lib/auth";
import { createApplicationSchema } from "@/lib/application-intake";
import { getI18n } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

type IntakeField = "applicant_name" | "village" | "annual_income" | "purpose" | "certificate_type" | "application_date" | "documents" | "notes";
export type CreateApplicationResult =
  | { ok: false; message: string; fieldErrors?: Partial<Record<IntakeField, string[]>> }
  | { ok: true; applicationId: string; referenceNumber: string };

const receiptSchema = z.object({
  application_id: z.uuid(),
  reference_number: z.string().regex(/^SS-\d{4}-\d{4,8}$/),
  duplicate: z.boolean(),
});

export async function createApplication(input: unknown): Promise<CreateApplicationResult> {
  // Keep the authorization redirect outside the error handler. The RPC also
  // verifies the active operator and live Auth session before any write.
  await requireOfficer(["OPERATOR"]);
  const { locale, t } = await getI18n();
  const parsed = createApplicationSchema(locale).safeParse(input);
  if (!parsed.success) {
    const errors = z.flattenError(parsed.error);
    const { requestId: requestErrors, ...fieldErrors } = errors.fieldErrors;
    return {
      ok: false,
      message: t(requestErrors || errors.formErrors.length
        ? "Invalid application request. Reload this page and try again."
        : "Review the entries highlighted below."),
      fieldErrors,
    };
  }

  const failed: CreateApplicationResult = {
    ok: false,
    message: t("Unable to create the application. Your entries are retained. Retry safely."),
  };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("create_application", {
      request_id: parsed.data.requestId,
      applicant_name: parsed.data.applicant_name,
      village: parsed.data.village,
      annual_income: parsed.data.annual_income,
      purpose: parsed.data.purpose,
      certificate_type: parsed.data.certificate_type,
      application_date: parsed.data.application_date,
      documents: parsed.data.documents,
      notes: parsed.data.notes,
    });
    if (error) {
      const safeCode = /^(?:[A-Z0-9]{5}|PGRST\d{3})$/.test(error.code ?? "") ? error.code : "UNKNOWN";
      const knownReasons = ["INTAKE_FORBIDDEN", "INTAKE_INVALID_INPUT", "INTAKE_REQUEST_REUSED", "INTAKE_UNAVAILABLE"];
      console.error("[application-intake] RPC failed", {
        code: safeCode,
        reason: knownReasons.includes(error.message) ? error.message : "PROVIDER_ERROR",
        requestId: parsed.data.requestId,
      });
      if (error.code === "PGRST202") {
        return { ok: false, message: t("Application creation is not configured. Ask the administrator to apply the application intake migration.") };
      }
      if (error.message === "INTAKE_REQUEST_REUSED") {
        return { ok: false, message: t("This form was already submitted. Open Applications to find the saved case.") };
      }
      if (error.code === "42501" || error.message === "INTAKE_FORBIDDEN") {
        return { ok: false, message: t("Only an active operator can create applications. Sign in again or contact your administrator.") };
      }
      if (error.message === "INTAKE_INVALID_INPUT") {
        return { ok: false, message: t("Review the application date and document receipts, then try again. Your entries are retained.") };
      }
      return failed;
    }
    const receipt = receiptSchema.safeParse(data);
    if (!receipt.success) return failed;
    revalidatePath("/dashboard");
    revalidatePath("/applications");
    return {
      ok: true,
      applicationId: receipt.data.application_id,
      referenceNumber: receipt.data.reference_number,
    };
  } catch {
    return failed;
  }
}
