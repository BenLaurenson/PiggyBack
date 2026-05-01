import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ id: "id_123" }),
    text: () => Promise.resolve(""),
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("sendPartnerInvitationEmail", () => {
  it("posts to Resend with the right payload", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("RESEND_FROM", "noreply@piggyback.finance");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://piggyback.finance");

    const { sendPartnerInvitationEmail } = await import("@/lib/email");
    await sendPartnerInvitationEmail({
      to: "sarah@example.com",
      inviterDisplayName: "Ben",
      manualPartnerName: "Sarah",
      token: "tok_abc",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer re_test");
    expect(headers["Content-Type"]).toBe("application/json");
    const body = JSON.parse(init.body as string) as {
      to: string[];
      from: string;
      subject: string;
      html: string;
      reply_to?: string;
    };
    expect(body.to).toEqual(["sarah@example.com"]);
    expect(body.from).toBe("noreply@piggyback.finance");
    expect(body.subject).toContain("Ben");
    expect(body.html).toContain("Hey Sarah");
    expect(body.html).toContain("Ben invited you");
    expect(body.html).toContain("https://piggyback.finance/claim/tok_abc");
  });

  it("greets without a name when manualPartnerName is null", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");

    const { sendPartnerInvitationEmail } = await import("@/lib/email");
    await sendPartnerInvitationEmail({
      to: "x@y.z",
      inviterDisplayName: "Ben",
      manualPartnerName: null,
      token: "tok",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { html: string };
    expect(body.html).toContain("Hey,");
    expect(body.html).not.toContain("Hey null");
  });

  it("no-op when RESEND_API_KEY missing", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const { sendPartnerInvitationEmail } = await import("@/lib/email");
    await sendPartnerInvitationEmail({
      to: "x@y.z",
      inviterDisplayName: "Ben",
      manualPartnerName: null,
      token: "tok",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("logs but does not throw when Resend returns non-OK", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 422,
      text: () => Promise.resolve("invalid email"),
      json: () => Promise.resolve({ error: "invalid email" }),
    });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { sendPartnerInvitationEmail } = await import("@/lib/email");
    await expect(
      sendPartnerInvitationEmail({
        to: "bad@example",
        inviterDisplayName: "Ben",
        manualPartnerName: null,
        token: "tok",
      })
    ).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
