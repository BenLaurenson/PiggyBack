"use client";

import { useState } from "react";

interface Row {
  id: string;
  email: string;
  display_name: string | null;
  state: string;
  retry_count: number;
  next_retry_at: string | null;
  state_changed_at: string;
  subdomain_short_id: string | null;
  vercel_deployment_url: string | null;
}

const TERMINAL = new Set(["READY", "CANCELLED", "FAILED_PERMANENT"]);

const STATE_BADGE_COLORS: Record<string, string> = {
  READY: "bg-green-100 text-green-800",
  FAILED_PERMANENT: "bg-red-100 text-red-800",
  FAILED_RETRYABLE: "bg-orange-100 text-orange-800",
  CANCELLED: "bg-gray-100 text-gray-700",
};

function badgeClass(state: string): string {
  return STATE_BADGE_COLORS[state] ?? "bg-blue-100 text-blue-800";
}

export function ProvisionsClient({ initialRows }: { initialRows: Row[] }) {
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [busy, setBusy] = useState<string | null>(null);

  async function action(id: string, type: "retry" | "cancel") {
    setBusy(id);
    try {
      const res = await fetch("/api/admin/provisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: type }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(`Action failed: ${err?.error ?? res.status}`);
        return;
      }
      // Refresh list
      const list = await fetch("/api/admin/provisions").then((r) => r.json());
      setRows(list.rows ?? []);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-2 text-left font-semibold">User</th>
            <th className="px-4 py-2 text-left font-semibold">State</th>
            <th className="px-4 py-2 text-left font-semibold">Subdomain</th>
            <th className="px-4 py-2 text-left font-semibold">Retries</th>
            <th className="px-4 py-2 text-left font-semibold">Next retry</th>
            <th className="px-4 py-2 text-left font-semibold">Last change</th>
            <th className="px-4 py-2 text-left font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="px-4 py-2">
                <div className="font-medium">{r.display_name ?? "—"}</div>
                <div className="text-xs text-gray-500">{r.email}</div>
              </td>
              <td className="px-4 py-2">
                <span
                  className={`rounded px-2 py-0.5 text-xs font-semibold ${badgeClass(r.state)}`}
                >
                  {r.state}
                </span>
              </td>
              <td className="px-4 py-2">
                {r.subdomain_short_id ? `${r.subdomain_short_id}.piggyback.finance` : "—"}
              </td>
              <td className="px-4 py-2">{r.retry_count}</td>
              <td className="px-4 py-2 text-xs">
                {r.next_retry_at ? new Date(r.next_retry_at).toLocaleString() : "—"}
              </td>
              <td className="px-4 py-2 text-xs">
                {new Date(r.state_changed_at).toLocaleString()}
              </td>
              <td className="px-4 py-2 space-x-2">
                {!TERMINAL.has(r.state) && (
                  <>
                    <button
                      type="button"
                      disabled={busy === r.id}
                      onClick={() => action(r.id, "retry")}
                      className="rounded border border-blue-600 px-2 py-0.5 text-xs text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                    >
                      Retry
                    </button>
                    <button
                      type="button"
                      disabled={busy === r.id}
                      onClick={() => action(r.id, "cancel")}
                      className="rounded border border-red-600 px-2 py-0.5 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
