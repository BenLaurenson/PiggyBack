import { redirect } from "next/navigation";
import { isCurrentUserAdmin } from "@/lib/admin-auth";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { analyticsConfigured } from "@/lib/analytics/server";
import { FunnelEvent, PROVISIONING_FUNNEL, type FunnelEventName } from "@/lib/analytics/events";

export const dynamic = "force-dynamic";

const RANGES = [7, 30, 90] as const;
type RangeDays = (typeof RANGES)[number];

interface FunnelRow {
  step: FunnelEventName;
  count: number;
  conversionFromFirst: number; // % of step[0] count
  dropFromPrev: number; // % drop vs prior step
}

interface PerRangeStats {
  range: RangeDays;
  funnel: FunnelRow[];
  /** % of signup_started visitors who reached tenant_ready */
  landingToTenantReady: number;
  /** Median ms between tenant_ready and first_sync_completed */
  medianTimeToFirstSyncMs: number | null;
}

/**
 * Pull all events for the requested window and compute step-by-step
 * conversion. We do this at request time — the volumes here are tiny
 * (one row per user per step) so it's fine without a materialised view.
 */
async function buildStats(rangeDays: RangeDays): Promise<PerRangeStats> {
  const supabase = createServiceRoleClient();
  const since = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000).toISOString();

  const { data: rows, error } = await supabase
    .from("funnel_events")
    .select("event_name,user_id,anonymous_id,created_at")
    .gte("created_at", since)
    .in("event_name", PROVISIONING_FUNNEL);

  if (error || !rows) {
    return {
      range: rangeDays,
      funnel: PROVISIONING_FUNNEL.map((step) => ({
        step,
        count: 0,
        conversionFromFirst: 0,
        dropFromPrev: 0,
      })),
      landingToTenantReady: 0,
      medianTimeToFirstSyncMs: null,
    };
  }

  // Group by step. We dedupe on user_id || anonymous_id so one user
  // hammering signup_started 5 times only counts once.
  const stepIdentities = new Map<FunnelEventName, Set<string>>();
  for (const step of PROVISIONING_FUNNEL) {
    stepIdentities.set(step, new Set());
  }
  for (const row of rows) {
    const id = row.user_id ?? row.anonymous_id;
    if (!id) continue;
    stepIdentities.get(row.event_name as FunnelEventName)?.add(id);
  }

  const counts: Record<FunnelEventName, number> = Object.fromEntries(
    PROVISIONING_FUNNEL.map((step) => [step, stepIdentities.get(step)?.size ?? 0])
  ) as Record<FunnelEventName, number>;

  const firstStepCount = counts[PROVISIONING_FUNNEL[0]] || 0;

  const funnel: FunnelRow[] = PROVISIONING_FUNNEL.map((step, idx) => {
    const count = counts[step];
    const prevCount = idx === 0 ? firstStepCount : counts[PROVISIONING_FUNNEL[idx - 1]];
    const conversionFromFirst = firstStepCount > 0 ? (count / firstStepCount) * 100 : 0;
    const dropFromPrev = prevCount > 0 ? ((prevCount - count) / prevCount) * 100 : 0;
    return {
      step,
      count,
      conversionFromFirst,
      dropFromPrev: Math.max(0, dropFromPrev),
    };
  });

  const tenantReadyCount = counts[FunnelEvent.TENANT_READY] || 0;
  const landingToTenantReady =
    firstStepCount > 0 ? (tenantReadyCount / firstStepCount) * 100 : 0;

  // Median time-to-first-sync: per user_id, ms between tenant_ready and
  // first_sync_completed (only when both exist within the window).
  const tenantReadyByUser = new Map<string, number>();
  const firstSyncByUser = new Map<string, number>();
  for (const row of rows) {
    if (!row.user_id) continue;
    const ts = new Date(row.created_at).getTime();
    if (row.event_name === FunnelEvent.TENANT_READY) {
      const existing = tenantReadyByUser.get(row.user_id);
      if (existing === undefined || ts < existing) {
        tenantReadyByUser.set(row.user_id, ts);
      }
    } else if (row.event_name === FunnelEvent.FIRST_SYNC_COMPLETED) {
      const existing = firstSyncByUser.get(row.user_id);
      if (existing === undefined || ts < existing) {
        firstSyncByUser.set(row.user_id, ts);
      }
    }
  }

  const deltas: number[] = [];
  for (const [userId, tenantReadyTs] of tenantReadyByUser) {
    const syncTs = firstSyncByUser.get(userId);
    if (syncTs && syncTs >= tenantReadyTs) {
      deltas.push(syncTs - tenantReadyTs);
    }
  }
  let medianTimeToFirstSyncMs: number | null = null;
  if (deltas.length > 0) {
    deltas.sort((a, b) => a - b);
    const mid = Math.floor(deltas.length / 2);
    medianTimeToFirstSyncMs =
      deltas.length % 2 === 1
        ? deltas[mid]
        : Math.round((deltas[mid - 1] + deltas[mid]) / 2);
  }

  return {
    range: rangeDays,
    funnel,
    landingToTenantReady,
    medianTimeToFirstSyncMs,
  };
}

