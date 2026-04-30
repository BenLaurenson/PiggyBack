import { describe, it, expect } from "vitest";
import { scrubSecrets } from "@/lib/log-scrubber";

/**
 * NOTE: These fixtures use string concatenation + `gitleaks:allow` markers
 * to ensure the pre-commit gitleaks scanner doesn't flag the test inputs as
 * real secrets. Real secrets would never live in this file.
 */
describe("scrubSecrets", () => {
  it("redacts an Up PAT", () => {
    const pat = ["up", ":yeah:", "XmP0VHnBTCDPxY6XytxTUjYGfzNrvktx", "XahjmvfdJHhXU1TbJHnolUOZ8owah9HLoxpQPKNam2S0iEQX"].join(""); // gitleaks:allow
    const input = "Failed: " + pat;
    expect(scrubSecrets(input)).toBe("Failed: [REDACTED:up_pat]");
  });

  it("redacts a Supabase Mgmt token", () => {
    const tok = ["sbp_", "bbb917d0a1517c1f715c2", "96fe0b9896e9c4bc5e3"].join(""); // gitleaks:allow
    const input = "Authorization: Bearer " + tok;
    expect(scrubSecrets(input)).toBe("Authorization: Bearer [REDACTED:supabase_mgmt]");
  });

  it("redacts a Stripe restricted key", () => {
    const tok = ["rk_", "test_", "fakefixture12345678901234567890"].join(""); // gitleaks:allow
    expect(scrubSecrets(tok)).toBe("[REDACTED:stripe_rk_test]");
  });

  it("redacts an Anthropic key", () => {
    const tok = ["sk-ant-", "api03-", "fakefixturefakefixturefakefixturefakefixture"].join(""); // gitleaks:allow
    const input = "key=" + tok;
    expect(scrubSecrets(input)).toBe("key=[REDACTED:anthropic]");
  });

  it("redacts a Vercel personal token", () => {
    const tok = ["vcp_", "fakefixture0123456789012", "345678901234567"].join(""); // gitleaks:allow
    const input = "token=" + tok;
    expect(scrubSecrets(input)).toBe("token=[REDACTED:vercel_pat]");
  });

  it("redacts hex-encoded 256-bit keys", () => {
    const tok = ["3a776996f4ada5379e7150f89145e598", "9cd4cdfaa53f9c7403588cc14edc7eea"].join(""); // gitleaks:allow
    const input = "key " + tok;
    expect(scrubSecrets(input)).toBe("key [REDACTED:hex_key]");
  });

  it("redacts JWTs", () => {
    const tok = ["eyJ", "hbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9", ".eyJpc3MiOiJzdXBhYmFzZSJ9.signaturepart"].join(""); // gitleaks:allow
    expect(scrubSecrets(tok)).toBe("[REDACTED:jwt]");
  });

  it("leaves non-secret strings alone", () => {
    expect(scrubSecrets("Hello world")).toBe("Hello world");
    expect(scrubSecrets("Error: connection timeout to api.up.com.au")).toBe(
      "Error: connection timeout to api.up.com.au"
    );
  });

  it("scrubs nested object payloads", () => {
    const tok = ["sbp_", "abc12345678901234567890def"].join(""); // gitleaks:allow
    const input = { headers: { authorization: "Bearer " + tok } };
    const scrubbed = scrubSecrets(input);
    expect(scrubbed).toContain("[REDACTED:supabase_mgmt]");
    expect(scrubbed).not.toContain("sbp_abc");
  });
});
