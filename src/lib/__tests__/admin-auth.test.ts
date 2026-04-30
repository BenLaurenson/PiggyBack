import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Tests for the admin allow-list helpers.
 *
 * Covers both the synchronous `isAdminEmail` (used when caller already
 * has the email in hand) and the async `isCurrentUserAdmin` (used when
 * caller needs to resolve the user via Supabase).
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

describe("admin-auth — isAdminEmail (sync)", () => {
  const originalEnv = process.env.ADMIN_EMAILS;

  beforeEach(() => {
    delete process.env.ADMIN_EMAILS;
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = originalEnv;
  });

  it("returns false when ADMIN_EMAILS is unset", async () => {
    const { isAdminEmail } = await import("../admin-auth");
    expect(isAdminEmail("ben@example.com")).toBe(false);
  });

  it("matches case-insensitively", async () => {
    process.env.ADMIN_EMAILS = "Ben@Example.com,co@co.com";
    const { isAdminEmail } = await import("../admin-auth");
    expect(isAdminEmail("ben@example.com")).toBe(true);
    expect(isAdminEmail("CO@CO.COM")).toBe(true);
  });

  it("returns false for null/undefined", async () => {
    process.env.ADMIN_EMAILS = "ben@example.com";
    const { isAdminEmail } = await import("../admin-auth");
    expect(isAdminEmail(null)).toBe(false);
    expect(isAdminEmail(undefined)).toBe(false);
  });

  it("ignores whitespace and empty entries", async () => {
    process.env.ADMIN_EMAILS = " a@a.com , , b@b.com ";
    const { isAdminEmail } = await import("../admin-auth");
    expect(isAdminEmail("a@a.com")).toBe(true);
    expect(isAdminEmail("b@b.com")).toBe(true);
    expect(isAdminEmail("c@c.com")).toBe(false);
  });
});

describe("admin-auth — isCurrentUserAdmin (async)", () => {
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
