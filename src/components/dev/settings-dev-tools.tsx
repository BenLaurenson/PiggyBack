"use client";

import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Bug, X, GripVertical, Loader2, Bell, CloudDownload, Zap, ZapOff, Calculator, History } from "lucide-react";
import { Button } from "@/components/ui/button";
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

  // Only render in development
  if (process.env.NODE_ENV !== "development") return null;

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
      const res = await fetch("/api/upbank/sync", { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Sync failed" }));
        throw new Error(err.error || "Sync failed");
      }

      // Read the NDJSON stream for the final result
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let lastMessage = "Sync complete";

      if (reader) {
        let done = false;
        while (!done) {
          const { value, done: streamDone } = await reader.read();
          done = streamDone;
          if (value) {
            const lines = decoder.decode(value, { stream: true }).split("\n").filter(Boolean);
            for (const line of lines) {
              try {
                const data = JSON.parse(line);
                if (data.message) lastMessage = data.message;
                if (data.phase === "error") throw new Error(data.message);
              } catch (e) {
                if (e instanceof Error && e.message !== line) throw e;
              }
            }
          }
        }
      }

      setMessage(lastMessage);
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
