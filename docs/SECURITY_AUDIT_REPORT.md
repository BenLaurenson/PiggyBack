# PiggyBack Security Audit Report

**Date:** 2026-02-27
**Scope:** Full application — Next.js frontend, API routes, server actions, Supabase backend, webhook handlers, AI tools, infrastructure
**Methodology:** 25-iteration deep code review with parallel agent analysis across authentication, authorization, input validation, data integrity, cryptography, race conditions, business logic, infrastructure, and client-side security

---

## Executive Summary

PiggyBack is a couples finance tracking app built on Next.js 16 + Supabase with Up Bank integration and AI-powered financial tools. This audit identified **1,019 findings** across the full codebase:

| Severity | Count | Description |
|----------|-------|-------------|
| **CRITICAL** | 3 | Secrets exposure, broken RLS INSERT policy |
| **HIGH** | 47 | Auth bypass, IDOR, prompt injection, data corruption, SSRF |
| **MEDIUM** | 428 | Missing authorization, input validation gaps, race conditions, DoS vectors |
| **LOW** | 427 | Defense-in-depth gaps, info leaks, edge cases, dead code |
| **INFO** | 101 | Architecture notes, positive findings, non-issues |
| **Attack Chains** | 8 | Multi-vulnerability exploitation scenarios |
| **Dependencies** | 5 | Known CVEs in transitive dependencies |

### Top 10 Priorities (Fix First)

1. **C1/C2**: Rotate all secrets in `.env.local`; replace placeholder encryption key
2. **C3/H24**: Fix `partnership_members` and `partnerships` INSERT RLS — attacker can join any partnership
3. **H23**: Change ALL RLS policies from `TO public` to `TO authenticated`
4. **H16/H31**: Mitigate AI prompt injection — sanitize transaction descriptions, block "system" role
5. **H29**: Set `httpOnly: true` on Supabase auth cookies
6. **H9/H10**: Require current password for changes; implement proper account deletion via `auth.admin`
7. **H18**: Validate Up Bank pagination URLs against allowlist before following
8. **H4/H13**: Scope service-role queries; never expose service client to AI tools
9. **H40-H42**: Fix silent data loss — check all Supabase query errors
10. **H45**: Sanitize PostgREST filter inputs — escape `.eq()`/`.ilike()` values

---

## Critical Findings (3)

### C1: Production Secrets on Disk
**File:** `.env.local`
Supabase service role key, Gemini API key, Up Bank encryption key stored in plaintext on disk. Service role key grants full database bypass of RLS.

**Remediation:** Rotate all secrets. Use Vercel environment variables exclusively. Never commit `.env.local`.

### C2: Placeholder Encryption Key
**Files:** `.env.local`, `.env.example`
`UP_API_ENCRYPTION_KEY=placeholder_32_character_key____` — deterministic, guessable key used for AES-256-GCM encryption of Up Bank API tokens. Any attacker with DB read access can decrypt all stored tokens.

**Remediation:** Generate cryptographically random 32-byte key. Rotate and re-encrypt all stored tokens.

### C3: Partnership Join Without Consent
**File:** `initial_schema.sql`
`partnership_members` INSERT RLS policy: `WITH CHECK (user_id = auth.uid())` — any authenticated user can insert themselves into ANY partnership by specifying an arbitrary `partnership_id`. Combined with H24 (`partnerships` INSERT `WITH CHECK (true)`), an attacker can create a partnership and add any user, or join an existing one.

**Remediation:** INSERT policy must require a valid, accepted `partner_link_request` for the target partnership.

---

## High Findings (47)

### Authentication & Session Management

| ID | Finding | File |
|----|---------|------|
| H9 | Password change doesn't verify current password | `auth.updateUser()` |
| H10 | Account deletion only removes profile row, not `auth.users` entry | `actions/account.ts` |
| H29 | Auth cookies lack `httpOnly` — JS-accessible session tokens | `@supabase/ssr` defaults |
| H30 | Signout route outside CSRF scope — CSRF only covers `/api/*` | `middleware.ts` |
| H32 | Null `webhook_secret` → predictable HMAC (empty string key) | `webhook/route.ts` |
| H34 | `upsert_up_api_config` SECURITY DEFINER with NULL `auth.uid()` bypass | `initial_schema.sql` |
| H35 | `decryptToken` doesn't validate IV/auth tag buffer lengths | `token-encryption.ts` |

### Authorization & Access Control

