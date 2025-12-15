import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/utils/supabase/server", () => ({
  createClient: vi.fn(),
}));

function createNotificationsMockSupabase(
  notifications: Record<string, unknown>[] = [],
  unreadCount: number = 0,
  userId: string | null = "user-1"
) {
  const notificationsChain: Record<string, ReturnType<typeof vi.fn>> = {};
  notificationsChain.select = vi.fn(() => notificationsChain);
  notificationsChain.eq = vi.fn(() => notificationsChain);
  notificationsChain.order = vi.fn(() => notificationsChain);
  notificationsChain.limit = vi.fn(() =>
    Promise.resolve({ data: notifications, error: null })
  );

  const countResult = { count: unreadCount, error: null };
  const countChain: Record<string, any> = {};
  countChain.select = vi.fn(() => countChain);
  countChain.eq = vi.fn(() => countChain);
  // Make chain thenable so await resolves after chained .eq().eq()
  countChain.then = (resolve: any, reject: any) =>
    Promise.resolve(countResult).then(resolve, reject);

  const updateChain: Record<string, ReturnType<typeof vi.fn>> = {};
  updateChain.update = vi.fn(() => updateChain);
  updateChain.eq = vi.fn(() => updateChain);
  updateChain.in = vi.fn(() => Promise.resolve({ error: null }));

  let fromCallIndex = 0;
  return {
    from: vi.fn((table: string) => {
      if (table === "notifications") {
        fromCallIndex++;
        // First call: fetch notifications, second call: count
        if (fromCallIndex <= 1) return notificationsChain;
        if (fromCallIndex === 2) return countChain;
        return updateChain;
      }
      return {};
    }),
    auth: {
      getUser: vi.fn(() =>
        Promise.resolve({
          data: { user: userId ? { id: userId } : null },
        })
      ),
    },
  };
}

describe("notifications API route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  describe("GET", () => {
    it("returns notifications for authenticated user", async () => {
      const notifications = [
        { id: "n-1", type: "goal_milestone", title: "Goal hit 50%", message: "test", read: false, actioned: false },
        { id: "n-2", type: "payment_reminder", title: "Rent due", message: "test", read: true, actioned: false },
      ];
      const mock = createNotificationsMockSupabase(notifications, 1, "user-1");

      const { createClient } = await import("@/utils/supabase/server");
      (createClient as any).mockResolvedValue(mock);

      const { GET } = await import("@/app/api/notifications/route");
      const req = new Request("http://localhost/api/notifications?limit=10");
      const res = await GET(req);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.notifications).toHaveLength(2);
    });

    it("returns 401 for unauthenticated request", async () => {
      const mock = createNotificationsMockSupabase([], 0, null);

      const { createClient } = await import("@/utils/supabase/server");
      (createClient as any).mockResolvedValue(mock);

      const { GET } = await import("@/app/api/notifications/route");
      const req = new Request("http://localhost/api/notifications");
      const res = await GET(req);

      expect(res.status).toBe(401);
    });
  });

  describe("PATCH", () => {
    it("returns 401 for unauthenticated request", async () => {
      const mock = createNotificationsMockSupabase([], 0, null);

      const { createClient } = await import("@/utils/supabase/server");
      (createClient as any).mockResolvedValue(mock);

      const { PATCH } = await import("@/app/api/notifications/route");
      const req = new Request("http://localhost/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mark_all_read: true }),
      });
      const res = await PATCH(req);

      expect(res.status).toBe(401);
    });
  });
});
