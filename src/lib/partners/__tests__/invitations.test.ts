import { describe, it, expect, vi, beforeEach } from "vitest";

const insertMock = vi.fn();
const eqInner = vi.fn();
const eqOuter = vi.fn();

const fromMock = vi.fn(() => ({
  insert: insertMock,
  delete: () => ({ eq: eqOuter }),
}));

vi.mock("@/utils/supabase/service-role", () => ({
  createServiceRoleClient: () => ({ from: fromMock }),
}));

const sendEmailMock = vi.fn();
vi.mock("@/lib/email", () => ({
  sendPartnerInvitationEmail: sendEmailMock,
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_HOSTED_ENABLED", "true");
  insertMock.mockReturnValue({
    select: () => ({
      single: () =>
        Promise.resolve({ data: { id: "i1", token: "tok-uuid" }, error: null }),
    }),
  });
  // delete().eq().eq() — chain that resolves to {error:null}
  eqOuter.mockReturnValue({ eq: eqInner });
  eqInner.mockResolvedValue({ error: null });
});

describe("createInvitation", () => {
  it("creates row + sends email on happy path", async () => {
    const { createInvitation } = await import("@/lib/partners/invitations");
    const result = await createInvitation({
      invitedByProvisionId: "p1",
      invitedByPartnershipId: "pship1",
      inviteeEmail: "Sarah@Example.com",
      manualPartnerName: "Sarah",
      inviterDisplayName: "Ben",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.invitationId).toBe("i1");
      expect(result.token).toBe("tok-uuid");
    }
    expect(fromMock).toHaveBeenCalledWith("partner_claim_invitations");
    expect(insertMock).toHaveBeenCalledOnce();
    const inserted = insertMock.mock.calls[0][0] as Record<string, unknown>;
    expect(inserted.invited_by_provision_id).toBe("p1");
    expect(inserted.invited_by_partnership_id).toBe("pship1");
    // email lowercased + trimmed
    expect(inserted.invitee_email).toBe("sarah@example.com");
    expect(inserted.manual_partner_name).toBe("Sarah");
    expect(sendEmailMock).toHaveBeenCalledWith({
      to: "sarah@example.com",
      inviterDisplayName: "Ben",
      manualPartnerName: "Sarah",
      token: "tok-uuid",
    });
  });

  it("rejects invalid email without inserting or emailing", async () => {
    const { createInvitation } = await import("@/lib/partners/invitations");
    const result = await createInvitation({
      invitedByProvisionId: "p1",
      invitedByPartnershipId: "pship1",
      inviteeEmail: "not an email",
      manualPartnerName: null,
      inviterDisplayName: "Ben",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/invalid email/i);
    }
    expect(insertMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("propagates DB errors", async () => {
    insertMock.mockReturnValueOnce({
      select: () => ({
        single: () =>
          Promise.resolve({ data: null, error: { message: "duplicate" } }),
      }),
    });
    const { createInvitation } = await import("@/lib/partners/invitations");
    const result = await createInvitation({
      invitedByProvisionId: "p1",
      invitedByPartnershipId: "pship1",
      inviteeEmail: "ok@example.com",
      manualPartnerName: null,
      inviterDisplayName: "Ben",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("duplicate");
    }
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("throws when called from a tenant deploy", async () => {
    vi.stubEnv("NEXT_PUBLIC_HOSTED_ENABLED", "");
    const { createInvitation } = await import("@/lib/partners/invitations");
    await expect(
      createInvitation({
        invitedByProvisionId: "p1",
        invitedByPartnershipId: "pship1",
        inviteeEmail: "ok@example.com",
        manualPartnerName: null,
        inviterDisplayName: "Ben",
      })
    ).rejects.toThrow(/orchestrator-only/i);
  });
});

describe("cancelInvitation", () => {
  it("deletes the invitation scoped to the inviter's provision", async () => {
    const { cancelInvitation } = await import("@/lib/partners/invitations");
    const result = await cancelInvitation({
      invitationId: "inv-1",
      invitedByProvisionId: "p1",
    });
    expect(result.ok).toBe(true);
    expect(fromMock).toHaveBeenCalledWith("partner_claim_invitations");
    expect(eqOuter).toHaveBeenCalledWith("id", "inv-1");
    expect(eqInner).toHaveBeenCalledWith("invited_by_provision_id", "p1");
  });

  it("returns error when delete fails", async () => {
    eqInner.mockResolvedValueOnce({ error: { message: "boom" } });
    const { cancelInvitation } = await import("@/lib/partners/invitations");
    const result = await cancelInvitation({
      invitationId: "inv-1",
      invitedByProvisionId: "p1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("boom");
    }
  });
});
