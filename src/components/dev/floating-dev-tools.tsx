"use client";

import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Bug, X, GripVertical, Trash2, Loader2, CloudDownload } from "lucide-react";
import { Button } from "@/components/ui/button";
interface FloatingDevToolsProps {
  onClearLocalStorage: () => void;
}

export function FloatingDevTools({
  onClearLocalStorage,
}: FloatingDevToolsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const constraintsRef = useRef<HTMLDivElement>(null);

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

  // Only render in development
  if (process.env.NODE_ENV !== "development") return null;

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

                    alert(lastMessage);
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

              {/* L163: Partnership UUID removed from client-side display to avoid
                 exposing sensitive IDs readable by any script on the page. */}
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
