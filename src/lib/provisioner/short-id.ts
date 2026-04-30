/**
 * Node-only shortid generation for hosted-platform subdomains.
 *
 * Split from `subdomain.ts` so the edge middleware can import the validation
 * + alias-window helpers without dragging Node's `crypto` module into the
 * Edge bundle (which Turbopack warns about even when the function isn't
 * called from the edge code path).
 */

import { randomBytes } from "crypto";

// Crockford base32 alphabet — no I/L/O/U/0/1 to avoid visual confusion
const BASE32 = "abcdefghjkmnpqrstvwxyz23456789";

/** Generate an N-character base32 short ID. ~30^6 ≈ 730M values for length=6. */
export function generateShortId(length = 6): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += BASE32[bytes[i] % BASE32.length];
  }
  return out;
}
