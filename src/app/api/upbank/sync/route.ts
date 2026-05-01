import { createClient } from "@/utils/supabase/server";
import { syncLimiter, getClientIp, rateLimitKey } from "@/lib/rate-limiter";
import { runSyncForUser, type ProgressEvent } from "@/lib/sync/runner";

export const maxDuration = 300; // 5 minutes for long syncs

/**
 * POST /api/upbank/sync
 *
 * Streaming NDJSON endpoint that the UI consumes to drive the live "Syncing..."
 * UX. Each newline-delimited JSON event has a `phase` and a human-readable
 * `message`; clients also read the final `{ phase: "done", ... }` event for
 * total counts and any partial-failure surface.
 *
 * Wire shape (preserved for callers like settings/up-connection and the
 * onboarding bank-step):
 *   { phase: "syncing-categories", message: string }
 *   { phase: "syncing-accounts", message: string }
 *   { phase: "syncing-transactions", message: string, txnCount: number }
 *   { phase: "finishing", message: string, txnCount: number }
 *   { phase: "done", message: string, txnCount: number, errors?: string[],
 *     ok: boolean, partial: boolean, failedAccounts: string[] }
 *   { phase: "error", message: string }
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = getClientIp(request);
  const rateLimitResult = syncLimiter.check(rateLimitKey(user.id, ip));
  if (!rateLimitResult.allowed) {
    return Response.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(
            Math.ceil((rateLimitResult.retryAfterMs ?? 0) / 1000)
          ),
        },
      }
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
      };

      try {
        const result = await runSyncForUser({
          userId: user.id,
          // Trigger label: the FE can't tell whether this is the user's first
          // sync or not without an extra round-trip — the route doesn't try.
          // Onboarding still passes through this same handler.
          trigger: "manual",
          onProgress: (ev: ProgressEvent) => send(ev as Record<string, unknown>),
        });

        if (!result.ok) {
          if (result.errors[0] === "Up Bank not connected") {
            send({ phase: "error", message: "Up Bank not connected" });
            return;
          }
          if (result.unauthorized) {
            send({
              phase: "error",
              message:
                "Your Up Bank connection needs renewal. Please reconnect at /settings/up-connection",
            });
            return;
          }
        }

        if (result.errors.length > 0) {
          send({
            phase: "done",
            message: `Synced ${result.totalTxns} transactions with ${result.errors.length} error(s)`,
            txnCount: result.totalTxns,
            errors: result.errors,
            ok: result.ok,
            partial: result.partial,
            failedAccounts: result.failedAccounts,
          });
        } else {
          send({
            phase: "done",
            message: `Synced ${result.totalTxns} transactions!`,
            txnCount: result.totalTxns,
            ok: true,
            partial: false,
            failedAccounts: [],
          });
        }
      } catch (err) {
        console.error("Sync error:", err);
        send({
          phase: "error",
          message: "Sync failed. Please try again later.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
    },
  });
}
