import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/utils/supabase/server", () => ({
  createClient: vi.fn(),
}));

function createActionMockSupabase(
  notification: Record<string, unknown> | null = null,
  userId: string | null = "user-1"
) {
  const notificationChain: Record<string, ReturnType<typeof vi.fn>> = {};
  notificationChain.select = vi.fn(() => notificationChain);
  // Track eq filter values to simulate user_id filtering
  const eqFilters: [string, unknown][] = [];
  notificationChain.eq = vi.fn((col: string, val: unknown) => {
    eqFilters.push([col, val]);
    return notificationChain;
  });
  notificationChain.single = vi.fn(() => {
    // Simulate Supabase user_id filtering — returns null if user_id doesn't match
    const userIdFilter = eqFilters.find(([col]) => col === "user_id");
    if (notification && userIdFilter && notification.user_id !== userIdFilter[1]) {
      return Promise.resolve({ data: null, error: { message: "Not found" } });
    }
    return Promise.resolve({ data: notification, error: notification ? null : { message: "Not found" } });
  });

  const updateChain: Record<string, ReturnType<typeof vi.fn>> = {};
  updateChain.update = vi.fn(() => updateChain);
  updateChain.eq = vi.fn(() => Promise.resolve({ error: null }));

  const upsertChain: Record<string, ReturnType<typeof vi.fn>> = {};
  upsertChain.upsert = vi.fn(() => Promise.resolve({ error: null }));

  // Track partnership membership check
  const memberChain: Record<string, ReturnType<typeof vi.fn>> = {};
  memberChain.select = vi.fn(() => memberChain);
  memberChain.eq = vi.fn(() => memberChain);
  memberChain.maybeSingle = vi.fn(() =>
    Promise.resolve({
      data: { partnership_id: "partnership-1" },
      error: null,
    })
  );

  return {
    from: vi.fn((table: string) => {
      if (table === "notifications") {
        return {
          select: notificationChain.select,
          update: updateChain.update,
        };
      }
      if (table === "expense_definitions") {
        return { update: updateChain.update };
      }
      if (table === "expense_matches") {
        return { upsert: upsertChain.upsert };
      }
      if (table === "partnership_members") {
        return memberChain;
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

describe("notifications/[id]/action route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns 401 for unauthenticated request", async () => {
    const mock = createActionMockSupabase(null, null);

    const { createClient } = await import("@/utils/supabase/server");
    (createClient as any).mockResolvedValue(mock);

    const { POST } = await import("@/app/api/notifications/[id]/action/route");
    const req = new Request("http://localhost/api/notifications/n-1/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "dismiss" }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: "n-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid action type", async () => {
    const notification = {
      id: "n-1",
      user_id: "user-1",
      type: "subscription_price_change",
      metadata: {},
    };
    const mock = createActionMockSupabase(notification);

    const { createClient } = await import("@/utils/supabase/server");
    (createClient as any).mockResolvedValue(mock);

    const { POST } = await import("@/app/api/notifications/[id]/action/route");
    const req = new Request("http://localhost/api/notifications/n-1/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "invalid_action" }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: "n-1" }) });
    expect(res.status).toBe(400);
  });

  it("dismiss marks notification as actioned", async () => {
    const notification = {
      id: "n-1",
      user_id: "user-1",
      type: "subscription_price_change",
      metadata: { expense_id: "exp-1" },
    };
    const mock = createActionMockSupabase(notification);

    const { createClient } = await import("@/utils/supabase/server");
    (createClient as any).mockResolvedValue(mock);

    const { POST } = await import("@/app/api/notifications/[id]/action/route");
    const req = new Request("http://localhost/api/notifications/n-1/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "dismiss" }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: "n-1" }) });
    expect(res.status).toBe(200);
  });

  it("returns 404 for notification belonging to another user", async () => {
    const notification = {
      id: "n-1",
      user_id: "other-user", // Different user
      type: "subscription_price_change",
      metadata: {},
    };
    const mock = createActionMockSupabase(notification, "user-1");

    const { createClient } = await import("@/utils/supabase/server");
    (createClient as any).mockResolvedValue(mock);

    const { POST } = await import("@/app/api/notifications/[id]/action/route");
    const req = new Request("http://localhost/api/notifications/n-1/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "dismiss" }),
    });

    // Route uses .eq("user_id", user.id) filter — returns 404, not 403
    const res = await POST(req, { params: Promise.resolve({ id: "n-1" }) });
    expect(res.status).toBe(404);
  });
});
