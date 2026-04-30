import { z } from "zod/v4";

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  UP_API_ENCRYPTION_KEY: z
    .string()
    .length(64)
    .regex(/^[0-9a-f]+$/i, "Must be a 64-character hex string")
    .optional(),
  CRON_SECRET: z.string().min(1).optional(),
  // Comma-separated email allowlist for admin routes (e.g. /admin/*).
  // Optional - if unset, no one is treated as admin.
  ADMIN_EMAILS: z.string().optional(),
});

export function validateEnv() {
  // Skip strict validation in demo mode — demo doesn't need service keys
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
    return;
  }

  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error(
      "Missing or invalid environment variables:",
      result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`)
    );
    throw new Error("Invalid environment configuration. Check server logs.");
  }
}
