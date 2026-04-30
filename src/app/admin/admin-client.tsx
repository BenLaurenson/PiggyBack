"use client";

import { useState } from "react";
import { Loader2, RefreshCw, ExternalLink } from "lucide-react";

interface ProvisionRow {
  id: string;
  email: string;
  display_name: string | null;
  state: string;
  state_detail: string | null;
  state_updated_at: string;
  subdomain_short_id: string | null;
  subdomain_vanity: string | null;
  supabase_project_ref: string | null;
  vercel_project_id: string | null;
  vercel_deployment_url: string | null;
  subscription_status: string | null;
  subdomain_teardown_at: string | null;
  created_at: string;
  health: {
    provision_id: string;
    last_status_code: number | null;
    last_response_time_ms: number | null;
    consecutive_failures: number;
    last_checked_at: string;
    last_error: string | null;
  } | null;
}

const STATE_COLORS: Record<string, string> = {
  READY: "bg-accent-teal-light text-accent-teal border-accent-teal/40",
  FAILED: "bg-red-100 text-red-800 border-red-300",
  CANCELLED: "bg-gray-200 text-gray-600 border-gray-300",
};

function stateClass(state: string): string {
  return STATE_COLORS[state] ?? "bg-amber-100 text-amber-800 border-amber-300";
}

export function AdminClient({ provisions }: { provisions: ProvisionRow[] }) {
  const [filter, setFilter] = useState<string>("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = provisions.filter((p) => filter === "all" || p.state === filter);

  async function redrive(provisionId: string) {
    setBusyId(provisionId);
    try {
      const resp = await fetch("/api/provision/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provisionId }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        alert(`Redrive failed: ${data.error ?? "unknown"}`);
      } else {
        alert(`State now: ${data.state}`);
      }
    } finally {
      setBusyId(null);
    }
  }

  async function runHealthCheck(provisionId: string) {
    setBusyId(provisionId);
    try {
      const resp = await fetch("/api/admin/health-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provisionId }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        alert(`Health check failed: ${data.error ?? "unknown"}`);
      } else {
        alert(`Status: ${data.statusCode} (${data.responseTimeMs}ms)`);
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-6">
        {["all", "READY", "FAILED", "CANCELLED", "SIGNED_IN", "SUPABASE_AUTHED", "DOMAIN_ATTACHED"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-[family-name:var(--font-nunito)] font-bold uppercase tracking-wide ${
              filter === f
                ? "bg-text-primary text-white"
                : "bg-surface-white-60 text-text-tertiary border border-border-light"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border-light bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left bg-surface-white-60 font-[family-name:var(--font-nunito)]">
              <th className="px-4 py-3 font-bold text-text-tertiary">User</th>
              <th className="px-4 py-3 font-bold text-text-tertiary">Subdomain</th>
              <th className="px-4 py-3 font-bold text-text-tertiary">State</th>
              <th className="px-4 py-3 font-bold text-text-tertiary">Sub</th>
              <th className="px-4 py-3 font-bold text-text-tertiary">Health</th>
              <th className="px-4 py-3 font-bold text-text-tertiary">Updated</th>
              <th className="px-4 py-3 font-bold text-text-tertiary text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="font-[family-name:var(--font-dm-sans)]">
            {filtered.map((p) => {
              const subdomain = p.subdomain_vanity ?? p.subdomain_short_id;
              return (
                <tr key={p.id} className="border-t border-border-light">
                  <td className="px-4 py-3">
                    <div className="text-text-primary">{p.email}</div>
                    {p.display_name && (
                      <div className="text-xs text-text-tertiary">{p.display_name}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {subdomain ? (
                      <a
                        href={`https://${subdomain}.piggyback.finance`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-coral hover:underline inline-flex items-center gap-1"
                      >
                        {subdomain}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-[family-name:var(--font-nunito)] font-bold uppercase tracking-wide border ${stateClass(p.state)}`}
                    >
                      {p.state}
                    </span>
                    {p.state_detail && (
                      <div className="text-xs text-text-tertiary mt-1 max-w-xs truncate" title={p.state_detail}>
                        {p.state_detail}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-text-tertiary">
                      {p.subscription_status ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {p.health ? (
                      <div className="text-xs">
                        <span
                          className={
                            p.health.consecutive_failures > 0
                              ? "text-red-700"
                              : "text-accent-teal"
                          }
                        >
                          {p.health.last_status_code ?? "?"}
                        </span>
                        {p.health.last_response_time_ms != null && (
                          <span className="text-text-tertiary ml-1.5">
                            {p.health.last_response_time_ms}ms
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-text-tertiary">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-text-tertiary">
                    {new Date(p.state_updated_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => redrive(p.id)}
                        disabled={busyId === p.id}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg bg-text-primary text-white disabled:opacity-50"
                      >
                        {busyId === p.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <RefreshCw className="w-3 h-3" />
                        )}
                        Redrive
                      </button>
                      <button
                        onClick={() => runHealthCheck(p.id)}
                        disabled={busyId === p.id}
                        className="px-2.5 py-1 text-xs rounded-lg border border-border-medium text-text-medium disabled:opacity-50"
                      >
                        Health
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-text-tertiary">
                  No matching provisions.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
