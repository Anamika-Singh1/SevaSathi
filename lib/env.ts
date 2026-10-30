import { z } from "zod";

const publicEnvSchema = z.object({
  url: z.url().refine((url) => /^https?:\/\//.test(url)),
  key: z.string().min(20),
});

export function getSupabaseConfig() {
  const parsed = publicEnvSchema.safeParse({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  return parsed.success ? parsed.data : null;
}
