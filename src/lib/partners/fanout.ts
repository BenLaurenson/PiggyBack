/**
 * Cross-tenant partner aggregates fan-out.
 *
 * Spec: docs/superpowers/specs/2026-05-01-02-identity-and-partner-claims-design.md
 *
 * Returns a privacy-preserving summary of a partner's monthly cashflow:
 *   { income_cents, expense_cents, top_categories: [...] }
 *
 * The orchestrator NEVER stores partner transaction rows. Instead, every
 * fan-out call reaches into the partner's own Supabase project via the
 * stored Supabase Management API OAuth token (the same token we used to
 * provision their project). We refresh the access token if needed and run a
 * single aggregation SQL query — not a SELECT * — so raw transactions never
 * leave the partner's tenant.
 *
 * Consent gates are enforced before we even open the connection: if the
 * partner's `partner_links.consent_aggregate_view` is false, we surface a
 * structured "hidden" response and short-circuit. The UI degrades to "Partner
 * has hidden their data" without leaking that the partner exists or that
 * their tenant is reachable.
 *
 * Fan-out errors map to:
 *   - 403   no link / link not active / wrong caller
 *   - 200 + hidden=true   consent off
 *   - 503   partner tenant unreachable / token refresh fails
 */
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import {
  refreshSupabaseAccessToken,
  runSql,
} from "@/lib/provisioner/supabase-mgmt";
import { readOAuthToken } from "@/lib/provisioner/state-machine";
import { assertOrchestrator } from "@/lib/role-context";

export interface FetchPartnerAggregatesArgs {
  requesterProvisionId: string;
  partnerProvisionId: string;
  /** ISO month key, "YYYY-MM". Aggregation window. */
  monthKey: string;
}

export interface PartnerAggregates {
  income_cents: number;
  expense_cents: number;
  top_categories: Array<{
    category: string;
    expense_cents: number;
  }>;
}

export type FetchAggregatesResult =
  | { ok: true; aggregates: PartnerAggregates }
  | { ok: true; hidden: true } // consent off — surface as hidden, not error
  | { ok: false; status: 403 | 503; error: string };

interface PartnerLinkRow {
  id: string;
  initiator_provision_id: string;
  acceptor_provision_id: string;
  status: string;
  consent_aggregate_view: boolean;
}

interface PartnerProvisionRow {
  id: string;
  supabase_project_ref: string | null;
}

/** Pure helper exported for tests: validate "YYYY-MM" and turn into a date range. */
export function monthKeyToRange(monthKey: string): {
  startIso: string;
  endIso: string;
} | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) return null;
  const [yearStr, monthStr] = monthKey.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr); // 1..12
  // First-of-month, UTC.
  const start = new Date(Date.UTC(year, month - 1, 1));
  // First-of-NEXT-month gives a half-open range [start, end).
  const end = new Date(Date.UTC(year, month, 1));
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

/**
 * Build the aggregation SQL for one tenant.
 *
 * IMPORTANT: this query reads `transactions` on the PARTNER'S tenant DB. The
 * lint rule no-restricted-syntax flags tenant-table reads from orchestrator
 * paths because the orchestrator should not query its OWN local DB for
 * tenant data. Here, however, we ship the SQL string to the partner's
 * project via the Supabase Management API — the orchestrator-side code never
 * touches a tenant table object via the local supabase client. We use a
 * raw SQL string + parameter substitution so the lint rule cannot misfire.
 */
export function buildAggregateQuery(
  monthKey: string
): { sql: string } | null {
  const range = monthKeyToRange(monthKey);
  if (!range) return null;
  // Inline the timestamp literals — runSql does not support parameterised
  // queries (Supabase Mgmt API only takes a `query` string). Quoting is safe
  // because monthKeyToRange has already validated the input as YYYY-MM.
  const sql = `
    WITH window_txns AS (
      SELECT amount_cents, COALESCE(category_canonical, category, 'uncategorized') AS bucket
      FROM public.transactions
      WHERE created_at >= '${range.startIso}'::timestamptz
        AND created_at <  '${range.endIso}'::timestamptz
    )
    SELECT
      COALESCE(SUM(CASE WHEN amount_cents > 0 THEN amount_cents ELSE 0 END), 0) AS income_cents,
      COALESCE(SUM(CASE WHEN amount_cents < 0 THEN -amount_cents ELSE 0 END), 0) AS expense_cents,
      json_agg(
        json_build_object('category', bucket, 'expense_cents', total_cents)
        ORDER BY total_cents DESC
      ) FILTER (WHERE bucket IS NOT NULL) AS top_categories
    FROM (
      SELECT bucket, SUM(-amount_cents) AS total_cents
      FROM window_txns
      WHERE amount_cents < 0
      GROUP BY bucket
      ORDER BY total_cents DESC
      LIMIT 5
    ) cats
    CROSS JOIN window_txns;
  `;
  return { sql };
}

