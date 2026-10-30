"use server";
import { getI18n } from "@/lib/i18n/server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireOfficer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  workflowActionSchema,
  payloadSchemaFor,
  workflowErrorMessage,
} from "@/lib/workflow";
import type { WorkflowAction } from "@/lib/workflow";

export type WorkflowResult = {
  ok: boolean;
  message: string;
  retryable?: boolean;
};

export async function submitWorkflow(input: {
  applicationId: string;
  action: WorkflowAction;
  version: number;
  requestId: string;
  payload: unknown;
}): Promise<WorkflowResult> {
  const { locale, t } = await getI18n();
  const { profile } = await requireOfficer();
  const envelope = z
    .object({
      applicationId: z.uuid(),
      action: workflowActionSchema,
      version: z.number().int().min(0),
      requestId: z.uuid(),
      payload: z.unknown(),
    })
    .strict()
    .safeParse(input);
  if (!envelope.success)
    return {
      ok: false,
      message: t("Invalid request. Reload this page."),
    };
  const payload = payloadSchemaFor(profile.role).safeParse(input.payload);
  if (!payload.success)
    return {
      ok: false,
      message: t(
        "Check the entries and date. Notes must be within 4000 characters.",
      ),
    };
  if (
    ["RETURN", "RESUME", "REJECT"].includes(input.action) &&
    payload.data.reason.trim().length < 5
  )
    return {
      ok: false,
      message: workflowErrorMessage("WORKFLOW_REASON_REQUIRED", locale),
    };
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("workflow_action", {
      target_id: input.applicationId,
      action: input.action,
      expected_version: input.version,
      request_id: input.requestId,
      payload: payload.data,
    });
    if (error)
      return {
        ok: false,
        message: workflowErrorMessage(error.message, locale),
        retryable: !error.message.startsWith("WORKFLOW_"),
      };
  } catch {
    return {
      ok: false,
      message: workflowErrorMessage("DATABASE_UNAVAILABLE", locale),
      retryable: true,
    };
  }
  for (const path of [
    "/dashboard",
    "/applications",
    `/applications/${input.applicationId}`,
    "/field-work",
    "/reviews",
    "/decisions",
  ])
    revalidatePath(path);
  return {
    ok: true,
    message: t("Saved successfully. History updated."),
  };
}