| ID | Finding | File |
|----|---------|------|
| H1 | `getBudgets` accepts arbitrary `partnershipId` without membership check | `actions/budgets.ts` |
| H2 | `createBudget` trusts client-supplied `partnership_id` | `actions/budgets.ts:93` |
| H3 | `duplicateBudget` missing partnership ownership check | `actions/budgets.ts:446` |
| H11 | AI `updateSavingsGoal` not scoped by `partnership_id` | `ai-tools.ts` |
| H12 | AI `updateInvestment` not scoped by `partnership_id` | `ai-tools.ts` |
| H17 | Goals edit page — client-only auth, no server-side ownership | `goals/[id]/edit` |
| H20 | No partnership departure mechanism — partners permanently locked | RLS/schema |
| H23 | ALL RLS policies use `TO public` instead of `TO authenticated` | `initial_schema.sql` |
| H24 | `partnerships` INSERT `WITH CHECK (true)` — anyone can create | `initial_schema.sql` |
| H48 | Either partner can hard-delete ALL shared expense definitions | DELETE endpoint |
| H49 | No partnership dissolution mechanism exists | schema/actions |

### AI Security

| ID | Finding | File |
|----|---------|------|
| H5 | AI write tools (9) execute immediately — no confirmation gate | `ai-tools.ts` |
| H7 | AI `queryFinancialData` ilike/like values not escaped — prompt injection to SQL filter | `ai-tools.ts` |
| H13 | `aiCategorizeTransaction` uses service role client with user-controlled account IDs | `ai-categorize.ts` |
| H16 | Indirect prompt injection chain — transaction descriptions → AI context → tool calls | Multiple files |
| H31 | Client can inject "system" role messages into AI conversation | `ChatMessageSchema` |
| H37 | AI `recategorizeTransaction` writes wrong column names | `ai-tools.ts` |
| H42 | AI fire-and-forget categorization destroys expense matches | `processTransaction` |

### Data Integrity

| ID | Finding | File |
|----|---------|------|
| H21 | `transaction_share_overrides.transaction_id` TEXT vs `transactions.id` UUID — type mismatch | `initial_schema.sql` |
| H22 | `merge_partnerships` doesn't migrate 10+ tables before CASCADE delete | PL/pgSQL function |
| H25 | Trigger performs DELETE FROM `expense_matches` for ALL partnership members | trigger function |
| H26 | Concurrent webhook goal balance sync — lost update race | `webhook/route.ts` |
| H27 | Webhook `next_due_date` advancement race — double advancement | `webhook/route.ts` |
| H28 | `getUserPartnershipId` returns non-deterministic first partnership | utility function |
| H36 | `total_budget` stored as dollars, consumed as cents — 100x error | budget engine |
| H38 | FIRE projection double-counts super contribution from income | `fire-calculations.ts` |
| H39 | 8+ checkup actions use non-deterministic `getUserPartnershipId()` | `actions/checkup.ts` |
| H40 | Sync route silently drops transactions and categories on error | `upbank/sync/route.ts` |
| H41 | Budget summary returns all-zero on query failure — silent data loss | `budget/summary/route.ts` |
| H43 | Soft-deleted transactions still counted in budget spending | budget engine |
| H44 | Expense `next_due_date` permanently stuck when no transactions match | expense system |
| H46 | `merge_partnerships` function never called — dead code with critical bugs | PL/pgSQL |
| H47 | Account deletion orphans partnership data, leaves zombie webhooks | `actions/account.ts` |

### Infrastructure

| ID | Finding | File |
|----|---------|------|
| H4 | Cron endpoint uses service role for ALL user profiles + AI keys | `cron/notifications/route.ts` |
| H8 | Demo credentials hardcoded in `.env.demo` | `.env.demo` |
| H14 | Webhook `processTransactionDeletion` searches globally with service role | `webhook/route.ts` |
| H15 | Webhook `createdAt` NaN bypasses replay protection | `webhook/route.ts` |
| H18 | SSRF via Up Bank pagination — `getAllPages()` follows arbitrary `nextUrl` | `upbank-api.ts` |
| H33 | Methodology POST skips Zod validation — raw `request.json()` | `methodology/route.ts` |
| H45 | PostgREST filter injection via unvalidated `categoryId` | `transactions/route.ts` |

---

## Attack Chains (8)

### AC1: Silent Financial Gaslighting
Partner unilaterally shifts share percentages (no audit log, L34) + hides income sources. Over time, systematically shifts financial burden without detection.