function formatMs(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${(ms / 60_000).toFixed(1)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

export default async function AdminFunnelPage() {
  const auth = await isCurrentUserAdmin();
  if (!auth.isAdmin) {
    redirect("/home");
  }

  const config = analyticsConfigured();
  const stats = await Promise.all(RANGES.map((r) => buildStats(r)));

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div className="space-y-1">
        <h1 className="font-[family-name:var(--font-nunito)] text-3xl font-black text-text-primary">
          Provisioning funnel
        </h1>
        <p className="font-[family-name:var(--font-dm-sans)] text-text-secondary">
          Drop-off rates per step. Computed from the funnel_events table; mirror
          to PostHog when NEXT_PUBLIC_ANALYTICS_ENABLED=true.
        </p>
        <p className="font-[family-name:var(--font-dm-sans)] text-xs text-text-tertiary mt-2">
          PostHog: {config.postHog ? "enabled" : "disabled"} · Local mirror:{" "}
          {config.localMirror ? "enabled" : "disabled"}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {stats.map((s) => (
          <section
            key={s.range}
            className="rounded-xl border-2 border-border-white-80 bg-surface-white-60 p-4 md:p-6 backdrop-blur-sm"
          >
            <header className="flex items-baseline justify-between mb-4">
              <h2 className="font-[family-name:var(--font-nunito)] text-xl font-bold">
                Last {s.range} days
              </h2>
              <span className="font-[family-name:var(--font-dm-sans)] text-xs text-text-tertiary">
                landing → tenant_ready: {s.landingToTenantReady.toFixed(1)}%
              </span>
            </header>

            <table className="w-full text-sm font-[family-name:var(--font-dm-sans)]">
              <thead>
                <tr className="text-left text-text-tertiary text-xs uppercase tracking-wide">
                  <th className="py-2">Step</th>
                  <th className="py-2 text-right">Count</th>
                  <th className="py-2 text-right">From #1</th>
                  <th className="py-2 text-right">Drop</th>
                </tr>
              </thead>
              <tbody>
                {s.funnel.map((row) => (
                  <tr key={row.step} className="border-t border-border-white-80">
                    <td className="py-2 font-mono text-xs">{row.step}</td>
                    <td className="py-2 text-right tabular-nums">{row.count}</td>
                    <td className="py-2 text-right tabular-nums">
                      {row.conversionFromFirst.toFixed(1)}%
                    </td>
                    <td className="py-2 text-right tabular-nums text-amber-700">
                      {row.dropFromPrev.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-4 pt-4 border-t border-border-white-80">
              <p className="font-[family-name:var(--font-dm-sans)] text-xs text-text-tertiary">
                Median time-to-first-sync
              </p>
              <p className="font-[family-name:var(--font-nunito)] text-2xl font-bold tabular-nums">
                {formatMs(s.medianTimeToFirstSyncMs)}
              </p>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
