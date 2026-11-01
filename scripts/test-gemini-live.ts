import assert from "node:assert/strict";
import { GoogleGenAI } from "@google/genai";
import { AI_FEATURES, type AiFeature } from "../lib/ai/contracts";
import { getGeminiConfig } from "../lib/ai/config";
import { createGeminiGenerator } from "../lib/ai/gemini-provider";
import { AiError } from "../lib/ai/errors";

// Real, billable provider calls with fictional data only. This never connects
// to Supabase or modifies cases. Logs contain outcomes, never prompts or keys.
async function main() {
  const config = getGeminiConfig(process.env);
  const generate = createGeminiGenerator(new GoogleGenAI({ apiKey: config.key, vertexai: false }), config.model);
  const application = { certificate_type: "Income certificate", declared_annual_income: 48000, purpose: "Fictional scholarship application" };
  const officer_notes = [{ text: "Fictional intake note: income confirmation pending.", recorded_at: "2026-10-30T09:00:00.000Z" }];
  const field = {
    visit_date: "2026-10-30", observations: "Fictional visit: applicant works as an agricultural labourer. Income confirmation pending.",
    verification_checks: { identity_confirmed: true, residence_confirmed: true, income_assessed: false },
    verification_status: "NEEDS_CLARIFICATION", follow_up_questions: "How can the declared income be confirmed?",
    follow_up_resolved: false, report_submitted_at: null,
  };
  const review = { notes: "Fictional review: income assessment is not complete.", evidence_checks: { documents_reviewed: true, field_report_reviewed: true, income_reviewed: false }, issues: "Income confirmation pending", issues_resolved: false, submitted_at: null };
  for (const feature of Object.keys(AI_FEATURES) as AiFeature[]) {
    for (const language of ["kn", "en"] as const) {
      const screening = {
        checklist: [
          { item: language === "kn" ? "ನಿವಾಸದ ದಾಖಲೆ" : "Residence proof", required: true, status: "RECEIVED", note: "Receipt recorded; authenticity not established" },
          { item: language === "kn" ? "ಆದಾಯದ ದಾಖಲೆ" : "Income proof", required: true, status: "MISSING", note: "Not received" },
        ], required_items: 2, required_received: 1, notes: "Fictional screening: income proof missing.",
      };
      const context = {
        application, screening, officer_notes,
        ...(feature !== "screening" ? { field } : {}),
        ...(["review", "decision"].includes(feature) ? { review } : {}),
        ...(feature === "decision" ? { human_decision: { action: null, rationale: null, recorded_at: null, officially_recorded: false } } : {}),
      };
      const result = await generate(feature, { version: 0, language }, context, new AbortController().signal);
      assert.equal(result.stage, AI_FEATURES[feature].assistanceStage);
      assert.equal(result.language, language);
      console.log(`PASS: live Gemini ${feature}/${language}; validated structured output`);
    }
  }
  console.log("PASS: all eight fictional live-provider checks. Hosted application authorization and workflow must be tested separately.");
}

main().catch((error: unknown) => {
  const diagnostic = error instanceof AiError && typeof error.cause === "string" ? ` (${error.cause})` : "";
  console.error(error instanceof AiError ? `Live Gemini check failed: ${error.code}${diagnostic}. Check server configuration or retry later.` : "Live Gemini check failed. No response data is logged.");
  process.exitCode = 1;
});