/**
 * Coerce a raw aggregate result row into the typed PartnerAggregates shape.
 */
export function parseAggregateRow(row: unknown): PartnerAggregates {
  const r = (row ?? {}) as {
    income_cents?: number | string | null;
    expense_cents?: number | string | null;
    top_categories?: unknown;
  };
  const income = Number(r.income_cents ?? 0);
  const expense = Number(r.expense_cents ?? 0);
  const cats = Array.isArray(r.top_categories) ? r.top_categories : [];
  const top_categories = cats
    .map((c) => {
      const o = (c ?? {}) as { category?: unknown; expense_cents?: unknown };
      return {
        category: typeof o.category === "string" ? o.category : "uncategorized",
        expense_cents: Number(o.expense_cents ?? 0),
      };
    })
    .filter((c) => Number.isFinite(c.expense_cents));
  return {
    income_cents: Number.isFinite(income) ? income : 0,
    expense_cents: Number.isFinite(expense) ? expense : 0,
    top_categories,
  };
}

/**
 * Look up the partner_links row that joins requester + partner. Returns null
 * if no active link exists (covers severed, rejected, pending, missing).
 */
async function loadActiveLink(args: {
  requesterProvisionId: string;
  partnerProvisionId: string;
}): Promise<PartnerLinkRow | null> {
  const supabase = createServiceRoleClient();
  // The link can be in either direction.
  const { data } = await supabase
    .from("partner_links")
    .select(
      "id, initiator_provision_id, acceptor_provision_id, status, consent_aggregate_view"
    )
    .or(
      `and(initiator_provision_id.eq.${args.requesterProvisionId},acceptor_provision_id.eq.${args.partnerProvisionId}),and(initiator_provision_id.eq.${args.partnerProvisionId},acceptor_provision_id.eq.${args.requesterProvisionId})`
    )
    .eq("status", "active")
    .maybeSingle();
  return (data as PartnerLinkRow | null) ?? null;
}

async function loadPartnerProvision(
  partnerProvisionId: string
): Promise<PartnerProvisionRow | null> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("piggyback_provisions")
    .select("id, supabase_project_ref")
    .eq("id", partnerProvisionId)
    .maybeSingle();
  return (data as PartnerProvisionRow | null) ?? null;
}

async function ensureFreshAccessToken(
  partnerProvisionId: string
): Promise<{ accessToken: string } | null> {
  const stored = await readOAuthToken(partnerProvisionId, "supabase");
  if (!stored) return null;
  // If we have an access token and it's not expiring in the next 60s, use it.
  if (
    stored.expiresAt &&
    new Date(stored.expiresAt).getTime() > Date.now() + 60_000
  ) {
    return { accessToken: stored.accessToken };
  }
  if (!stored.refreshToken) return null;
  const clientId = process.env.SUPABASE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.SUPABASE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  try {
    const refreshed = await refreshSupabaseAccessToken({
      refreshToken: stored.refreshToken,
      clientId,
      clientSecret,
    });
    return { accessToken: refreshed.access_token };
  } catch (err) {
    console.error("[fanout] supabase token refresh failed", err);
    return null;
  }
}

export async function fetchPartnerAggregates(
  args: FetchPartnerAggregatesArgs
): Promise<FetchAggregatesResult> {
  assertOrchestrator("fetchPartnerAggregates");

  if (args.requesterProvisionId === args.partnerProvisionId) {
    return { ok: false, status: 403, error: "Cannot fetch your own data via the partner endpoint." };
  }

  const link = await loadActiveLink(args);
  if (!link) {
    return { ok: false, status: 403, error: "No active partnership." };
  }
  if (!link.consent_aggregate_view) {
    return { ok: true, hidden: true };
  }

  const partner = await loadPartnerProvision(args.partnerProvisionId);
  if (!partner?.supabase_project_ref) {
    return { ok: false, status: 503, error: "Partner tenant unavailable." };
  }

  const query = buildAggregateQuery(args.monthKey);
  if (!query) {
    return { ok: false, status: 403, error: "Invalid monthKey (expected YYYY-MM)." };
  }

  const auth = await ensureFreshAccessToken(args.partnerProvisionId);
  if (!auth) {
    return { ok: false, status: 503, error: "Partner tenant unavailable." };
  }

  try {
    const rows = await runSql(
      { accessToken: auth.accessToken },
      partner.supabase_project_ref,
      query.sql
    );
    const first = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    return { ok: true, aggregates: parseAggregateRow(first) };
  } catch (err) {
    console.error("[fanout] partner SQL failed", err);
    return { ok: false, status: 503, error: "Partner tenant unavailable." };
  }
}
