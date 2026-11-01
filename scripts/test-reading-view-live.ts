import assert from "node:assert/strict";
import { GoogleGenAI } from "@google/genai";
import { getGeminiConfig } from "../lib/ai/config";
import { createReadingGenerator } from "../lib/ai/reading-provider";
import { AiError } from "../lib/ai/errors";

// Four real provider calls with fictional text. No database access, saved case
// changes, real names, source-text logging or translated-output logging.
async function main() {
  const config = getGeminiConfig(process.env);
  const generate = createReadingGenerator(new GoogleGenAI({ apiKey: config.key, vertexai: false }), config.model);
  for (const language of ["kn", "en"] as const) {
    for (const type of ["applicant_name", "note"] as const) {
      const original = type === "applicant_name"
        ? language === "kn" ? "Fictional Kavya" : "ಕಾಲ್ಪನಿಕ ಕಾವ್ಯಾ"
        : language === "kn" ? "Income confirmation is pending. Recorded amount: 48000."
          : "ಆದಾಯ ದೃಢೀಕರಣ ಬಾಕಿಯಿದೆ. ದಾಖಲಾದ ಮೊತ್ತ: 48000.";
      const result = await generate({ key: type, type, original }, language, new AbortController().signal);
      assert.equal(result.language, language);
      if (language === "kn") assert.match(result.translation, /[\u0c80-\u0cff]/);
      console.log(`PASS: live Gemini reading translation ${type}/${language}; validated output and numeral preservation.`);
    }
  }
}
main().catch((error: unknown) => {
  console.error(error instanceof AiError ? `Live reading check failed: ${error.code}. No text or keys logged.` : "Live reading check failed. No text or keys logged.");
  process.exitCode = 1;
});
