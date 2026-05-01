import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "crypto";

const inMock = vi.fn();
const fromMock = vi.fn(() => ({
  select: () => ({ in: inMock }),
}));
vi.mock("@/utils/supabase/service-role", () => ({
  createServiceRoleClient: () => ({ from: fromMock }),
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_HOSTED_ENABLED", "true");
  vi.stubEnv("ORCHESTRATOR_WEBHOOK_SECRET", "shh");
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    text: () => Promise.resolve(""),
  });
});

describe("fanoutMirrorWebhook", () => {
  it("returns no-secret error per recipient when ORCHESTRATOR_WEBHOOK_SECRET unset", async () => {
    vi.stubEnv("ORCHESTRATOR_WEBHOOK_SECRET", "");
    const { fanoutMirrorWebhook } = await import("@/lib/partners/mirror-webhooks");
    const out = await fanoutMirrorWebhook({
      event: "link_created",
      partnerLinkId: "l1",
      inviterProvisionId: "p1",
      acceptorProvisionId: "p2",
      invitedByPartnershipId: "pship",
    });
    expect(out.results).toHaveLength(2);
    expect(out.results.every((r) => !r.ok)).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts a signed body to each tenant's webhook URL", async () => {
    inMock.mockResolvedValueOnce({
      data: [
        {
          id: "p1",
          email: "ben@example.com",
          display_name: "Ben",
          subdomain_short_id: "abc123",
          subdomain_vanity: null,
        },
        {
          id: "p2",
          email: "sarah@example.com",
          display_name: "Sarah",
          subdomain_short_id: "def456",
          subdomain_vanity: "sarah",
        },
      ],
      error: null,
    });
    const { fanoutMirrorWebhook } = await import("@/lib/partners/mirror-webhooks");
    const out = await fanoutMirrorWebhook({
      event: "link_created",
      partnerLinkId: "link-1",
      inviterProvisionId: "p1",
      acceptorProvisionId: "p2",
      invitedByPartnershipId: "pship-ben",
    });
    expect(out.results).toEqual([
      { provisionId: "p1", ok: true },
      { provisionId: "p2", ok: true },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [url1, init1] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url1).toBe("https://abc123.piggyback.finance/api/webhooks/partner-mirror");
    const headers1 = init1.headers as Record<string, string>;
    const body1 = init1.body as string;
    const sigExpected1 = createHmac("sha256", "shh")
      .update(`${headers1["x-piggyback-emitted-at"]}.${body1}`)
      .digest("hex");
    expect(headers1["x-piggyback-signature"]).toBe(sigExpected1);
    const parsed1 = JSON.parse(body1) as Record<string, unknown>;
    expect(parsed1.event).toBe("link_created");
    expect(parsed1.recipient_provision_id).toBe("p1");
    expect(parsed1.remote_provision_id).toBe("p2");
    expect(parsed1.remote_display_name).toBe("Sarah");

    const [url2] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url2).toBe("https://sarah.piggyback.finance/api/webhooks/partner-mirror");
  });

  it("records per-tenant failure when tenant has no subdomain yet", async () => {
    inMock.mockResolvedValueOnce({
      data: [
        {
          id: "p1",
          email: "ben@example.com",
          display_name: "Ben",
          subdomain_short_id: null,
          subdomain_vanity: null,
        },
        {
          id: "p2",
          email: "sarah@example.com",
          display_name: "Sarah",
          subdomain_short_id: "def456",
          subdomain_vanity: null,
        },
      ],
      error: null,
    });
    const { fanoutMirrorWebhook } = await import("@/lib/partners/mirror-webhooks");
    const out = await fanoutMirrorWebhook({
      event: "link_created",
      partnerLinkId: "link-1",
      inviterProvisionId: "p1",
      acceptorProvisionId: "p2",
      invitedByPartnershipId: "pship-ben",
    });
    expect(out.results.find((r) => r.provisionId === "p1")?.ok).toBe(false);
    expect(out.results.find((r) => r.provisionId === "p2")?.ok).toBe(true);
    // Only the second tenant got a fetch
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("captures HTTP failure as per-tenant error", async () => {
    inMock.mockResolvedValueOnce({
      data: [
        {
          id: "p1",
          email: "ben@example.com",
          display_name: "Ben",
          subdomain_short_id: "abc",
          subdomain_vanity: null,
        },
        {
          id: "p2",
          email: "sarah@example.com",
          display_name: "Sarah",
          subdomain_short_id: "def",
          subdomain_vanity: null,
        },
      ],
      error: null,
    });
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve("boom"),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(""),
      });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { fanoutMirrorWebhook } = await import("@/lib/partners/mirror-webhooks");
    const out = await fanoutMirrorWebhook({
      event: "link_severed",
      partnerLinkId: "link-1",
      inviterProvisionId: "p1",
      acceptorProvisionId: "p2",
      invitedByPartnershipId: null,
    });
    expect(out.results[0].ok).toBe(false);
    expect(out.results[1].ok).toBe(true);
    errSpy.mockRestore();
  });
});

describe("verifyMirrorSignature", () => {
  it("returns true for a matching HMAC", async () => {
    const { verifyMirrorSignature } = await import("@/lib/partners/mirror-webhooks");
    const body = JSON.stringify({ a: 1 });
    const emittedAt = "2026-01-01T00:00:00Z";
    const secret = "shh";
    const sig = createHmac("sha256", secret).update(`${emittedAt}.${body}`).digest("hex");
    expect(
      verifyMirrorSignature({ body, signature: sig, emittedAt, secret })
    ).toBe(true);
  });

  it("returns false for a tampered body", async () => {
    const { verifyMirrorSignature } = await import("@/lib/partners/mirror-webhooks");
    const body = JSON.stringify({ a: 1 });
    const emittedAt = "2026-01-01T00:00:00Z";
    const secret = "shh";
    const sig = createHmac("sha256", secret).update(`${emittedAt}.${body}`).digest("hex");
    expect(
      verifyMirrorSignature({
        body: body + " ",
        signature: sig,
        emittedAt,
        secret,
      })
    ).toBe(false);
  });
});
