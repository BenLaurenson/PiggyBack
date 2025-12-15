import { z } from "zod/v4";

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  UP_API_ENCRYPTION_KEY: z
    .string()
    .length(64)
    .regex(/^[0-9a-f]+$/i, "Must be a 64-character hex string"),
  CRON_SECRET: z.string().min(1),
});

export function validateEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error(
      "Missing or invalid environment variables:",
      result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`)
    );
    throw new Error("Invalid environment configuration. Check server logs.");
  }
}
