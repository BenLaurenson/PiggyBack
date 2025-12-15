"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Bell,
  ArrowUpDown,
  X,
  Check,
  Loader2,
  ChevronRight,
  Trophy,
  CalendarClock,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { goeyToast as toast } from "goey-toast";
import { motion, AnimatePresence } from "framer-motion";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  metadata: Record<string, unknown>;
  read: boolean;
  actioned: boolean;
  created_at: string;
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(cents / 100);
}

export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [clearingIds, setClearingIds] = useState<Set<string>>(new Set());
  const router = useRouter();

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?limit=10");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications);
        setUnreadCount(data.unread_count);
      }
    } catch {
      // Silently fail — will retry on next interval
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Mark notifications as read when sheet opens
  useEffect(() => {
    if (open && unreadCount > 0) {
      const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
      if (unreadIds.length > 0) {
        fetch("/api/notifications", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notification_ids: unreadIds }),
        }).then(() => {
          setUnreadCount(0);
          setNotifications((prev) =>
            prev.map((n) => ({ ...n, read: true }))
          );
        });
      }
    }
    // Only fire on open change, not on every notification update
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleAction = async (
    notificationId: string,
    action: "update_amount" | "dismiss"
  ) => {
    setActioningId(notificationId);
    try {
      const res = await fetch(`/api/notifications/${notificationId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      if (res.ok) {
        // Mark as clearing — show "done" state before removing
        setClearingIds((prev) => new Set(prev).add(notificationId));

        if (action === "update_amount") {
          toast.success("Subscription amount updated and transaction linked");
        } else {
          toast.success("Notification dismissed");
        }

        // Wait for the clearing animation to show, then refresh
        setTimeout(async () => {
          setClearingIds((prev) => {
            const next = new Set(prev);
            next.delete(notificationId);
            return next;
          });
          await fetchNotifications();
          router.refresh();
        }, 1200);
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to perform action");
      }
    } catch {
      toast.error("Something went wrong");
    } finally {
      setActioningId(null);
    }
  };

  const activeNotifications = notifications.filter(
    (n) => !n.actioned && !clearingIds.has(n.id)
  );
  const clearedNotifications = notifications.filter(
    (n) => n.actioned || clearingIds.has(n.id)
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          className="relative p-2 rounded-full transition-colors hover:bg-[var(--muted)]"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" style={{ color: "var(--text-secondary)" }} />
          {unreadCount > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-0.5 rounded-full text-white text-[10px] font-bold flex items-center justify-center"
              style={{ backgroundColor: "var(--pastel-coral-dark)" }}
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </SheetTrigger>
      <SheetContent side="right" showCloseButton={false} className="!w-[85vw] sm:!max-w-md p-0 flex flex-col">
        {/* Header */}
        <SheetHeader className="p-4 pb-3 border-b" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between">
            <div>
              <SheetTitle
                className="font-[family-name:var(--font-nunito)] text-lg font-bold"
                style={{ color: "var(--text-primary)" }}
              >
                Notifications
              </SheetTitle>
              <SheetDescription
                className="font-[family-name:var(--font-dm-sans)] text-xs"
                style={{ color: "var(--text-tertiary)" }}
              >
                {activeNotifications.length > 0
                  ? `${activeNotifications.length} notification${activeNotifications.length !== 1 ? "s" : ""} need${activeNotifications.length === 1 ? "s" : ""} attention`
                  : "All caught up"}
              </SheetDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full -mr-2"
              onClick={() => setOpen(false)}
            >
              <X className="h-4 w-4" style={{ color: "var(--text-tertiary)" }} />
            </Button>
          </div>
        </SheetHeader>

        {/* Notification list */}
        <div className="flex-1 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-6">
              <div
                className="p-4 rounded-full mb-4"
                style={{ backgroundColor: "var(--pastel-mint-light)" }}
              >
                <Bell
                  className="h-8 w-8"
                  style={{ color: "var(--pastel-mint-dark)" }}
                />
              </div>
              <p
                className="font-[family-name:var(--font-nunito)] text-base font-bold"
                style={{ color: "var(--text-primary)" }}
              >
                No notifications
              </p>
            </div>
          ) : (
            <div>
              {/* Active notifications */}
              <AnimatePresence mode="popLayout">
                {activeNotifications.map((notification) => (
                  <motion.div
                    key={notification.id}
                    layout
                    initial={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                  >
                    <NotificationItem
                      notification={notification}
                      onAction={handleAction}
                      isActioning={actioningId === notification.id}
                      isClearing={clearingIds.has(notification.id)}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>

              {/* Cleared notifications */}
              {clearedNotifications.length > 0 && (
                <>
                  {activeNotifications.length > 0 && (
                    <div
                      className="px-4 py-2 border-t"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <p
                        className="font-[family-name:var(--font-dm-sans)] text-[10px] uppercase tracking-wider font-semibold"
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        Cleared
                      </p>
                    </div>
                  )}
                  {clearedNotifications.map((notification) => (
                    <NotificationItem
                      key={notification.id}
                      notification={{ ...notification, actioned: true }}
                      onAction={handleAction}
                      isActioning={false}
                      isClearing={clearingIds.has(notification.id)}
                    />
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {notifications.length > 0 && (
          <div
            className="p-3 border-t"
            style={{ borderColor: "var(--border)" }}
          >
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="flex items-center justify-center gap-1 py-2 rounded-lg transition-colors hover:bg-[var(--muted)]"
            >
              <span
                className="font-[family-name:var(--font-dm-sans)] text-xs font-medium"
                style={{ color: "var(--pastel-blue-dark)" }}
              >
                View all notifications
              </span>
              <ChevronRight
                className="h-3.5 w-3.5"
                style={{ color: "var(--pastel-blue-dark)" }}
              />
            </Link>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function NotificationItem({
  notification,
  onAction,
  isActioning,
  isClearing,
}: {
  notification: Notification;
  onAction: (id: string, action: "update_amount" | "dismiss") => void;
  isActioning: boolean;
  isClearing: boolean;
}) {
  const metadata = notification.metadata as {
    old_amount_cents?: number;
    new_amount_cents?: number;
    expense_name?: string;
  };

  const isPriceChange = notification.type === "subscription_price_change";

  const typeConfig: Record<string, { bg: string; icon: React.ReactNode; color: string }> = {
    subscription_price_change: {
      bg: "var(--pastel-yellow-light)",
      color: "var(--pastel-yellow-dark)",
      icon: <ArrowUpDown className="h-3.5 w-3.5" style={{ color: "var(--pastel-yellow-dark)" }} />,
    },
    goal_milestone: {
      bg: "var(--pastel-mint-light)",
      color: "var(--pastel-mint-dark)",
      icon: <Trophy className="h-3.5 w-3.5" style={{ color: "var(--pastel-mint-dark)" }} />,
    },
    payment_reminder: {
      bg: "var(--pastel-coral-light)",
      color: "var(--pastel-coral-dark)",
      icon: <CalendarClock className="h-3.5 w-3.5" style={{ color: "var(--pastel-coral-dark)" }} />,
    },
    weekly_summary: {
      bg: "var(--pastel-lavender-light)",
      color: "var(--pastel-lavender-dark)",
      icon: <Sparkles className="h-3.5 w-3.5" style={{ color: "var(--pastel-lavender-dark)" }} />,
    },
  };

  const config = typeConfig[notification.type] || typeConfig.subscription_price_change;

  return (
    <div
      className="px-4 py-3 border-b transition-all duration-300"
      style={{
        borderColor: "var(--border)",
        backgroundColor: isClearing
          ? "var(--pastel-mint-light)"
          : notification.actioned
            ? "transparent"
            : "var(--background)",
        opacity: notification.actioned && !isClearing ? 0.6 : 1,
      }}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div
          className="mt-0.5 p-2 rounded-full flex-shrink-0 transition-colors duration-300"
          style={{
            backgroundColor: isClearing
              ? "var(--pastel-mint)"
              : notification.actioned
                ? "var(--muted)"
                : config.bg,
          }}
        >
          {isClearing ? (
            <Check
              className="h-3.5 w-3.5"
              style={{ color: "white" }}
            />
          ) : notification.actioned ? (
            <Check
              className="h-3.5 w-3.5"
              style={{ color: "var(--text-tertiary)" }}
            />
          ) : (
            config.icon
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p
              className="font-[family-name:var(--font-dm-sans)] text-sm font-semibold leading-tight"
              style={{ color: "var(--text-primary)" }}
            >
              {notification.title}
            </p>
            <span
              className="font-[family-name:var(--font-dm-sans)] text-[10px] flex-shrink-0"
              style={{ color: "var(--text-tertiary)" }}
            >
              {formatRelativeTime(notification.created_at)}
            </span>
          </div>

          {/* Price change details */}
          {isPriceChange &&
          metadata.old_amount_cents &&
          metadata.new_amount_cents ? (
            <div className="mt-1.5 flex items-center gap-2 flex-wrap">
              <span
                className="font-[family-name:var(--font-dm-sans)] text-xs line-through"
                style={{ color: "var(--text-tertiary)" }}
              >
                {formatCents(metadata.old_amount_cents)}
              </span>
              <span style={{ color: "var(--text-tertiary)" }}>→</span>
              <span
                className="font-[family-name:var(--font-dm-sans)] text-xs font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                {formatCents(metadata.new_amount_cents)}
              </span>
              {metadata.new_amount_cents < metadata.old_amount_cents ? (
                <span
                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                  style={{
                    backgroundColor: "var(--pastel-mint-light)",
                    color: "var(--pastel-mint-dark)",
                  }}
                >
                  {Math.round(
                    ((metadata.old_amount_cents - metadata.new_amount_cents) /
                      metadata.old_amount_cents) *
                      100
                  )}
                  % less
                </span>
              ) : (
                <span
                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                  style={{
                    backgroundColor: "var(--pastel-coral-light)",
                    color: "var(--pastel-coral-dark)",
                  }}
                >
                  {Math.round(
                    ((metadata.new_amount_cents - metadata.old_amount_cents) /
                      metadata.old_amount_cents) *
                      100
                  )}
                  % more
                </span>
              )}
            </div>
          ) : (
            <p
              className="font-[family-name:var(--font-dm-sans)] text-xs mt-1"
              style={{ color: "var(--text-secondary)" }}
            >
              {notification.message}
            </p>
          )}

          {/* Action buttons — only for unactioned, non-clearing notifications */}
          {!notification.actioned && !isClearing && isPriceChange && (
            <div className="flex flex-wrap gap-2 mt-3">
              <Button
                size="sm"
                className="h-8 px-3 text-xs font-semibold rounded-lg"
                style={{
                  backgroundColor: "var(--pastel-mint)",
                  color: "var(--pastel-mint-dark)",
                }}
                disabled={isActioning}
                onClick={(e) => {
                  e.stopPropagation();
                  onAction(notification.id, "update_amount");
                }}
              >
                {isActioning ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <>
                    <Check className="h-3.5 w-3.5 mr-1" />
                    Update Amount
                  </>
                )}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-3 text-xs rounded-lg"
                style={{
                  color: "var(--text-tertiary)",
                  borderColor: "var(--border)",
                }}
                disabled={isActioning}
                onClick={(e) => {
                  e.stopPropagation();
                  onAction(notification.id, "dismiss");
                }}
              >
                <X className="h-3.5 w-3.5 mr-1" />
                Dismiss
              </Button>
            </div>
          )}

          {/* Clearing state */}
          {isClearing && (
            <p
              className="font-[family-name:var(--font-dm-sans)] text-xs mt-2 font-medium"
              style={{ color: "var(--pastel-mint-dark)" }}
            >
              Done
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
