"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Nunito, DM_Sans } from "next/font/google";
import { createClient } from "@/utils/supabase/client";
import { formatLastSynced } from "@/lib/user-display";
import { inferCategoryId } from "@/lib/infer-category";
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
  registerUpWebhook,
  deleteUpWebhook,
} from "@/app/actions/upbank";
import { SettingsDevTools } from "@/components/dev/settings-dev-tools";

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
      // Validate token with Up Bank API
      const response = await fetch("https://api.up.com.au/api/v1/util/ping", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Invalid API token. Please check and try again.");
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Save the token
      const { error: saveError } = await supabase
        .from("up_api_configs")
        .upsert({
          user_id: user.id,
          encrypted_token: token,
          is_active: true,
        }, { onConflict: "user_id" });

      if (saveError) throw saveError;

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

  const sortCategoriesParentFirst = (categories: any[]): any[] => {
    const sorted: any[] = [];
    const remaining = [...categories];
    const processedIds = new Set<string>();

    while (remaining.length > 0) {
      const beforeLength = remaining.length;

      for (let i = remaining.length - 1; i >= 0; i--) {
        const category = remaining[i];
        const parentId = category.relationships.parent.data?.id;

        if (!parentId || processedIds.has(parentId)) {
          sorted.push(category);
          processedIds.add(category.id);
          remaining.splice(i, 1);
        }
      }

      if (remaining.length === beforeLength) {
        sorted.push(...remaining);
        break;
      }
    }

    return sorted;
  };

  const handleSync = async () => {
    setSyncing(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: config } = await supabase
        .from("up_api_configs")
        .select("encrypted_token, last_synced_at")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!config?.encrypted_token) throw new Error("No token found");

      const accountsRes = await fetch("https://api.up.com.au/api/v1/accounts", {
        headers: {
          Authorization: `Bearer ${config.encrypted_token}`,
        },
      });

      if (!accountsRes.ok) throw new Error("Failed to fetch accounts");

      const { data: upAccounts } = await accountsRes.json();

      const categoriesRes = await fetch("https://api.up.com.au/api/v1/categories", {
        headers: {
          Authorization: `Bearer ${config.encrypted_token}`,
        },
      });

      if (categoriesRes.ok) {
        const { data: upCategories } = await categoriesRes.json();
        const sortedCategories = sortCategoriesParentFirst(upCategories);

        for (const category of sortedCategories) {
          await supabase
            .from("categories")
            .upsert({
              id: category.id,
              name: category.attributes.name,
              parent_category_id: category.relationships.parent.data?.id || null,
            }, {
              onConflict: "id",
            });
        }
      }

      // Pre-load overrides and merchant rules for inline category resolution
      const { data: allOverrides } = await supabase
        .from("transaction_category_overrides")
        .select("transaction_id, override_category_id, override_parent_category_id");

      const overridesByTxnId = new Map(
        (allOverrides || []).map((o: any) => [o.transaction_id, o])
      );

      const { data: merchantRules } = await supabase
        .from("merchant_category_rules")
        .select("merchant_description, category_id, parent_category_id")
        .eq("user_id", user.id);

      const merchantRulesByDesc = new Map(
        (merchantRules || []).map((r: any) => [r.merchant_description, r])
      );

      for (const account of upAccounts) {
        const { data: savedAccount } = await supabase
          .from("accounts")
          .upsert({
            user_id: user.id,
            up_account_id: account.id,
            display_name: account.attributes.displayName,
            account_type: account.attributes.accountType,
            ownership_type: account.attributes.ownershipType,
            balance_cents: account.attributes.balance.valueInBaseUnits,
            currency_code: account.attributes.balance.currencyCode,
            is_active: true,
            last_synced_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }, {
            onConflict: "user_id,up_account_id",
          })
          .select()
          .single();

        if (!savedAccount) continue;

        // Pre-load existing transaction IDs for override lookup
        const { data: existingTxns } = await supabase
          .from("transactions")
          .select("id, up_transaction_id")
          .eq("account_id", savedAccount.id);

        const txnIdByUpId = new Map(
          (existingTxns || []).map((t: any) => [t.up_transaction_id, t.id])
        );

        const twelveMonthsAgo = new Date();
        twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

        const lastSyncTime = config.last_synced_at ? new Date(config.last_synced_at) : twelveMonthsAgo;
        const sinceDate = lastSyncTime > twelveMonthsAgo ? lastSyncTime : twelveMonthsAgo;

        let nextUrl: string | null = `https://api.up.com.au/api/v1/accounts/${account.id}/transactions?page[size]=100&filter[since]=${sinceDate.toISOString()}`;

        while (nextUrl) {
          const transactionsRes: Response = await fetch(nextUrl, {
            headers: {
              Authorization: `Bearer ${config.encrypted_token}`,
            },
          });

          if (!transactionsRes.ok) break;

          const txnData: any = await transactionsRes.json();

          for (const txn of txnData.data) {
            let transferAccountId = null;
            if (txn.relationships.transferAccount?.data?.id) {
              const { data: transferAccount } = await supabase
                .from("accounts")
                .select("id")
                .eq("up_account_id", txn.relationships.transferAccount.data.id)
                .eq("user_id", user.id)
                .maybeSingle();
              transferAccountId = transferAccount?.id || null;
            }

            // Resolve category with priority: override > merchant rule > infer
            let finalCategoryId = inferCategoryId({
              upCategoryId: txn.relationships.category.data?.id || null,
              transferAccountId,
              roundUpAmountCents: txn.attributes.roundUp?.amount?.valueInBaseUnits || null,
              transactionType: txn.attributes.transactionType || null,
              description: txn.attributes.description,
              amountCents: txn.attributes.amount.valueInBaseUnits,
            });
            let finalParentCategoryId = txn.relationships.parentCategory.data?.id || null;

            const merchantRule = merchantRulesByDesc.get(txn.attributes.description);
            if (merchantRule) {
              finalCategoryId = merchantRule.category_id;
              finalParentCategoryId = merchantRule.parent_category_id;
            }

            const existingId = txnIdByUpId.get(txn.id);
            if (existingId) {
              const override = overridesByTxnId.get(existingId);
              if (override) {
                finalCategoryId = override.override_category_id;
                finalParentCategoryId = override.override_parent_category_id;
              }
            }

            await supabase
              .from("transactions")
              .upsert({
                account_id: savedAccount.id,
                up_transaction_id: txn.id,
                description: txn.attributes.description,
                raw_text: txn.attributes.rawText,
                message: txn.attributes.message,
                amount_cents: txn.attributes.amount.valueInBaseUnits,
                currency_code: txn.attributes.amount.currencyCode,
                status: txn.attributes.status,
                category_id: finalCategoryId,
                parent_category_id: finalParentCategoryId,
                settled_at: txn.attributes.settledAt,
                created_at: txn.attributes.createdAt,
                hold_info_amount_cents: txn.attributes.holdInfo?.amount?.valueInBaseUnits || null,
                hold_info_foreign_amount_cents: txn.attributes.holdInfo?.foreignAmount?.valueInBaseUnits || null,
                hold_info_foreign_currency_code: txn.attributes.holdInfo?.foreignAmount?.currencyCode || null,
                round_up_amount_cents: txn.attributes.roundUp?.amount?.valueInBaseUnits || null,
                round_up_boost_cents: txn.attributes.roundUp?.boostPortion?.valueInBaseUnits || null,
                cashback_amount_cents: txn.attributes.cashback?.amount?.valueInBaseUnits || null,
                cashback_description: txn.attributes.cashback?.description || null,
                foreign_amount_cents: txn.attributes.foreignAmount?.valueInBaseUnits || null,
                foreign_currency_code: txn.attributes.foreignAmount?.currencyCode || null,
                card_purchase_method: txn.attributes.cardPurchaseMethod?.method || null,
                card_number_suffix: txn.attributes.cardPurchaseMethod?.cardNumberSuffix || null,
                transfer_account_id: transferAccountId,
                is_categorizable: txn.attributes.isCategorizable ?? true,
                transaction_type: txn.attributes.transactionType || null,
                deep_link_url: txn.attributes.deepLinkURL || null,
              }, {
                onConflict: "account_id,up_transaction_id",
              });

            if (txn.relationships.tags?.data && Array.isArray(txn.relationships.tags.data)) {
              for (const tag of txn.relationships.tags.data) {
                await supabase
                  .from("tags")
                  .upsert({ name: tag.id }, { onConflict: "name" });

                const { data: savedTransaction } = await supabase
                  .from("transactions")
                  .select("id")
                  .eq("up_transaction_id", txn.id)
                  .eq("account_id", savedAccount.id)
                  .maybeSingle();

                if (savedTransaction) {
                  await supabase
                    .from("transaction_tags")
                    .upsert({
                      transaction_id: savedTransaction.id,
                      tag_name: tag.id,
                    }, {
                      onConflict: "transaction_id,tag_name",
                    });
                }
              }
            }
          }

          nextUrl = txnData.links?.next || null;
        }
      }

      await supabase
        .from("up_api_configs")
        .update({ last_synced_at: new Date().toISOString() })
        .eq("user_id", user.id);

      // Rematch expenses to newly synced transactions
      try {
        await fetch("/api/expenses/rematch-all", { method: "POST" });
      } catch {
        // Non-critical: expense rematch is best-effort
      }

      setSuccess("Sync complete!");
      await checkConnection();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm("Are you sure you want to disconnect your UP Bank account?")) return;

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Disable webhook if enabled
      if (webhookEnabled) {
        await deleteUpWebhook();
        setWebhookEnabled(false);
      }

      await supabase
        .from("up_api_configs")
        .update({ is_active: false })
        .eq("user_id", user.id);

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
                  <Button
                    variant="outline"
                    onClick={handleDisconnect}
                    disabled={loading}
                    className="h-9 rounded-xl font-[family-name:var(--font-dm-sans)] text-xs font-medium border-2 text-error hover:bg-error-light hover:border-error-border"
                    data-testid="disconnect-button"
                  >
                    Disconnect
                  </Button>
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
                    <Button
                      variant="outline"
                      onClick={handleDisconnect}
                      disabled={loading}
                      className="h-9 rounded-xl font-[family-name:var(--font-dm-sans)] text-xs font-medium border-2 text-error hover:bg-error-light hover:border-error-border"
                      data-testid="disconnect-button"
                    >
                      Disconnect
                    </Button>
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
      <SettingsDevTools webhookEnabled={webhookEnabled} />
    </div>
  );
}
