/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

// Avoid window.confirm prompts firing in tests.
vi.stubGlobal("confirm", () => true);

import { PartnerConfig } from "../partner-config";

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
});

function emptyState() {
  return { link: null, pending_invitations: [] };
}

describe("PartnerConfig", () => {
  it("renders invite form when no link + no pending", () => {
    render(<PartnerConfig localPartnershipId="p1" initialState={emptyState()} />);
    expect(screen.getByPlaceholderText(/sarah@example\.com/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /send invitation/i })).toBeTruthy();
  });

  it("submits an invite to /api/partners/invite then refreshes state", async () => {
    fetchMock
      // POST invite
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ invitation_id: "i1", token: "tok" }),
      })
      // GET state refresh
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            link: null,
            pending_invitations: [
              {
                id: "i1",
                invitee_email: "sarah@example.com",
                manual_partner_name: "Sarah",
                expires_at: new Date(Date.now() + 86_400_000).toISOString(),
              },
            ],
          }),
      });
    render(<PartnerConfig localPartnershipId="p1" initialState={emptyState()} />);
    fireEvent.change(screen.getByPlaceholderText(/sarah@example\.com/i), {
      target: { value: "sarah@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send invitation/i }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/partners/invite",
        expect.objectContaining({ method: "POST" })
      )
    );
    expect(await screen.findByText(/Pending invitations/i)).toBeTruthy();
    expect(screen.getByText(/sarah@example\.com/i)).toBeTruthy();
  });

  it("renders pending invite + cancels via DELETE", async () => {
    const initialState = {
      link: null,
      pending_invitations: [
        {
          id: "i1",
          invitee_email: "sarah@example.com",
          manual_partner_name: "Sarah",
          expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        },
      ],
    };
    fetchMock
      // DELETE cancel
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ok: true }) })
      // GET state refresh — now empty
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(emptyState()),
      });
    render(<PartnerConfig localPartnershipId="p1" initialState={initialState} />);
    fireEvent.click(screen.getByRole("button", { name: /^Cancel$/ }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/partners/cancel",
        expect.objectContaining({
          method: "DELETE",
          body: JSON.stringify({ invitation_id: "i1" }),
        })
      )
    );
  });

  it("renders active link card and severs", async () => {
    const initialState = {
      link: {
        partner_link_id: "l1",
        status: "active" as const,
        role: "initiator" as const,
        partner_provision_id: "p2",
        partner_display_name: "Sarah",
        partner_email: "sarah@example.com",
        active_at: "2026-04-01T00:00:00Z",
        consent_aggregate_view: true,
        consent_transaction_view: false,
      },
      pending_invitations: [],
    };
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ok: true }) })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(emptyState()),
      });
    render(<PartnerConfig localPartnershipId="p1" initialState={initialState} />);
    expect(screen.getByText(/Partnered with Sarah/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /remove partner/i }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/partners/sever",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ partner_link_id: "l1" }),
        })
      )
    );
  });

  it("toggles consent_aggregate_view via PATCH", async () => {
    const initialState = {
      link: {
        partner_link_id: "l1",
        status: "active" as const,
        role: "initiator" as const,
        partner_provision_id: "p2",
        partner_display_name: "Sarah",
        partner_email: "sarah@example.com",
        active_at: "2026-04-01T00:00:00Z",
        consent_aggregate_view: true,
        consent_transaction_view: false,
      },
      pending_invitations: [],
    };
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ok: true }) })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(initialState),
      });
    render(<PartnerConfig localPartnershipId="p1" initialState={initialState} />);
    const checkbox = screen
      .getAllByRole("checkbox")
      .find((c) => (c as HTMLInputElement).checked === true);
    if (!checkbox) throw new Error("expected aggregate checkbox to be checked");
    fireEvent.click(checkbox);
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/partners/state",
        expect.objectContaining({
          method: "PATCH",
        })
      )
    );
    const lastPatch = fetchMock.mock.calls.find(
      (c) => (c[1] as RequestInit | undefined)?.method === "PATCH"
    );
    expect(lastPatch).toBeTruthy();
    if (lastPatch) {
      const body = JSON.parse(
        (lastPatch[1] as RequestInit).body as string
      ) as Record<string, unknown>;
      expect(body.partner_link_id).toBe("l1");
      expect(body.consent_aggregate_view).toBe(false);
    }
  });
});
