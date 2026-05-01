"use client";

import { useEffect, useState } from "react";

/**
 * Admin observability page for sync stragglers.
 *
 * Lists every account that's not in CURRENT/IDLE state, grouped by user,
 * with a "Trigger reconciliation" button per user. Calls the
 * /api/admin/sync-stragglers route — that route enforces the admin
 * allowlist via ADMIN_EMAILS.
 */

interface Straggler {
  id: string;
  user_id: string;
  user_email: string | null;
  display_name: string;
  sync_state: string;
  last_synced_at: string | null;
  sync_error_count: number;
  sync_last_error: string | null;
  sync_started_at: string | null;
}

const STATE_BADGE: Record<string, string> = {
  SYNCING: "bg-blue-100 text-blue-700",
  STALE_PARTIAL: "bg-amber-100 text-amber-700",
  SYNC_FAILED_PERMANENT: "bg-red-100 text-red-700",
};

export default function SyncStragglersPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stragglers, setStragglers] = useState<Straggler[]>([]);
  const [triggering, setTriggering] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/sync-stragglers");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const body = await res.json();
      setStragglers(body.stragglers ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const triggerSync = async (userId: string) => {
    setTriggering(userId);
    try {
      const res = await fetch("/api/admin/sync-stragglers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Trigger failed");
    } finally {
      setTriggering(null);
    }
  };

  // Group by user.
  const byUser = stragglers.reduce<Record<string, Straggler[]>>((acc, s) => {
    (acc[s.user_id] ??= []).push(s);
    return acc;
  }, {});

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Sync stragglers</h1>
      <p className="text-sm text-gray-500 mb-6">
        Accounts whose <code>sync_state</code> is not <code>CURRENT</code> or{" "}
        <code>IDLE</code>. Reconciliation cron retries these automatically; use
        the buttons below to nudge manually.
      </p>

      {loading && <p>Loading…</p>}
      {error && (
        <div className="p-3 border border-red-300 bg-red-50 text-red-700 rounded mb-4">
          {error}
        </div>
      )}

      {!loading && stragglers.length === 0 && !error && (
        <p className="text-green-700">All accounts are healthy.</p>
      )}

      {Object.entries(byUser).map(([userId, accounts]) => (
        <div key={userId} className="border rounded p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="font-mono text-xs text-gray-500">{userId}</p>
              <p className="font-semibold">
                {accounts[0].user_email ?? "(no email)"}
              </p>
            </div>
            <button
              onClick={() => triggerSync(userId)}
              disabled={triggering === userId}
              className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm disabled:opacity-50"
            >
              {triggering === userId
                ? "Triggering…"
                : "Trigger reconciliation"}
            </button>
          </div>
          <ul className="space-y-1 text-sm">
            {accounts.map((a) => (
              <li
                key={a.id}
                className="flex items-center gap-3 py-1 border-t pt-2"
              >
                <span
                  className={`px-2 py-0.5 rounded text-xs font-medium ${
                    STATE_BADGE[a.sync_state] ?? "bg-gray-100 text-gray-700"
                  }`}
                >
                  {a.sync_state}
                </span>
                <span className="font-medium">{a.display_name}</span>
                <span className="text-gray-500">
                  errors: {a.sync_error_count}
                </span>
                {a.sync_last_error && (
                  <span className="text-red-600 truncate">
                    {a.sync_last_error}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
