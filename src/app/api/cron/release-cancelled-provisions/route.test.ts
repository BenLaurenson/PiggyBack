/**
 * Tests for the release-cancelled-provisions cron.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    rows: [
      {
        id: "p-cancelled",
        state: "CANCELLED",
        vercel_project_id: "vproj-1",
        vercel_team_id: "team-1",
        subdomain_short_id: "abc123",
        subdomain_teardown_at: new Date(Date.now() - 86400_000).toISOString(),
        state_data: {},
        email: "u@x.io",
        display_name: "User",
      },
    ] as Array<Record<string, unknown>>,
    tokens: {
      encrypted_access_token: "enc:vtok",
    } as Record<string, unknown> | null,
    audit: vi.fn(async () => undefined),
    removeProjectDomain: vi.fn(async () => undefined),
    decryptVaultToken: vi.fn((s: string) => s.replace("enc:", "")),
    sendEmail: vi.fn(async () => ({ ok: true })),
    updateCalls: [] as Array<Record<string, unknown>>,
  },
}));

vi.mock("@/lib/provisioner/state-machine", () => ({
  audit: mocks.audit,
}));

vi.mock("@/lib/provisioner/vercel-api", () => ({
  removeProjectDomain: mocks.removeProjectDomain,
  VercelApiError: class extends Error {
    status: number;
    constructor(msg: string, status: number) {
      super(msg);
      this.status = status;
    }
  },
}));

vi.mock("@/lib/provisioner/token-vault", () => ({
  decryptVaultToken: mocks.decryptVaultToken,
}));

vi.mock("@/lib/email", () => ({
  sendEmail: mocks.sendEmail,
}));

vi.mock("@/lib/role-context", () => ({
  assertOrchestrator: () => undefined,
}));

vi.mock("@/utils/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => {
      if (table === "piggyback_provisions") {
        return {
          select: () => ({
            eq: () => ({
              or: async () => ({ data: mocks.rows, error: null }),
            }),
          }),
          update: (fields: Record<string, unknown>) => {
            mocks.updateCalls.push(fields);
            return { eq: async () => ({ error: null }) };
          },
        };
      }
      if (table === "provision_oauth_tokens") {
        return {
          select: () => ({
            eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mocks.tokens }) }) }),
          }),
        };
      }
      return {};
    },
  }),
}));

import { POST } from "./route";

describe("release-cancelled-provisions cron", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "test";
    process.env.NEXT_PUBLIC_HOSTED_ENABLED = "true";
    Object.values(mocks).forEach((v) => {
      if (typeof v === "function" && "mockReset" in v) {
        (v as ReturnType<typeof vi.fn>).mockReset();
      }
    });
    mocks.updateCalls.length = 0;
  });
  afterEach(() => {
    delete process.env.CRON_SECRET;
    delete process.env.NEXT_PUBLIC_HOSTED_ENABLED;
  });

  it("rejects unauthenticated requests", async () => {
    const req = new Request("https://x", { method: "POST" });
    const res = await POST(req as never);
    expect(res.status).toBe(401);
  });

  it("detaches domain + sends teardown email + flags row", async () => {
    mocks.removeProjectDomain.mockResolvedValue(undefined);
    mocks.sendEmail.mockResolvedValue({ ok: true });

    const req = new Request("https://x", {
      method: "POST",
      headers: { authorization: "Bearer test" },
    });
    const res = await POST(req as never);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.processed).toBe(1);
    expect(body.results[0].ok).toBe(true);
    expect(mocks.removeProjectDomain).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: "vtok" }),
      "vproj-1",
      "abc123.piggyback.finance"
    );
    expect(mocks.sendEmail).toHaveBeenCalled();
    expect(mocks.updateCalls[0]).toMatchObject({
      state_data: expect.objectContaining({ domain_released: true }),
    });
  });

  it("skips already-released provisions", async () => {
    mocks.rows[0].state_data = { domain_released: true };
    const req = new Request("https://x", {
      method: "POST",
      headers: { authorization: "Bearer test" },
    });
    const res = await POST(req as never);
    const body = await res.json();
    expect(body.results[0].skipped).toBe("already_released");
    expect(mocks.removeProjectDomain).not.toHaveBeenCalled();
    // restore
    mocks.rows[0].state_data = {};
  });
});
