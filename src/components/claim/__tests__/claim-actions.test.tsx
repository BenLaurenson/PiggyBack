/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

// Re-stub fetch per test.
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import { ClaimActions } from "../claim-actions";

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
});

describe("ClaimActions", () => {
  it("renders both buttons in accept-or-decline mode", () => {
    render(<ClaimActions token="tok" mode="accept-or-decline" inviterName="Ben" />);
    expect(screen.getByRole("button", { name: /accept invitation/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /decline/i })).toBeTruthy();
  });

  it("renders only decline in decline-only mode", () => {
    render(<ClaimActions token="tok" mode="decline-only" inviterName="Ben" />);
    expect(screen.queryByRole("button", { name: /accept invitation/i })).toBeNull();
    expect(screen.getByRole("button", { name: /decline/i })).toBeTruthy();
  });

  it("posts to /api/partners/claim on accept and shows success then redirects", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ partner_link_id: "l1" }),
    });
    render(<ClaimActions token="tok-abc" mode="accept-or-decline" inviterName="Ben" />);
    fireEvent.click(screen.getByRole("button", { name: /accept invitation/i }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/partners/claim",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ token: "tok-abc" }),
        })
      );
    });
    expect(await screen.findByText(/You're partnered with Ben/i)).toBeTruthy();
  });

  it("shows error when accept fails", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: "Invitation expired. Ask for a new one." }),
    });
    render(<ClaimActions token="tok" mode="accept-or-decline" inviterName="Ben" />);
    fireEvent.click(screen.getByRole("button", { name: /accept invitation/i }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/expired/i);
  });

  it("posts to /api/partners/reject on decline + shows declined state", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    });
    render(<ClaimActions token="tok" mode="decline-only" inviterName="Ben" />);
    fireEvent.click(screen.getByRole("button", { name: /decline/i }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/partners/reject",
        expect.objectContaining({ method: "POST" })
      );
    });
    expect(await screen.findByText(/Invitation declined/i)).toBeTruthy();
  });
});
