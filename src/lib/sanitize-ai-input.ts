/**
 * Sanitize untrusted text (e.g. transaction descriptions) before embedding
 * in AI prompts to mitigate prompt injection attacks.
 *
 * Defence layers:
 * 1. Truncate to a reasonable max length
 * 2. Strip sequences that look like prompt instructions / role overrides
 * 3. Collapse whitespace and remove non-printable control characters
 */

const MAX_DESCRIPTION_LENGTH = 200;

/**
 * Patterns that look like prompt injection attempts.
 * Matches common jailbreak / instruction-injection patterns found in the wild.
 */
const INJECTION_PATTERNS = [
  // Role impersonation: "system:", "assistant:", "user:", "[INST]", etc.
  /\b(system|assistant|human|user)\s*:/gi,
  /\[\/?\s*(INST|SYS|SYSTEM)\]/gi,
  // Direct instruction phrases
  /ignore\s+(all\s+)?(previous|above|prior)\s+(instructions?|prompts?|rules?|context)/gi,
  /disregard\s+(all\s+)?(previous|above|prior)\s+(instructions?|prompts?|rules?|context)/gi,
  /forget\s+(all\s+)?(previous|above|prior)\s+(instructions?|prompts?|rules?|context)/gi,
  /override\s+(all\s+)?(previous|above|prior)\s+(instructions?|prompts?|rules?|context)/gi,
  /you\s+are\s+now\b/gi,
  /new\s+instructions?\s*:/gi,
  /act\s+as\s+(a\s+)?/gi,
  /pretend\s+(you('re|\s+are)\s+)/gi,
  /do\s+not\s+follow\s+(any\s+)?(previous|prior|above)/gi,
  // Markdown/XML structure injection
  /```\s*(system|prompt|instruction)/gi,
  /<\/?(?:system|prompt|instruction|message|context)>/gi,
  // Separator injection (trying to create visual prompt boundaries)
  /[-=]{5,}/g,
  /#{3,}/g,
];

/**
 * Sanitize a single description string for safe inclusion in an AI prompt.
 */
export function sanitizeForAI(input: string): string {
  if (!input || typeof input !== "string") return "";

  let text = input;

  // 1. Strip non-printable control characters (keep normal whitespace)
  text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  // 2. Strip injection patterns
  for (const pattern of INJECTION_PATTERNS) {
    text = text.replace(pattern, "");
  }

  // 3. Collapse consecutive whitespace into a single space
  text = text.replace(/\s+/g, " ").trim();

  // 4. Truncate
  if (text.length > MAX_DESCRIPTION_LENGTH) {
    text = text.slice(0, MAX_DESCRIPTION_LENGTH);
  }

  return text;
}

/**
 * Sanitize an array of transaction-like objects in place,
 * cleaning the `description` field on each.
 * Returns the same array reference for convenience.
 */
export function sanitizeTransactionDescriptions<
  T extends { description: string },
>(transactions: T[]): T[] {
  for (const txn of transactions) {
    txn.description = sanitizeForAI(txn.description);
  }
  return transactions;
}
