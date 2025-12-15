"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Bell,
  ArrowUpDown,
  Check,
  X,
  Loader2,
  CheckCheck,
  Trophy,
  CalendarClock,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(cents / 100);
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [clearingIds, setClearingIds] = useState<Set<string>>(new Set());
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const router = useRouter();

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?limit=50");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications);
        setUnreadCount(data.unread_count);
      }
    } catch {
      toast.error("Failed to load notifications");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleMarkAllRead = async () => {
    setMarkingAllRead(true);
    try {
      const res = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mark_all_read: true }),
      });
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
        setUnreadCount(0);
        toast.success("All notifications marked as read");
      }
    } catch {
      toast.error("Failed to mark all as read");
    } finally {
      setMarkingAllRead(false);
    }
  };

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
        // Show "cleared" state before moving to cleared section
        setClearingIds((prev) => new Set(prev).add(notificationId));

        if (action === "update_amount") {
          toast.success("Subscription amount updated and transaction linked");
        } else {
          toast.success("Notification dismissed");
        }

        // Wait for visual feedback, then refresh
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
    <div className="max-w-2xl mx-auto px-4 py-6 md:py-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1
            className="font-[family-name:var(--font-nunito)] text-2xl font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            Notifications
          </h1>
          <p
            className="font-[family-name:var(--font-dm-sans)] text-sm mt-1"
            style={{ color: "var(--text-secondary)" }}
          >
            {loading
              ? "Loading..."
              : activeNotifications.length > 0
                ? `${activeNotifications.length} notification${activeNotifications.length !== 1 ? "s" : ""} need${activeNotifications.length === 1 ? "s" : ""} attention`
                : "All caught up"}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleMarkAllRead}
            disabled={markingAllRead}
            className="text-xs"
            style={{ color: "var(--pastel-blue-dark)" }}
          >
            {markingAllRead ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
            ) : (
              <CheckCheck className="h-3.5 w-3.5 mr-1" />
            )}
            Mark all read
          </Button>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2
            className="h-6 w-6 animate-spin"
            style={{ color: "var(--text-tertiary)" }}
          />
        </div>
      ) : notifications.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
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
              className="font-[family-name:var(--font-nunito)] text-lg font-bold"
              style={{ color: "var(--text-primary)" }}
            >
              No notifications yet
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Active notifications */}
          {activeNotifications.length > 0 && (
            <div>
              <p
                className="font-[family-name:var(--font-dm-sans)] text-xs uppercase tracking-wider font-semibold mb-3"
                style={{ color: "var(--text-tertiary)" }}
              >
                Needs attention
              </p>
              <div className="space-y-2">
                <AnimatePresence mode="popLayout">
                  {activeNotifications.map((notification) => (
                    <motion.div
                      key={notification.id}
                      layout
                      initial={{ opacity: 1 }}
                      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                      transition={{ duration: 0.3, ease: "easeInOut" }}
                    >
                      <NotificationCard
                        notification={notification}
                        onAction={handleAction}
                        isActioning={actioningId === notification.id}
                        isClearing={clearingIds.has(notification.id)}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          )}

          {/* Cleared notifications */}
          {clearedNotifications.length > 0 && (
            <div>
              <p
                className="font-[family-name:var(--font-dm-sans)] text-xs uppercase tracking-wider font-semibold mb-3"
                style={{ color: "var(--text-tertiary)" }}
              >
                Cleared
              </p>
              <div className="space-y-2">
                {clearedNotifications.map((notification) => (
                  <NotificationCard
                    key={notification.id}
                    notification={{ ...notification, actioned: true }}
                    onAction={handleAction}
                    isActioning={false}
                    isClearing={clearingIds.has(notification.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NotificationCard({
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
    merchant_name?: string;
  };

  const isPriceChange = notification.type === "subscription_price_change";

  const typeConfig: Record<string, { bg: string; icon: React.ReactNode }> = {
    subscription_price_change: {
      bg: "var(--pastel-yellow-light)",
      icon: <ArrowUpDown className="h-4 w-4" style={{ color: "var(--pastel-yellow-dark)" }} />,
    },
    goal_milestone: {
      bg: "var(--pastel-mint-light)",
      icon: <Trophy className="h-4 w-4" style={{ color: "var(--pastel-mint-dark)" }} />,
    },
    payment_reminder: {
      bg: "var(--pastel-coral-light)",
      icon: <CalendarClock className="h-4 w-4" style={{ color: "var(--pastel-coral-dark)" }} />,
    },
    weekly_summary: {
      bg: "var(--pastel-lavender-light)",
      icon: <Sparkles className="h-4 w-4" style={{ color: "var(--pastel-lavender-dark)" }} />,
    },
  };

  const config = typeConfig[notification.type] || typeConfig.subscription_price_change;

  return (
    <Card
      className="transition-all duration-300 overflow-hidden"
      style={{
        backgroundColor: isClearing
          ? "var(--pastel-mint-light)"
          : notification.actioned
            ? "var(--background)"
            : "var(--background)",
        borderColor: "var(--border)",
        opacity: notification.actioned && !isClearing ? 0.6 : 1,
      }}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div
            className="p-2.5 rounded-full flex-shrink-0 transition-colors duration-300"
            style={{
              backgroundColor: isClearing
                ? "var(--pastel-mint)"
                : notification.actioned
                  ? "var(--muted)"
                  : config.bg,
            }}
          >
            {isClearing ? (
              <Check className="h-4 w-4" style={{ color: "white" }} />
            ) : notification.actioned ? (
              <Check
                className="h-4 w-4"
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
                className="font-[family-name:var(--font-dm-sans)] text-sm font-semibold"
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

            {isPriceChange &&
            metadata.old_amount_cents &&
            metadata.new_amount_cents ? (
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <span
                  className="font-[family-name:var(--font-dm-sans)] text-sm line-through"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  {formatCents(metadata.old_amount_cents)}
                </span>
                <span style={{ color: "var(--text-tertiary)" }}>→</span>
                <span
                  className="font-[family-name:var(--font-dm-sans)] text-sm font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  {formatCents(metadata.new_amount_cents)}
                </span>
                {metadata.new_amount_cents < metadata.old_amount_cents ? (
                  <span
                    className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                    style={{
                      backgroundColor: "var(--pastel-mint-light)",
                      color: "var(--pastel-mint-dark)",
                    }}
                  >
                    {Math.round(
                      ((metadata.old_amount_cents -
                        metadata.new_amount_cents) /
                        metadata.old_amount_cents) *
                        100
                    )}
                    % less
                  </span>
                ) : (
                  <span
                    className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                    style={{
                      backgroundColor: "var(--pastel-coral-light)",
                      color: "var(--pastel-coral-dark)",
                    }}
                  >
                    {Math.round(
                      ((metadata.new_amount_cents -
                        metadata.old_amount_cents) /
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

            {/* Action buttons */}
            {!notification.actioned && !isClearing && isPriceChange && (
              <div className="flex flex-wrap gap-2 mt-3">
                <Button
                  size="sm"
                  className="h-8 px-4 text-xs font-semibold rounded-lg"
                  style={{
                    backgroundColor: "var(--pastel-mint)",
                    color: "var(--pastel-mint-dark)",
                  }}
                  disabled={isActioning}
                  onClick={() => onAction(notification.id, "update_amount")}
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
                  className="h-8 px-4 text-xs rounded-lg"
                  style={{
                    color: "var(--text-tertiary)",
                    borderColor: "var(--border)",
                  }}
                  disabled={isActioning}
                  onClick={() => onAction(notification.id, "dismiss")}
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
      </CardContent>
    </Card>
  );
}
