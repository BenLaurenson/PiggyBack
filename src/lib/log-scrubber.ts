/**
 * Log scrubber for the orchestrator and per-tenant deploys.
 *
 * Wraps `console.log/info/warn/error` with regex-redaction for any
 * secret-shaped strings before they reach Vercel's log drain.
 *
 * Phase 3.8 of the hosted-platform plan: "Logs scrubbed for PAT, service
 * role key, and any secret-shaped string."
 *
 * Patterns covered (extend the array as new credential formats appear):
 *   up:[a-z]+:[A-Za-z0-9]{60,}     Up Bank PAT
 *   sb_secret_[A-Za-z0-9]{20,}     Supabase service role secret
 *   sb_publishable_[A-Za-z0-9]{20,} Supabase anon (less sensitive but still PII-shaped)
 *   sbp_[A-Za-z0-9]{20,}            Supabase Mgmt token
 *   sba_[A-Za-z0-9]{20,}            Supabase OAuth client secret
 *   sk-ant-api03-[A-Za-z0-9_-]{40,} Anthropic API key
 *   GOCSPX-[A-Za-z0-9_-]{20,}       Google OAuth client secret
 *   sk_live_[A-Za-z0-9]{20,}        Stripe live secret
 *   sk_test_[A-Za-z0-9]{20,}        Stripe test secret
 *   rk_live_[A-Za-z0-9]{20,}        Stripe live restricted
 *   rk_test_[A-Za-z0-9]{20,}        Stripe test restricted
 *   whsec_[A-Za-z0-9]{20,}          Stripe webhook secret
 *   vcp_[A-Za-z0-9]{20,}            Vercel personal token
 *   oac_[A-Za-z0-9]{20,}            Vercel OAuth client ID (less sensitive)
 *   eyJ[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+   JWT-shaped tokens
 *   AIzaSy[A-Za-z0-9_-]{30,}        Google API keys
 *   [a-f0-9]{64}                    AES-256 key in hex (rotates these into ****)
 *
 * Usage: Call `installLogScrubber()` once at module-eval time at the top
 * of each route file you want scrubbed.
 */

const PATTERNS: { name: string; regex: RegExp }[] = [
  { name: "up_pat", regex: /up:[a-z]+:[A-Za-z0-9]{60,}/g },
  { name: "supabase_service", regex: /sb_secret_[A-Za-z0-9]{20,}/g },
  { name: "supabase_anon", regex: /sb_publishable_[A-Za-z0-9]{20,}/g },
  { name: "supabase_mgmt", regex: /sbp_[A-Za-z0-9]{20,}/g },
  { name: "supabase_oauth", regex: /sba_[A-Za-z0-9]{20,}/g },
  { name: "anthropic", regex: /sk-ant-api03-[A-Za-z0-9_-]{40,}/g },
  { name: "google_oauth_secret", regex: /GOCSPX-[A-Za-z0-9_-]{20,}/g },
  { name: "stripe_live", regex: /sk_live_[A-Za-z0-9]{20,}/g },
  { name: "stripe_test", regex: /sk_test_[A-Za-z0-9]{20,}/g },
  { name: "stripe_rk_live", regex: /rk_live_[A-Za-z0-9]{20,}/g },
  { name: "stripe_rk_test", regex: /rk_test_[A-Za-z0-9]{20,}/g },
  { name: "stripe_whsec", regex: /whsec_[A-Za-z0-9]{20,}/g },
  { name: "vercel_pat", regex: /vcp_[A-Za-z0-9]{20,}/g },
  { name: "google_api", regex: /AIzaSy[A-Za-z0-9_-]{30,}/g },
  { name: "jwt", regex: /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g },
  // Hex-encoded 256-bit keys (UP_API_ENCRYPTION_KEY, PROVISIONER_ENCRYPTION_KEY, CRON_SECRET)
  { name: "hex_key", regex: /\b[a-f0-9]{64}\b/g },
];

export function scrubSecrets(input: unknown): string {
  let s: string;
  if (typeof input === "string") s = input;
  else {
    try {
      s = JSON.stringify(input);
    } catch {
      s = String(input);
    }
  }
  for (const { name, regex } of PATTERNS) {
    s = s.replace(regex, `[REDACTED:${name}]`);
  }
  return s;
}

let installed = false;

/**
 * Replace `console.{log,info,warn,error}` with scrubbing wrappers. Idempotent.
 * Safe to call from multiple modules; only patches once.
 */
export function installLogScrubber(): void {
  if (installed) return;
  installed = true;

  const methods = ["log", "info", "warn", "error", "debug"] as const;
  for (const m of methods) {
    const original = console[m].bind(console);
    console[m] = (...args: unknown[]) => {
      original(...args.map((a) => (typeof a === "string" ? scrubSecrets(a) : scrubSecrets(a))));
    };
  }
}
