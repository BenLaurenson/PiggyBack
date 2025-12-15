"use client";

import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Bug, X, GripVertical, Loader2, Bell, CloudDownload, Zap, ZapOff, Calculator, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/utils/supabase/client";
import { pingWebhook, registerUpWebhook, deleteUpWebhook } from "@/app/actions/upbank";

interface SettingsDevToolsProps {
  webhookEnabled: boolean;
}

export function SettingsDevTools({ webhookEnabled: initialWebhookEnabled }: SettingsDevToolsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isPinging, setIsPinging] = useState(false);
  const [isTogglingWebhook, setIsTogglingWebhook] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [webhookEnabled, setWebhookEnabled] = useState(initialWebhookEnabled);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const constraintsRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  // Only render in development
  if (process.env.NODE_ENV !== "development") return null;

  // Update webhook state when prop changes
  useEffect(() => {
    setWebhookEnabled(initialWebhookEnabled);
  }, [initialWebhookEnabled]);

  // Mark as mounted and load saved position from localStorage
  useEffect(() => {
    setIsMounted(true);
    const saved = localStorage.getItem("settings_dev_tools_position");
    if (saved) {
      try {
        setPosition(JSON.parse(saved));
      } catch {
        // Invalid saved position, use default
      }
    }
  }, []);

  // Auto-clear message
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  // Save position when dragging ends
  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: { point: { x: number; y: number } }) => {
    const newPos = { x: info.point.x, y: info.point.y };
    setPosition(newPos);
    localStorage.setItem("settings_dev_tools_position", JSON.stringify(newPos));
  };

  // Don't render until mounted to avoid hydration mismatch
  if (!isMounted) return null;

  // Default position (bottom-right corner)
  const defaultPosition = { x: window.innerWidth - 80, y: window.innerHeight - 80 };
  const initialPosition = position || defaultPosition;

  const handlePingWebhook = async () => {
    setIsPinging(true);
    try {
      const result = await pingWebhook();
      if (result.error) {
        setMessage(`Error: ${result.error}`);
      } else {
        setMessage("Webhook ping sent!");
      }
    } catch (error) {
      setMessage("Ping failed");
    } finally {
      setIsPinging(false);
    }
  };

  const handleToggleWebhook = async () => {
    setIsTogglingWebhook(true);
    try {
      if (webhookEnabled) {
        const result = await deleteUpWebhook();
        if (result.error) {
          setMessage(`Error: ${result.error}`);
        } else {
          setWebhookEnabled(false);
          setMessage("Webhook disabled");
        }
      } else {
        const result = await registerUpWebhook();
        if (result.error) {
          setMessage(`Error: ${result.error}`);
        } else {
          setWebhookEnabled(true);
          setMessage("Webhook enabled");
        }
      }
    } catch (error) {
      setMessage("Toggle failed");
    } finally {
      setIsTogglingWebhook(false);
    }
  };

  const handleRecalculatePeriods = async () => {
    setIsRecalculating(true);
    try {
      const response = await fetch("/api/expenses/recalculate-periods", { method: "POST" });
      const result = await response.json();
      if (!response.ok) {
        setMessage(`Error: ${result.error}`);
      } else {
        setMessage(`Fixed ${result.totalUpdated} expense periods`);
      }
    } catch (error) {
      setMessage("Recalculate failed");
    } finally {
      setIsRecalculating(false);
    }
  };

  const handleBackfillAll = async () => {
    setIsBackfilling(true);
    try {
      const response = await fetch("/api/expenses/backfill-all", { method: "POST" });
      const result = await response.json();
      if (!response.ok) {
        setMessage(`Error: ${result.error}`);
      } else {
        setMessage(`Backfilled ${result.totalMatched} transactions`);
        // Reload to show updated matches
        setTimeout(() => window.location.reload(), 1500);
      }
    } catch (error) {
      setMessage("Backfill failed");
    } finally {
      setIsBackfilling(false);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: config } = await supabase
        .from("up_api_configs")
        .select("encrypted_token")
        .eq("user_id", user.id)
        .single();

      if (!config?.encrypted_token) {
        setMessage("No Up Bank connection");
        return;
      }

      // Fetch accounts
      const accountsRes = await fetch("https://api.up.com.au/api/v1/accounts", {
        headers: { Authorization: `Bearer ${config.encrypted_token}` },
      });
      if (!accountsRes.ok) throw new Error("Failed to fetch accounts");
      const { data: upAccounts } = await accountsRes.json();

      // Sync each account's transactions (last 7 days)
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
          }, { onConflict: "user_id,up_account_id" })
          .select()
          .single();

        if (!savedAccount) continue;

        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        let nextUrl: string | null = `https://api.up.com.au/api/v1/accounts/${account.id}/transactions?page[size]=100&filter[since]=${sevenDaysAgo.toISOString()}`;

        while (nextUrl) {
          const txnRes: Response = await fetch(nextUrl, {
            headers: { Authorization: `Bearer ${config.encrypted_token}` },
          });
          if (!txnRes.ok) break;

          const txnData: { data: any[]; links?: { next?: string } } = await txnRes.json();

          for (const txn of txnData.data) {
            await supabase.from("transactions").upsert({
              account_id: savedAccount.id,
              up_transaction_id: txn.id,
              description: txn.attributes.description,
              raw_text: txn.attributes.rawText,
              message: txn.attributes.message,
              amount_cents: txn.attributes.amount.valueInBaseUnits,
              currency_code: txn.attributes.amount.currencyCode,
              status: txn.attributes.status,
              category_id: txn.relationships.category.data?.id || null,
              parent_category_id: txn.relationships.parentCategory.data?.id || null,
              settled_at: txn.attributes.settledAt,
              created_at: txn.attributes.createdAt,
              is_categorizable: txn.attributes.isCategorizable ?? true,
            }, { onConflict: "account_id,up_transaction_id" });
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

      setMessage(`Synced ${upAccounts.length} accounts`);
      window.location.reload();
    } catch (error) {
      console.error("Sync error:", error);
      setMessage("Sync failed");
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div ref={constraintsRef} className="fixed inset-0 pointer-events-none z-50">
      <motion.div
        drag
        dragConstraints={constraintsRef}
        dragElastic={0.1}
        onDragEnd={handleDragEnd}
        initial={initialPosition}
        style={{ position: "absolute", left: 0, top: 0 }}
        className="pointer-events-auto"
      >
        {isOpen ? (
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-zinc-900 text-white rounded-xl shadow-2xl border border-zinc-700 w-64 overflow-hidden"
          >
            {/* Header with drag handle */}
            <div className="flex items-center justify-between p-3 border-b border-zinc-700 cursor-move">
              <div className="flex items-center gap-2">
                <GripVertical className="h-4 w-4 text-zinc-500" />
                <span className="font-bold text-sm">Dev Tools</span>
              </div>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setIsOpen(false)}
                className="h-6 w-6 text-zinc-400 hover:text-white hover:bg-zinc-800"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Message */}
            {message && (
              <div className="px-3 py-2 text-xs bg-zinc-800 text-zinc-300">
                {message}
              </div>
            )}

            {/* Dev Options */}
            <div className="p-2 space-y-1">
              <button
                onClick={handleSync}
                disabled={isSyncing}
                className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-zinc-800 text-left text-sm transition-colors disabled:opacity-50"
              >
                {isSyncing ? (
                  <Loader2 className="h-4 w-4 text-teal-400 animate-spin" />
                ) : (
                  <CloudDownload className="h-4 w-4 text-teal-400" />
                )}
                {isSyncing ? "Syncing..." : "Sync Up Bank (7 days)"}
              </button>

              <button
                onClick={handlePingWebhook}
                disabled={isPinging || !webhookEnabled}
                className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-zinc-800 text-left text-sm transition-colors disabled:opacity-50"
              >
                {isPinging ? (
                  <Loader2 className="h-4 w-4 text-amber-400 animate-spin" />
                ) : (
                  <Bell className="h-4 w-4 text-amber-400" />
                )}
                {isPinging ? "Pinging..." : "Test Webhook"}
              </button>

              <button
                onClick={handleToggleWebhook}
                disabled={isTogglingWebhook}
                className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-zinc-800 text-left text-sm transition-colors disabled:opacity-50"
              >
                {isTogglingWebhook ? (
                  <Loader2 className="h-4 w-4 text-purple-400 animate-spin" />
                ) : webhookEnabled ? (
                  <ZapOff className="h-4 w-4 text-purple-400" />
                ) : (
                  <Zap className="h-4 w-4 text-purple-400" />
                )}
                {isTogglingWebhook
                  ? "Toggling..."
                  : webhookEnabled
                  ? "Disable Webhook"
                  : "Enable Webhook"}
              </button>

              <button
                onClick={handleRecalculatePeriods}
                disabled={isRecalculating}
                className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-zinc-800 text-left text-sm transition-colors disabled:opacity-50"
              >
                {isRecalculating ? (
                  <Loader2 className="h-4 w-4 text-cyan-400 animate-spin" />
                ) : (
                  <Calculator className="h-4 w-4 text-cyan-400" />
                )}
                {isRecalculating ? "Fixing..." : "Fix Expense Periods"}
              </button>

              <button
                onClick={handleBackfillAll}
                disabled={isBackfilling}
                className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-zinc-800 text-left text-sm transition-colors disabled:opacity-50"
              >
                {isBackfilling ? (
                  <Loader2 className="h-4 w-4 text-emerald-400 animate-spin" />
                ) : (
                  <History className="h-4 w-4 text-emerald-400" />
                )}
                {isBackfilling ? "Backfilling..." : "Backfill All Expenses"}
              </button>

              <div className="border-t border-zinc-700 pt-2 mt-2">
                <div className="px-2 py-1 text-xs text-zinc-500">
                  Webhook: {webhookEnabled ? "Enabled" : "Disabled"}
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsOpen(true)}
            className="w-12 h-12 bg-zinc-900 text-amber-400 rounded-full shadow-lg border border-zinc-700 flex items-center justify-center hover:bg-zinc-800 transition-colors"
            title="Dev Tools"
          >
            <Bug className="h-5 w-5" />
          </motion.button>
        )}
      </motion.div>
    </div>
  );
}
