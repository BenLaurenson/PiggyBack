"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Nunito, DM_Sans } from "next/font/google";
import { createClient } from "@/utils/supabase/client";
import { formatLastSynced } from "@/lib/user-display";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CreditCard,
  Loader2,
  RefreshCw,
  ExternalLink,
  Eye,
  EyeOff,
  ArrowLeft,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  connectUpBank,
  registerUpWebhook,
  deleteUpWebhook,
} from "@/app/actions/upbank";
import { disconnectUpBank } from "@/app/actions/profile";
import dynamic from "next/dynamic";

const SettingsDevTools = dynamic(
  () => import("@/components/dev/settings-dev-tools").then(mod => ({ default: mod.SettingsDevTools })),
  { ssr: false }
);

const nunito = Nunito({
  subsets: ["latin"],
  variable: "--font-nunito",
  weight: ["600", "700", "800"]
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  weight: ["400", "500"]
});

export default function UpConnectionPage() {
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingConnection, setCheckingConnection] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [userEmail, setUserEmail] = useState<string>("");
  const [webhookEnabled, setWebhookEnabled] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    checkConnection();
  }, []);

  // Auto-clear error messages after 5 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Auto-clear success messages after 3 seconds
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  const checkConnection = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setUserEmail(user.email || "");

      const { data: config } = await supabase
        .from("up_api_configs")
        .select("is_active, last_synced_at, webhook_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (config?.is_active) {
        setIsConnected(true);
        setLastSynced(config.last_synced_at);
        setWebhookEnabled(!!config.webhook_id);

        const { data: accts } = await supabase
          .from("accounts")
          .select("*")
          .eq("user_id", user.id)
          .eq("is_active", true);

        setAccounts(accts || []);
      }
    } finally {
      setCheckingConnection(false);
    }
  };

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // Validate and encrypt token server-side
      const connectResult = await connectUpBank(token);
      if (connectResult.error) throw new Error(connectResult.error);

      setSuccess("Connected to UP Bank!");
      setIsConnected(true);
      setToken("");

      // Sync accounts and transactions
      await handleSync();

      // Auto-enable real-time sync in the background
      try {
        const webhookResult = await registerUpWebhook();
        if (webhookResult.success) {
          setWebhookEnabled(true);
        }
      } catch {
        // Silently fail - real-time sync is optional
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect");
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setError(null);

    try {
      const response = await fetch("/api/upbank/sync", { method: "POST" });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Sync failed");
      }

      // Read the streaming response
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Failed to read sync response");

      const decoder = new TextDecoder();
      let buffer = "";
      let lastMessage = "";

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
            if (data.message) lastMessage = data.message;
          } catch (parseErr) {
            if (parseErr instanceof SyntaxError) continue;
            throw parseErr;
          }
        }
      }

      // Rematch expenses to newly synced transactions
      try {
        await fetch("/api/expenses/rematch-all", { method: "POST" });
      } catch {
        // Non-critical: expense rematch is best-effort
      }

      setSuccess(lastMessage || "Sync complete!");
      await checkConnection();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    setLoading(true);
    try {
      // Disable webhook if enabled
      if (webhookEnabled) {
        await deleteUpWebhook();
        setWebhookEnabled(false);
      }

      const result = await disconnectUpBank();
      if (result.error) throw new Error(result.error);

      setIsConnected(false);
      setAccounts([]);
      setSuccess("Disconnected from UP Bank");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disconnect");
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
    }).format(cents / 100);
  };

  if (checkingConnection) {
    return (
      <div className={`p-4 md:p-6 lg:p-8 max-w-4xl mx-auto ${nunito.variable} ${dmSans.variable}`}>
        <div className="text-center py-12">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-brand-coral" />
        </div>
      </div>
    );
  }

  return (
    <div className={`p-4 md:p-6 lg:p-8 max-w-4xl mx-auto ${nunito.variable} ${dmSans.variable}`}>
      {/* Header */}
      <div className="space-y-1 mb-6">
        <Link href="/settings" className="text-sm font-[family-name:var(--font-dm-sans)] text-text-secondary hover:text-text-primary flex items-center gap-1 mb-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Settings
        </Link>
        <h1 className="font-[family-name:var(--font-nunito)] text-3xl font-black text-text-primary">
          UP Bank
        </h1>
        <p className="font-[family-name:var(--font-dm-sans)] text-text-secondary">
          Connect your UP Bank account to automatically import transactions
        </p>
      </div>

      {error && (
        <div className="p-4 text-sm bg-error-light border-2 border-error-border rounded-xl text-error-text mb-6 flex items-center gap-2">
          <XCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {success && (
        <div className="p-4 text-sm bg-success-light border-2 border-success-border rounded-xl text-success mb-6 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          {success}
        </div>
      )}

      {/* Connected State */}
      {isConnected ? (
        <>
          {/* Connection Status Card */}
          <Card className="bg-surface-white-60 backdrop-blur-sm border-2 border-border-white-80 shadow-lg mb-6">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-success-light border-2 border-success-border flex items-center justify-center">
                    <CheckCircle2 className="h-6 w-6 text-success" />
                  </div>
                  <div>
                    <h2 className="font-[family-name:var(--font-nunito)] text-lg font-bold text-text-primary">
                      Connected
                    </h2>
                    <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary">
                      Last synced {formatLastSynced(lastSynced)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Real-time Sync Status */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-muted/30 border border-border mb-6" data-testid="realtime-sync-status">
                <div className="flex items-center gap-2">
                  {webhookEnabled ? (
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-success" />
                    </span>
                  ) : (
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-text-tertiary" />
                    </span>
                  )}
                  <span className="font-[family-name:var(--font-dm-sans)] text-sm text-text-primary">
                    Real-time sync
                  </span>
                </div>
                <span className={`font-[family-name:var(--font-dm-sans)] text-xs font-medium ${webhookEnabled ? 'text-success' : 'text-text-tertiary'}`} data-testid="realtime-sync-label">
                  {webhookEnabled ? 'Active' : 'Inactive'}
                </span>
              </div>

              {/* Accounts List */}
              <div className="space-y-3 mb-6">
                {accounts.map((account) => (
                  <div
                    key={account.id}
                    className="flex items-center justify-between p-4 rounded-xl bg-muted/50 border border-border"
                  >
                    <div>
                      <p className="font-[family-name:var(--font-nunito)] font-bold text-text-primary">
                        {account.display_name}
                      </p>
                      <p className="font-[family-name:var(--font-dm-sans)] text-xs text-text-tertiary uppercase tracking-wide">
                        {account.account_type}
                      </p>
                    </div>
                    <span className="font-[family-name:var(--font-nunito)] font-bold text-text-primary">
                      {formatCurrency(account.balance_cents)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Actions */}
              {webhookEnabled ? (
                <div className="flex items-center justify-between">
                  <button
                    onClick={handleSync}
                    disabled={syncing}
                    className="font-[family-name:var(--font-dm-sans)] text-xs text-text-tertiary hover:text-text-primary flex items-center gap-1.5 transition-colors disabled:opacity-50"
                    data-testid="full-sync-link"
                  >
                    {syncing ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3" />
                    )}
                    {syncing ? "Syncing..." : "Run full sync"}
                  </button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        disabled={loading}
                        className="h-9 rounded-xl font-[family-name:var(--font-dm-sans)] text-xs font-medium border-2 text-error hover:bg-error-light hover:border-error-border"
                        data-testid="disconnect-button"
                      >
                        Disconnect
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Disconnect UP Bank</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to disconnect your UP Bank account? Real-time sync will be disabled and you will need to reconnect to resume automatic transaction imports.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleDisconnect}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Disconnect
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ) : (
                <div className="space-y-3">
                  <Button
                    onClick={handleSync}
                    disabled={syncing}
                    className="w-full h-11 rounded-xl font-[family-name:var(--font-nunito)] font-bold bg-brand-coral hover:bg-brand-coral-dark hover:scale-[1.02] transition-all"
                    data-testid="sync-button"
                  >
                    {syncing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Syncing...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Sync Now
                      </>
                    )}
                  </Button>
                  <div className="flex items-center justify-between">
                    <p className="font-[family-name:var(--font-dm-sans)] text-xs text-text-tertiary">
                      Enable real-time sync for automatic updates
                    </p>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          disabled={loading}
                          className="h-9 rounded-xl font-[family-name:var(--font-dm-sans)] text-xs font-medium border-2 text-error hover:bg-error-light hover:border-error-border"
                          data-testid="disconnect-button"
                        >
                          Disconnect
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Disconnect UP Bank</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to disconnect your UP Bank account? You will need to reconnect to resume automatic transaction imports.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={handleDisconnect}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Disconnect
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        /* Connect Form */
        <Card className="bg-surface-white-60 backdrop-blur-sm border-2 border-border-white-80 shadow-lg mb-6">
          <CardContent className="pt-6">
            <form onSubmit={handleConnect} className="space-y-6">
              <input
                type="email"
                name="username"
                autoComplete="username"
                value={userEmail}
                readOnly
                style={{ display: "none" }}
                tabIndex={-1}
                aria-hidden="true"
              />

              <div className="space-y-2">
                <Label htmlFor="token" className="font-[family-name:var(--font-nunito)] font-bold text-text-primary">
                  API Token
                </Label>
                <div className="relative">
                  <Input
                    id="token"
                    type={showToken ? "text" : "password"}
                    placeholder="up:yeah:xxxxxxxx"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    required
                    disabled={loading}
                    className="h-12 rounded-xl border-2 font-[family-name:var(--font-dm-sans)] pr-12"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-12"
                    onClick={() => setShowToken(!showToken)}
                  >
                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="font-[family-name:var(--font-dm-sans)] text-xs text-text-secondary">
                  Get your token from the{" "}
                  <a
                    href="https://api.up.com.au/getting_started"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-coral hover:underline inline-flex items-center gap-1"
                  >
                    UP API Portal <ExternalLink className="h-3 w-3" />
                  </a>
                </p>
              </div>

              <Button
                type="submit"
                disabled={loading || !token}
                className="w-full h-12 rounded-xl font-[family-name:var(--font-nunito)] font-bold bg-brand-coral hover:bg-brand-coral-dark hover:scale-[1.02] transition-all"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <CreditCard className="h-4 w-4 mr-2" />
                    Connect Account
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Info Card */}
      <Card className="bg-surface-white-60 backdrop-blur-sm border-2 border-border-white-80 shadow-lg">
        <CardContent className="pt-6">
          <h3 className="font-[family-name:var(--font-nunito)] font-bold text-text-primary mb-3">
            How it works
          </h3>
          <ul className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary space-y-2 list-disc list-inside">
            <li>Your token is stored securely</li>
            <li>Transactions sync automatically</li>
            <li>We only read your data — never write</li>
            <li>Disconnect anytime</li>
          </ul>
        </CardContent>
      </Card>

      {/* Dev Tools */}
      {process.env.NODE_ENV === 'development' && (
        <SettingsDevTools webhookEnabled={webhookEnabled} />
      )}
    </div>
  );
}
