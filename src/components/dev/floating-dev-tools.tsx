"use client";

import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Bug, X, GripVertical, Trash2, Loader2, CloudDownload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/utils/supabase/client";

interface FloatingDevToolsProps {
  partnershipId: string;
  onClearLocalStorage: () => void;
}

export function FloatingDevTools({
  partnershipId,
  onClearLocalStorage,
}: FloatingDevToolsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const constraintsRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  // Only render in development
  if (process.env.NODE_ENV !== "development") return null;

  // Mark as mounted and load saved position from localStorage
  useEffect(() => {
    setIsMounted(true);
    const saved = localStorage.getItem("dev_tools_position");
    if (saved) {
      try {
        setPosition(JSON.parse(saved));
      } catch {
        // Invalid saved position, use default
      }
    }
  }, []);

  // Save position when dragging ends
  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: { point: { x: number; y: number } }) => {
    const newPos = { x: info.point.x, y: info.point.y };
    setPosition(newPos);
    localStorage.setItem("dev_tools_position", JSON.stringify(newPos));
  };

  // Don't render until mounted to avoid hydration mismatch
  if (!isMounted) return null;

  // Default position (bottom-right corner) - only calculated after mount
  const defaultPosition = { x: window.innerWidth - 80, y: window.innerHeight - 80 };
  const initialPosition = position || defaultPosition;

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

            {/* Dev Options */}
            <div className="p-2 space-y-1">
              <button
                onClick={() => {
                  onClearLocalStorage();
                  setIsOpen(false);
                }}
                className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-zinc-800 text-left text-sm transition-colors"
              >
                <Trash2 className="h-4 w-4 text-red-400" />
                Clear All Local Storage
              </button>

              <button
                onClick={async () => {
                  setIsSyncing(true);
                  try {
                    const { data: { user } } = await supabase.auth.getUser();
                    if (!user) throw new Error("Not authenticated");

                    const { data: config } = await supabase
                      .from("up_api_configs")
                      .select("encrypted_token, last_synced_at")
                      .eq("user_id", user.id)
                      .single();

                    if (!config?.encrypted_token) {
                      alert("No Up Bank connection found. Connect in Settings first.");
                      return;
                    }

                    // Fetch accounts
                    const accountsRes = await fetch("https://api.up.com.au/api/v1/accounts", {
                      headers: { Authorization: `Bearer ${config.encrypted_token}` },
                    });
                    if (!accountsRes.ok) throw new Error("Failed to fetch accounts");
                    const { data: upAccounts } = await accountsRes.json();

                    // Sync each account's transactions
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

                      // Fetch recent transactions (last 7 days for quick sync)
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

                    alert(`Synced ${upAccounts.length} accounts (last 7 days)`);
                    window.location.reload();
                  } catch (error) {
                    console.error("Sync error:", error);
                    alert(`Sync failed: ${error instanceof Error ? error.message : "Unknown error"}`);
                  } finally {
                    setIsSyncing(false);
                  }
                }}
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

              <div className="border-t border-zinc-700 pt-2 mt-2">
                <div className="px-2 py-1 text-xs text-zinc-500">
                  Partnership: {partnershipId.slice(0, 8)}...
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
