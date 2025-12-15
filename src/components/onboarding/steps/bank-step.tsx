"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CreditCard, Loader2, Eye, EyeOff, ExternalLink, CheckCircle } from "lucide-react";
import { connectUpBank, registerUpWebhook } from "@/app/actions/upbank";

interface BankStepProps {
  onNext: () => void;
  onComplete: () => void;
}

type SyncPhase = "idle" | "connecting" | "syncing-accounts" | "syncing-categories" | "syncing-transactions" | "finishing" | "done";

export function BankStep({ onNext, onComplete }: BankStepProps) {
  const [upToken, setUpToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncPhase, setSyncPhase] = useState<SyncPhase>("idle");
  const [syncProgress, setSyncProgress] = useState("");
  const [txnCount, setTxnCount] = useState(0);

  const handleConnect = async () => {
    if (!upToken.trim()) {
      onNext();
      return;
    }
    setLoading(true);
    setError(null);

    try {
      // Phase 1: Validate and encrypt token server-side
      setSyncPhase("connecting");
      setSyncProgress("Validating your token...");
      const connectResult = await connectUpBank(upToken);
      if (connectResult.error) throw new Error(connectResult.error);

      // Phase 2-5: Full sync via server-side API route (streams progress)
      const response = await fetch("/api/upbank/sync", { method: "POST" });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Sync failed");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("Failed to read sync response");

      const decoder = new TextDecoder();
      let buffer = "";

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
            if (data.phase === "error") throw new Error(data.message);
            if (data.phase) setSyncPhase(data.phase as SyncPhase);
            if (data.message) setSyncProgress(data.message);
            if (data.txnCount !== undefined) setTxnCount(data.txnCount);
          } catch (parseErr) {
            if (parseErr instanceof SyntaxError) continue;
            throw parseErr;
          }
        }
      }

      // Post-sync: rematch expenses (non-critical)
      try {
        await fetch("/api/expenses/rematch-all", { method: "POST" });
      } catch {
        // Non-critical
      }

      // Post-sync: register webhook (non-critical)
      try {
        await registerUpWebhook();
      } catch {
        // Non-critical
      }

      setSyncPhase("done");
      setTimeout(() => onComplete(), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect bank");
      setSyncPhase("idle");
    } finally {
      setLoading(false);
    }
  };

  // Show sync progress screen
  if (syncPhase !== "idle" && syncPhase !== "done") {
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
          {txnCount > 0 && (
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

  // Done screen
  if (syncPhase === "done") {
    return (
      <div className="text-center space-y-4 py-8">
        <CheckCircle className="h-16 w-16 mx-auto" style={{ color: "var(--pastel-mint)" }} />
        <h2 className="text-xl font-[family-name:var(--font-nunito)] font-bold" style={{ color: "var(--text-primary)" }}>
          Bank Connected!
        </h2>
        <p className="font-[family-name:var(--font-dm-sans)]" style={{ color: "var(--text-secondary)" }}>
          {syncProgress}
        </p>
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
