/**
 * Unit tests for the Supabase Mgmt API wrapper.
 *
 * We mock the global fetch + the resource-usage counter so the tests don't
 * touch the network or the dev DB.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../resource-usage", () => ({
  incrementResourceUsage: vi.fn(async () => undefined),
  getDailyUsage: vi.fn(async () => 0),
}));

import * as resourceUsage from "../resource-usage";
import {
  applyMigration,
  createProject,
  getProject,
  getProjectKeys,
  pollProjectStatus,
} from "../supabase-mgmt";

const auth = { accessToken: "test-token" };

describe("supabase-mgmt", () => {
  const fetchSpy = vi.fn();

  beforeEach(() => {
    delete process.env.PROVISIONER_DRY_RUN;
    fetchSpy.mockReset();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("createProject sends Idempotency-Key header when provided", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({
        id: "p1",
        ref: "abc123",
        name: "test",
        region: "ap-southeast-2",
        status: "COMING_UP",
        created_at: "2026-05-01T00:00:00Z",
      }),
    });

    const project = await createProject(auth, {
      organizationId: "org",
      name: "test",
      dbPass: "pass",
      idempotencyKey: "provision-x-supabase-create",
    });

    expect(project.ref).toBe("abc123");
    const callArgs = fetchSpy.mock.calls[0];
    expect(callArgs?.[0]).toContain("/v1/projects");
    const headers = (callArgs?.[1] as RequestInit).headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBe("provision-x-supabase-create");
    expect(resourceUsage.incrementResourceUsage).toHaveBeenCalledWith("supabase_mgmt");
  });

  it("getProjectKeys returns both anon and service_role keys", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [
        { name: "anon", api_key: "anon-key" },
        { name: "service_role", api_key: "sr-key" },
      ],
    });

    const keys = await getProjectKeys(auth, "abc123");
    expect(keys.anonKey).toBe("anon-key");
    expect(keys.serviceRoleKey).toBe("sr-key");
    expect(keys.url).toBe("https://abc123.supabase.co");
  });

  it("getProjectKeys throws when the response is missing keys", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [{ name: "anon", api_key: "anon-key" }],
    });

    await expect(getProjectKeys(auth, "abc123")).rejects.toThrow(
      /both anon and service_role keys/
    );
  });

  it("applyMigration POSTs to /database/migrations with idempotency", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({}),
    });

    await applyMigration(auth, "abc123", "SELECT 1;", "001_init.sql");

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect((init.body as string)).toContain("001_init.sql");
    const headers = init.headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBe("migration-abc123-001_init.sql");
  });

  it("dry-run mode short-circuits applyMigration without calling fetch", async () => {
    process.env.PROVISIONER_DRY_RUN = "true";
    await applyMigration(auth, "abc123", "SELECT 1;", "001_init.sql");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("dry-run mode fakes createProject", async () => {
    process.env.PROVISIONER_DRY_RUN = "true";
    const project = await createProject(auth, {
      organizationId: "org",
      name: "test",
      dbPass: "pass",
    });
    expect(project.ref).toBe("dryxxxxxxxxxxxxxxxxx");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("dry-run pollProjectStatus returns ACTIVE_HEALTHY without polling", async () => {
    process.env.PROVISIONER_DRY_RUN = "true";
    const status = await pollProjectStatus(auth, "abc123");
    expect(status).toBe("ACTIVE_HEALTHY");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("getProject in dry-run returns ACTIVE_HEALTHY synthetic", async () => {
    process.env.PROVISIONER_DRY_RUN = "true";
    const project = await getProject(auth, "abc123");
    expect(project.status).toBe("ACTIVE_HEALTHY");
  });

  it("non-2xx response throws SupabaseMgmtError", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ message: "unauthorized" }),
      text: async () => "unauthorized",
    });

    await expect(getProject(auth, "abc123")).rejects.toThrow(
      /Supabase Management API 401/
    );
  });
});
