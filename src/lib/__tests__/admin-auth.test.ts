import { describe, it, expect, beforeEach, afterEach } from "vitest";

describe("admin-auth", () => {
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