### AC2: Budget Phantom Income
Manual + auto income source duplication (M89 null collision) inflates TBB, causing partner to overspend.

### AC3: Expense Orbit Manipulation
Match/unmatch cycle (L59) advances `next_due_date` without rollback. Repeated cycles push all expenses permanently into the future.

### AC4: Cron-Powered Cross-User Data Injection (CRITICAL)
Cron handler creates AI tools with service role (H4). AI write tools unscoped by partnership (H11, H12). Attacker's malicious transaction descriptions processed by cron → AI tool calls → writes to victim's data.

### AC5: Complete Financial Exfiltration
Export endpoint returns full history with no row limit (L17). In-memory rate limiter bypassed on cold start (M13). Single request extracts complete financial data.

### AC6: SSRF + Phishing Account Takeover
Image proxy SSRF (M86) + CSRF origin prefix bypass (M71) + null origin bypass (M50). Chain enables internal network scanning and session hijacking.

### AC7: Thundering Herd DoS
`backfill-all` `Promise.all()` unbounded (M52) + `limit=999999` on transactions (M79) + no rate limits on 22 routes (M25). Single user can overwhelm database.

### AC8: Zombie Partnership
Account deletion only removes profile (H10, H47). Partnership data orphaned. Partner still sees shared data but cannot manage it.

---

## Medium Findings — Top Categories (428 total)

### Missing Authorization (54 findings)
Budget layout/templates/columns/summary endpoints don't verify partnership membership (M27, M28, M38, M107). AI tools lack partnership scoping (M34, M35, M355). Multiple server actions trust client-supplied IDs (M10, M17, M18, M44, M97, M494, M495).

### Input Validation Gaps (87 findings)
Server actions universally lack runtime Zod validation (M149 — 47+ functions). String length limits missing on names, descriptions, notes (L304 — 15+ actions). Numeric fields accept negative/extreme values without bounds (M109, M208, M233, M473-M475). UUID parameters not format-validated (L197 — 12+ routes). Date fields accept arbitrary strings (M490). Enum-like text fields have no CHECK constraints (M436 — 16+ columns).

### Race Conditions (31 findings)
Goal fund additions (M81), default budget toggle (M83), expense matching (M142), checkup creation (L102), net worth snapshots (M138, M139), JSONB updates (M140), budget assignments (M276), slug generation (L233).

### Error Handling (52 findings)
Silent query failures return HTTP 200 with empty data (H41, L451, L456). Fire-and-forget database writes lose data silently (M359, M393-M402). Supabase errors re-wrapped without sanitization leak schema details (M180, M181, M250, M488).

### Database Schema Issues (48 findings)
Missing CHECK constraints on 20+ columns (M473-M484, M257). Missing RLS policies: no DELETE on 8 tables, no UPDATE on 5 tables (M39, M56-M61, M405-M407). Non-unique partial index allows duplicate defaults (M477). Nullable FKs prevent proper deduplication (M458).

### Performance & DoS (29 findings)
Unbounded queries load all transactions into memory (M467, M471, M321). N+1 query patterns in cron and budget list (M320, M468). AI chat allows 150+ DB queries per request (M469). O(n²) algorithms in expense matching and recurring detection (M470, M472, L445).

### CSRF & Session (12 findings)
CSRF bypassed when Origin header absent (M50) or `NEXT_PUBLIC_APP_URL` unset (M174). Server actions not covered by CSRF middleware (M222). Session not invalidated on password change (M102). No concurrent session limit (L77).

### AI-Specific (23 findings)
`accounts` table unscoped in `queryFinancialData` (M355). Wrong enum vocabulary in `createIncomeSource` tool (L461). `select("*")` bypasses column allowlist (M333). Raw error messages enumerate schema (L323). 15-step limit allows 15 chained writes (M191).

---

## Low Findings — Top Categories (427 total)

### Information Disclosure (48 findings)
Raw Supabase error messages in UI (M250, M301, L415). Internal entity IDs in API responses (L320-L324). User UUIDs in logs (L200). Schema details in error responses (M135, L227).

### Date/Timezone Issues (31 findings)
UTC vs local time mismatches across budget periods, cron scheduling, net worth snapshots (M202, M325-M327, L291-L299). DST transition causes missed/duplicate cron notifications (M427).

### Dead Code (14 findings)
15+ exported functions in `budget-zero-calculations.ts` unused (M446). Dead Alpha Vantage columns (M480). `merge_partnerships` never called (H46). Audit logger exists but unused (I45).

