/**
 * Pure-logic tests for `pickAliasRedirectTarget` — the function the orchestrator
 * middleware uses to decide whether to 301-redirect a request from an old
 * subdomain to the tenant's current subdomain.
 *
 * These don't exercise the Supabase lookup; that's covered by the integration
 * test against a mocked client in subdomain-route.test.ts.
 */

import { describe, it, expect } from "vitest";
import { pickAliasRedirectTarget } from "../middleware-subdomain";
import { ALIAS_GRACE_MS } from "../subdomain";

const NOW = new Date("2026-04-30T12:00:00Z");

describe("pickAliasRedirectTarget", () => {
  it("returns null when there is no alias row", () => {
    expect(
      pickAliasRedirectTarget({
        hostname: "j7k2p9.piggyback.finance",
        pathAndQuery: "/home",
        alias: null,
        now: NOW,
      })
    ).toBeNull();
  });

  it("returns null when the alias has no current subdomain to redirect to", () => {
    const expires_at = new Date(NOW.getTime() + ALIAS_GRACE_MS).toISOString();
    expect(
      pickAliasRedirectTarget({
        hostname: "j7k2p9.piggyback.finance",
        pathAndQuery: "/home",
        alias: { expires_at, current_subdomain: null },
        now: NOW,
      })
    ).toBeNull();
  });

  it("returns null when the alias has expired", () => {
    const expires_at = new Date(NOW.getTime() - 1000).toISOString();
    expect(
      pickAliasRedirectTarget({
        hostname: "j7k2p9.piggyback.finance",
        pathAndQuery: "/home",
        alias: { expires_at, current_subdomain: "benl" },
        now: NOW,
      })
    ).toBeNull();
  });

  it("returns the redirect URL when the alias is active and has a current subdomain", () => {
    const expires_at = new Date(NOW.getTime() + ALIAS_GRACE_MS - 1000).toISOString();
    const target = pickAliasRedirectTarget({
      hostname: "j7k2p9.piggyback.finance",
      pathAndQuery: "/home?from=email",
      alias: { expires_at, current_subdomain: "benl" },
      now: NOW,
    });
    expect(target).toBe("https://benl.piggyback.finance/home?from=email");
  });

  it("preserves the path and query string", () => {
    const expires_at = new Date(NOW.getTime() + 1000).toISOString();
    const target = pickAliasRedirectTarget({
      hostname: "old-name.piggyback.finance",
      pathAndQuery: "/budget?period=monthly#header",
      alias: { expires_at, current_subdomain: "new-name" },
      now: NOW,
    });
    // URL fragments aren't sent to the server, but if pathAndQuery includes
    // one we still pass it through faithfully.
    expect(target).toBe("https://new-name.piggyback.finance/budget?period=monthly#header");
  });

  it("does not redirect to itself if the host equals the current subdomain", () => {
    const expires_at = new Date(NOW.getTime() + 1000).toISOString();
    expect(
      pickAliasRedirectTarget({
        hostname: "benl.piggyback.finance",
        pathAndQuery: "/",
        alias: { expires_at, current_subdomain: "benl" },
        now: NOW,
      })
    ).toBeNull();
  });

  it("returns null if expires_at is unparseable", () => {
    expect(
      pickAliasRedirectTarget({
        hostname: "j7k2p9.piggyback.finance",
        pathAndQuery: "/",
        alias: { expires_at: "not-a-date", current_subdomain: "benl" },
        now: NOW,
      })
    ).toBeNull();
  });
});
