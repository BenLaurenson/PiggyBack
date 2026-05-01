import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "node:crypto";

const TEST_SECRET = "test-secret-32-chars-aaaaaaaaaaaa";

function sign(body: string, emittedAt: string, secret = TEST_SECRET): string {
  return createHmac("sha256", secret).update(`${emittedAt}.${body}`).digest("hex");
}

function makeReq(args: {
  body: string;
  signature?: string | null;
  emittedAt?: string | null;
}): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (args.signature !== null && args.signature !== undefined) {
    headers.set("x-piggyback-signature", args.signature);
  }
  if (args.emittedAt !== null && args.emittedAt !== undefined) {
    headers.set("x-piggyback-emitted-at", args.emittedAt);
  }
  return new Request("https://tenant.example/api/webhooks/partner-mirror", {
    method: "POST",
    headers,
    body: args.body,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ORCHESTRATOR_WEBHOOK_SECRET", TEST_SECRET);
});

describe("POST /api/webhooks/partner-mirror", () => {
  it("503s when secret is missing", async () => {
    vi.stubEnv("ORCHESTRATOR_WEBHOOK_SECRET", "");
    const emittedAt = new Date().toISOString();
    const body = JSON.stringify({ event: "link_created" });
    const { POST } = await import("@/app/api/webhooks/partner-mirror/route");
    const res = await POST(
      makeReq({ body, signature: sign(body, emittedAt), emittedAt })
    );
    expect(res.status).toBe(503);
  });

  it("400s when signature header missing", async () => {
    const emittedAt = new Date().toISOString();
    const body = JSON.stringify({ event: "link_created" });
    const { POST } = await import("@/app/api/webhooks/partner-mirror/route");
    const res = await POST(makeReq({ body, signature: null, emittedAt }));
    expect(res.status).toBe(400);
  });

  it("400s when emitted-at header missing", async () => {
    const body = JSON.stringify({ event: "link_created" });
    const { POST } = await import("@/app/api/webhooks/partner-mirror/route");
    const res = await POST(makeReq({ body, signature: "sig", emittedAt: null }));
    expect(res.status).toBe(400);
  });

  it("401s when signature is wrong", async () => {
    const emittedAt = new Date().toISOString();
    const body = JSON.stringify({ event: "link_created" });
    const { POST } = await import("@/app/api/webhooks/partner-mirror/route");
    const res = await POST(
      makeReq({ body, signature: "0".repeat(64), emittedAt })
    );
    expect(res.status).toBe(401);
  });

  it("400s on invalid JSON", async () => {
    const emittedAt = new Date().toISOString();
    const body = "not-json";
    const { POST } = await import("@/app/api/webhooks/partner-mirror/route");
    const res = await POST(
      makeReq({ body, signature: sign(body, emittedAt), emittedAt })
    );
    expect(res.status).toBe(400);
  });

  it("410s on stale emitted_at (> 5min skew)", async () => {
    const emittedAt = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    const body = JSON.stringify({
      event: "link_created",
      partner_link_id: "x",
      recipient_provision_id: "r",
      remote_provision_id: "rem",
      remote_display_name: null,
      remote_email: null,
      invited_by_partnership_id: null,
      emitted_at: emittedAt,
    });
    const { POST } = await import("@/app/api/webhooks/partner-mirror/route");
    const res = await POST(
      makeReq({ body, signature: sign(body, emittedAt), emittedAt })
    );
    expect(res.status).toBe(410);
  });

  it("200s on valid signed payload", async () => {
    const emittedAt = new Date().toISOString();
    const body = JSON.stringify({
      event: "link_created",
      partner_link_id: "link-1",
      recipient_provision_id: "prov-recipient",
      remote_provision_id: "prov-remote",
      remote_display_name: "Alice",
      remote_email: "alice@example.com",
      invited_by_partnership_id: "ptn-1",
      emitted_at: emittedAt,
    });
    const { POST } = await import("@/app/api/webhooks/partner-mirror/route");
    const res = await POST(
      makeReq({ body, signature: sign(body, emittedAt), emittedAt })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, event: "link_created" });
  });
});