### Client-Side Security (38 findings)
Direct Supabase mutations bypass server actions (M383, M334). `window.confirm()` for destructive operations (M219). No `onAuthStateChange` listeners (L362). localStorage exposes partnership UUIDs (L163).

---

## Dependency Vulnerabilities (5)

| ID | Package | Severity | Type | Context |
|----|---------|----------|------|---------|
| D1 | minimatch <3.1.3 | HIGH | ReDoS | Dev (eslint) |
| D2 | minimatch >=9.0.0 <9.0.6 | HIGH | ReDoS | Dev (eslint-config-next) |
| D3 | minimatch >=10.0.0 <10.2.1 | HIGH | ReDoS | Dev (shadcn) |
| D4 | lodash <=4.17.22 | MEDIUM | Prototype pollution | Prod (recharts transitive) |
| D5 | ajv <6.14.0 | MEDIUM | ReDoS | Dev (eslint) |

Note: `pnpm.overrides` in `package.json` addresses 6 known CVEs (positive finding I10).

---

## Positive Findings

- **I2**: No `dangerouslySetInnerHTML` or `innerHTML` usage found
- **I5**: No CORS issues — same-origin enforcement by default
- **I61**: All form inputs use React controlled components — inherently XSS-safe
- **I62**: Recharts Tooltip renders via JSX — no XSS vector
- **I64**: No `postMessage` or cross-frame communication patterns
- **I41**: Error boundaries do NOT render error messages in UI (generic text only)
- **I10**: `pnpm.overrides` configured for 6 known CVEs
- Defense-in-depth auth check in app layout (server-side redirect)
- Encryption at rest for Up Bank API tokens (AES-256-GCM, despite key issues)
- CSP headers configured (despite gaps)

---

## Remediation Roadmap

### Phase 1: Critical (Week 1)
1. Rotate all secrets, generate proper encryption key (C1, C2)
2. Fix RLS INSERT policies on `partnership_members` and `partnerships` (C3, H24)
3. Change ALL RLS policies from `TO public` to `TO authenticated` (H23)
4. Set `httpOnly: true` on auth cookies (H29)
5. Add current password verification to password change (H9)

### Phase 2: High Priority (Weeks 2-3)
6. Sanitize AI inputs — escape transaction descriptions, block system role (H16, H31, H7)
7. Scope all AI write tools by partnership_id (H11, H12, H34)
8. Fix service role usage — never expose to AI tools, scope all queries (H4, H13, H14)
9. Implement proper account deletion via `auth.admin.deleteUser()` (H10, H47)
10. Validate Up Bank pagination URLs against domain allowlist (H18)
11. Add partnership ownership checks to all budget/goal/investment server actions (H1-H3, H17)
12. Fix `total_budget` dollars-vs-cents bug (H36)
13. Check ALL Supabase query results for errors (H40, H41, H42)
14. Exclude soft-deleted transactions from spending queries (H43)

### Phase 3: Medium Priority (Weeks 4-6)
15. Add Zod validation to all server actions (M149) and remaining API routes (M26)
16. Add CHECK constraints to all enum-like TEXT columns (M436)
17. Add missing RLS policies (DELETE on 8 tables, UPDATE on 5 tables)
18. Implement server-side rate limiting (Redis-backed, not in-memory) (M13, M25)
19. Fix race conditions with database-level locking (M81, M83, M138)
20. Add CSRF protection for server actions (M222)
21. Bound all unbounded queries with LIMIT (M467, M79, M29)
22. Add partnership dissolution mechanism (H20, H49)

### Phase 4: Hardening (Weeks 7-8)
23. Add `Cache-Control: no-store` to all sensitive API routes (M62)
24. Fix CSP gaps — remove `unsafe-inline`, add `object-src`, `worker-src` (M2, M184)
25. Pin GitHub Actions to commit SHAs (M287)
26. Fix Dockerfile security (user directive, healthcheck) (L254, L255)
27. Implement audit logging for security events (M24, L34)
28. Add `Cross-Origin-Resource-Policy` and `Referrer-Policy` headers (L78, L357)

---

## Appendix: Complete Finding Index

The full 1,019-finding database is available at `/tmp/findings_compact.txt` with one-line summaries per finding. Finding IDs use the format:

- **C** = Critical, **H** = High, **M** = Medium, **L** = Low, **I** = Informational
- **AC** = Attack Chain, **D** = Dependency vulnerability
- Numbers are sequential within severity level

Each finding references specific file paths and line numbers for precise remediation targeting.
