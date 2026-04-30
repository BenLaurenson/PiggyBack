"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CreditCard, Loader2, Eye, EyeOff, ExternalLink, CheckCircle } from "lucide-react";
import { connectUpBank, registerUpWebhook } from "@/app/actions/upbank";
import { createClient } from "@/utils/supabase/client";

interface BankStepProps {
  onNext: () => void;
  onComplete: () => void;
  isStepCompleted?: boolean;
  serverAccountCount?: number;
}

type SyncPhase = "idle" | "connecting" | "syncing-accounts" | "syncing-categories" | "syncing-transactions" | "syncing-tags" | "finishing" | "done" | "error";

export function BankStep({ onNext, onComplete, isStepCompleted, serverAccountCount = 0 }: BankStepProps) {
  const [upToken, setUpToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncPhase, setSyncPhase] = useState<SyncPhase>("idle");
  const [syncProgress, setSyncProgress] = useState("");
  const [txnCount, setTxnCount] = useState(0);
  const [syncErrors, setSyncErrors] = useState<string[]>([]);
  const [alreadyConnected, setAlreadyConnected] = useState(!!isStepCompleted);
  const [accountCount, setAccountCount] = useState(serverAccountCount);
  const [checkingConnection, setCheckingConnection] = useState(!isStepCompleted);
  const [showReconnectForm, setShowReconnectForm] = useState(false);

  useEffect(() => {
    // If parent already knows step is completed, no need to check
    if (isStepCompleted) return;

    const checkConnection = async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: config } = await supabase
          .from("up_api_configs")
          .select("is_active, encrypted_token")
          .eq("user_id", user.id)
          .maybeSingle();

        if (config?.is_active || config?.encrypted_token) {
          const { count } = await supabase
            .from("accounts")
            .select("*", { count: "exact", head: true })
            .eq("user_id", user.id)
            .eq("is_active", true);

          setAlreadyConnected(true);
          setAccountCount(count || serverAccountCount);
        }
      } finally {
        setCheckingConnection(false);
      }
    };
    checkConnection();
  }, [isStepCompleted, serverAccountCount]);

  /**
   * Stream the /api/upbank/sync response, updating progress state as we go.
   * Returns the final phase + collected per-account errors so the caller can
   * decide whether to surface a retry UI.
   */
  const runSync = async (): Promise<{ phase: "done" | "error"; errors: string[]; fatalMessage?: string }> => {
    setSyncErrors([]);
    const collectedErrors: string[] = [];

    const response = await fetch("/api/upbank/sync", { method: "POST" });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { phase: "error", errors: collectedErrors, fatalMessage: errorData.error || `HTTP ${response.status}` };
    }

    const reader = response.body?.getReader();
    if (!reader) {
      return { phase: "error", errors: collectedErrors, fatalMessage: "Failed to read sync response" };
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let finalPhase: "done" | "error" = "error";
    let fatalMessage: string | undefined;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const data = JSON.parse(line);
          if (data.phase) setSyncPhase(data.phase as SyncPhase);
          if (data.message) setSyncProgress(data.message);
          if (data.txnCount !== undefined) setTxnCount(data.txnCount);
          if (Array.isArray(data.errors)) {
            for (const e of data.errors) {
              if (typeof e === "string" && !collectedErrors.includes(e)) {
                collectedErrors.push(e);
              }
            }
          }
          if (data.phase === "done") finalPhase = "done";
          if (data.phase === "error") {
            finalPhase = "error";
            fatalMessage = data.message;
          }
        } catch (parseErr) {
          if (parseErr instanceof SyntaxError) continue;
          throw parseErr;
        }
      }
    }

    setSyncErrors(collectedErrors);
    return { phase: finalPhase, errors: collectedErrors, fatalMessage };
  };

  const runPostSyncSideEffects = async () => {
    // Both are non-critical — failure here shouldn't block the user.
    try {
      await fetch("/api/expenses/rematch-all", { method: "POST" });
    } catch {
      /* non-critical */
    }
    try {
      await registerUpWebhook();
    } catch {
      /* non-critical */
    }
  };

  /**
   * Run the sync stream up to `maxAttempts` times. After the first attempt
   * we only re-run if there were errors (and we keep the lower error count
   * across retries — sometimes the second pass catches stragglers from the
   * first pass that needed Up Bank's pagination state to settle).
   *
   * The transaction upsert uses ON CONFLICT, so re-running is fully idempotent.
   */
  const runSyncWithAutoRetry = async (maxAttempts = 2) => {
    let bestResult = await runSync();
    let attempt = 1;
    while (
      bestResult.phase === "done" &&
      bestResult.errors.length > 0 &&
      attempt < maxAttempts
    ) {
      attempt++;
      setSyncProgress(`Retrying ${bestResult.errors.length} accounts that didn't sync... (attempt ${attempt} of ${maxAttempts})`);
      // Brief pause so any transient Up rate limits/blips clear.
      await new Promise((r) => setTimeout(r, 1500));
      const next = await runSync();
      // Keep the result with fewer errors (auto-retry can only help, not hurt).
      if (next.phase === "done" && next.errors.length < bestResult.errors.length) {
        bestResult = next;
      } else if (next.phase === "error") {
        // A fatal error on retry — surface it, but preserve the partial errors
        // from the first pass.
        bestResult = { ...next, errors: bestResult.errors };
        break;
      }
    }
    setSyncErrors(bestResult.errors);
    return bestResult;
  };

  const handleConnect = async () => {
    if (!upToken.trim()) {
      onNext();
      return;
    }
    setLoading(true);
    setError(null);
    setSyncErrors([]);

    try {
      // Phase 1: Validate and encrypt token server-side
      setSyncPhase("connecting");
      setSyncProgress("Validating your token...");
      const connectResult = await connectUpBank(upToken);
      if (connectResult.error) throw new Error(connectResult.error);

      // Phase 2-5: Full sync via server-side API route (streams progress).
      // Auto-retries up to 2 times if the BE reports per-account errors.
      const result = await runSyncWithAutoRetry();
      if (result.phase === "error") {
        setError(result.fatalMessage || "Sync failed. Please try again.");
        setSyncPhase("error");
        return;
      }

      await runPostSyncSideEffects();
      setSyncPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect bank");
      setSyncPhase("idle");
    } finally {
      setLoading(false);
    }
  };

  /**
   * Retry the sync without re-validating the Up Bank token. The stored
   * encrypted token in `up_api_configs` is reused — the user doesn't have
   * to paste their PAT again. Idempotent: previously-synced accounts just
   * upsert into existing rows.
   */
  const handleRetrySync = async () => {
    setLoading(true);
    setError(null);
    setSyncErrors([]);
    setTxnCount(0);
    setSyncProgress("Retrying sync...");
    setSyncPhase("syncing-accounts");

    try {
      const result = await runSyncWithAutoRetry();
      if (result.phase === "error") {
        setError(result.fatalMessage || "Sync failed. Please try again.");
        setSyncPhase("error");
        return;
      }
      await runPostSyncSideEffects();
      setSyncPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to retry sync");
      setSyncPhase("error");
    } finally {
      setLoading(false);
    }
  };

  // Loading connection check (only show spinner if we don't already know it's completed)
  if (checkingConnection && !alreadyConnected) {
    return (
      <div className="text-center py-8">
        <Loader2 className="h-8 w-8 mx-auto animate-spin" style={{ color: "var(--text-tertiary)" }} />
      </div>
    );
  }

  // Already connected screen
  if (alreadyConnected && !showReconnectForm && syncPhase === "idle") {
    return (
      <div className="text-center space-y-6 py-8">
        <CheckCircle className="h-16 w-16 mx-auto" style={{ color: "var(--pastel-mint)" }} />
        <div className="space-y-2">
          <h2 className="text-xl font-[family-name:var(--font-nunito)] font-bold" style={{ color: "var(--text-primary)" }}>
            Bank Connected
          </h2>
          <p className="font-[family-name:var(--font-dm-sans)]" style={{ color: "var(--text-secondary)" }}>
            {accountCount} account{accountCount !== 1 ? "s" : ""} synced with Up Bank
          </p>
        </div>
        <div className="space-y-3 max-w-sm mx-auto">
          <Button
            onClick={onComplete}
            className="w-full rounded-xl font-[family-name:var(--font-nunito)] font-bold"
            style={{ backgroundColor: "var(--pastel-mint)", color: "white" }}
          >
            Continue
          </Button>
          <Button
            variant="ghost"
            onClick={() => setShowReconnectForm(true)}
            className="w-full text-sm"
            style={{ color: "var(--text-tertiary)" }}
          >
            Reconnect with a different token
          </Button>
        </div>
      </div>
    );
  }

  // Show sync progress screen — in-flight phases only (not "error" or "done")
  if (
    syncPhase !== "idle" &&
    syncPhase !== "done" &&
    syncPhase !== "error"
  ) {
    return (
      <div className="text-center space-y-6 py-8">
        <Loader2 className="h-16 w-16 mx-auto animate-spin" style={{ color: "var(--pastel-mint)" }} />
        <div className="space-y-2">
          <h2 className="text-xl font-[family-name:var(--font-nunito)] font-bold" style={{ color: "var(--text-primary)" }}>
            Setting up your bank
          </h2>
          <p className="font-[family-name:var(--font-dm-sans)]" style={{ color: "var(--text-secondary)" }}>
            {syncProgress}
          </p>
          {/* Only show the running count when the current message doesn't
              already include it (e.g. during tag-canonical sync we still
              want users to see how many transactions ended up imported). */}
          {txnCount > 0 && !/\btransactions?\b/i.test(syncProgress) && (
            <p className="text-sm font-[family-name:var(--font-dm-sans)]" style={{ color: "var(--text-tertiary)" }}>
              {txnCount} transactions synced
            </p>
          )}
        </div>
        <p className="text-xs font-[family-name:var(--font-dm-sans)]" style={{ color: "var(--text-tertiary)" }}>
          This may take a minute for a full year of transactions
        </p>
      </div>
    );
  }

  // Error screen with retry — sync failed entirely (e.g. token rejected,
  // network blip, unrecoverable). User can retry without re-entering token.
  if (syncPhase === "error") {
    return (
      <div className="text-center space-y-6 py-8">
        <div className="h-16 w-16 mx-auto rounded-full flex items-center justify-center" style={{ backgroundColor: "var(--pastel-coral-light)" }}>
          <span className="text-3xl">⚠️</span>
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-[family-name:var(--font-nunito)] font-bold" style={{ color: "var(--text-primary)" }}>
            Sync didn&apos;t finish
          </h2>
          <p className="font-[family-name:var(--font-dm-sans)]" style={{ color: "var(--text-secondary)" }}>
            {error || "Something went wrong while syncing."}
          </p>
          {txnCount > 0 && (
            <p className="text-sm font-[family-name:var(--font-dm-sans)]" style={{ color: "var(--text-tertiary)" }}>
              {txnCount} transactions made it through before the error.
            </p>
          )}
          {syncErrors.length > 0 && (
            <ul className="text-xs font-[family-name:var(--font-dm-sans)] mt-3 inline-block text-left space-y-1" style={{ color: "var(--text-tertiary)" }}>
              {syncErrors.map((e, i) => (
                <li key={i}>• {e}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="space-y-3 max-w-sm mx-auto">
          <Button
            onClick={handleRetrySync}
            disabled={loading}
            className="w-full rounded-xl font-[family-name:var(--font-nunito)] font-bold"
            style={{ backgroundColor: "var(--pastel-mint)", color: "white" }}
          >
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin inline" /> : null}
            Retry sync
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setSyncPhase("idle");
              setError(null);
              setSyncErrors([]);
              setShowReconnectForm(true);
            }}
            className="w-full text-sm"
            style={{ color: "var(--text-tertiary)" }}
          >
            Reconnect with a different token
          </Button>
          {txnCount > 0 && (
            <Button
              variant="ghost"
              onClick={onComplete}
              className="w-full text-sm"
              style={{ color: "var(--text-tertiary)" }}
            >
              Continue with what synced
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Done screen — full success or partial (some accounts skipped)
  if (syncPhase === "done") {
    const hadPartialFailure = syncErrors.length > 0;
    return (
      <div className="text-center space-y-6 py-8">
        <CheckCircle className="h-16 w-16 mx-auto" style={{ color: hadPartialFailure ? "var(--pastel-yellow-dark)" : "var(--pastel-mint)" }} />
        <div className="space-y-2">
          <h2 className="text-xl font-[family-name:var(--font-nunito)] font-bold" style={{ color: "var(--text-primary)" }}>
            {hadPartialFailure ? "Bank Connected (partial)" : "Bank Connected!"}
          </h2>
          <p className="font-[family-name:var(--font-dm-sans)]" style={{ color: "var(--text-secondary)" }}>
            {syncProgress}
          </p>
          {hadPartialFailure && (
            <div className="mt-3 inline-block text-left text-xs font-[family-name:var(--font-dm-sans)]" style={{ color: "var(--text-tertiary)" }}>
              <p className="mb-1 font-semibold" style={{ color: "var(--pastel-yellow-dark)" }}>
                Some accounts didn&apos;t finish syncing:
              </p>
              <ul className="space-y-1">
                {syncErrors.map((e, i) => (
                  <li key={i}>• {e}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="space-y-3 max-w-sm mx-auto">
          <Button
            onClick={onComplete}
            className="w-full rounded-xl font-[family-name:var(--font-nunito)] font-bold"
            style={{ backgroundColor: "var(--pastel-mint)", color: "white" }}
          >
            Continue
          </Button>
          {hadPartialFailure && (
            <Button
              variant="ghost"
              onClick={handleRetrySync}
              disabled={loading}
              className="w-full text-sm"
              style={{ color: "var(--text-tertiary)" }}
            >
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin inline" /> : null}
              Retry the missing accounts
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="p-4 rounded-full w-16 h-16 mx-auto flex items-center justify-center" style={{ backgroundColor: "var(--pastel-mint-light)" }}>
          <CreditCard className="h-8 w-8" style={{ color: "var(--pastel-mint-dark)" }} />
        </div>
        <h2 className="text-xl font-[family-name:var(--font-nunito)] font-bold" style={{ color: "var(--text-primary)" }}>
          Connect UP Bank
        </h2>
        <p className="font-[family-name:var(--font-dm-sans)]" style={{ color: "var(--text-secondary)" }}>
          Sync your accounts and transactions automatically
        </p>
      </div>
      <div className="space-y-4 max-w-sm mx-auto">
        <div className="space-y-2">
          <Label htmlFor="upToken">UP API Token</Label>
          <div className="relative">
            <Input
              id="upToken"
              type={showToken ? "text" : "password"}
              placeholder="up:yeah:xxxxxxxx"
              value={upToken}
              onChange={(e) => setUpToken(e.target.value)}
              className="pr-10"
            />
            <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full" onClick={() => setShowToken(!showToken)}>
              {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-xs font-[family-name:var(--font-dm-sans)]" style={{ color: "var(--text-tertiary)" }}>
            Get your token from{" "}
            <a href="https://api.up.com.au/getting_started" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1" style={{ color: "var(--pastel-blue-dark)" }}>
              api.up.com.au <ExternalLink className="h-3 w-3" />
            </a>
          </p>
        </div>
        {error && <p className="text-sm" style={{ color: "var(--pastel-coral)" }}>{error}</p>}
        <Button onClick={handleConnect} className="w-full rounded-xl font-[family-name:var(--font-nunito)] font-bold" style={{ backgroundColor: "var(--pastel-mint)", color: "white" }} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          {upToken ? "Connect & Sync" : "Skip for now"}
        </Button>
      </div>
    </div>
  );
}
