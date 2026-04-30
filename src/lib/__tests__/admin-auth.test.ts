import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Tests for the admin allow-list helper.
 */

vi.mock("@/utils/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/utils/supabase/server";

const mockedCreateClient = vi.mocked(createClient);

function buildSupabaseMock(user: { id: string; email: string } | null) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
    },
  };
}

describe("admin-auth", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns isAdmin=false when ADMIN_EMAILS is unset", async () => {
    vi.stubEnv("ADMIN_EMAILS", "");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedCreateClient.mockResolvedValueOnce(buildSupabaseMock({ id: "u1", email: "a@b.com" }) as any);

    const { isCurrentUserAdmin } = await import("@/lib/admin-auth");
    const res = await isCurrentUserAdmin();
    expect(res.isAdmin).toBe(false);
    expect(res.email).toBe("a@b.com");
    expect(res.userId).toBe("u1");
  });

  it("returns isAdmin=false when no user is signed in", async () => {
    vi.stubEnv("ADMIN_EMAILS", "a@b.com");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedCreateClient.mockResolvedValueOnce(buildSupabaseMock(null) as any);

    const { isCurrentUserAdmin } = await import("@/lib/admin-auth");
    const res = await isCurrentUserAdmin();
    expect(res.isAdmin).toBe(false);
    expect(res.email).toBeNull();
    expect(res.userId).toBeNull();
  });

  it("returns isAdmin=true when user email is in the allow-list", async () => {
    vi.stubEnv("ADMIN_EMAILS", "  Admin@Example.com , other@example.com  ");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedCreateClient.mockResolvedValueOnce(
      buildSupabaseMock({ id: "u1", email: "admin@example.com" }) as any
    );

    const { isCurrentUserAdmin } = await import("@/lib/admin-auth");
    const res = await isCurrentUserAdmin();
    expect(res.isAdmin).toBe(true);
  });

  it("treats emails case-insensitively in both directions", async () => {
    vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedCreateClient.mockResolvedValueOnce(
      buildSupabaseMock({ id: "u1", email: "ADMIN@example.com" }) as any
    );

    const { isCurrentUserAdmin } = await import("@/lib/admin-auth");
    const res = await isCurrentUserAdmin();
    expect(res.isAdmin).toBe(true);
  });

  it("returns isAdmin=false when supabase throws", async () => {
    vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
    mockedCreateClient.mockRejectedValueOnce(new Error("boom"));

    const { isCurrentUserAdmin } = await import("@/lib/admin-auth");
    const res = await isCurrentUserAdmin();
    expect(res.isAdmin).toBe(false);
  });

  it("getConfiguredAdminEmails parses commas and lowercases", async () => {
    vi.stubEnv("ADMIN_EMAILS", "Foo@bar.com, Baz@QUX.com");
    const { getConfiguredAdminEmails } = await import("@/lib/admin-auth");
    expect(getConfiguredAdminEmails()).toEqual(["foo@bar.com", "baz@qux.com"]);
  });
});
