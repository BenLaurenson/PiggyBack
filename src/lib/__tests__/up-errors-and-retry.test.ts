/**
 * Tests for UpApiClient typed-error and retry behavior.
 *
 * Verifies:
 *   - 401 → UpUnauthorizedError
 *   - 429 → Retry-After honored once → success
 *   - 429 → Retry-After honored once → still 429 → UpRateLimitedError
 *   - 5xx → 1s backoff retry once → success
 *   - 5xx → 1s backoff retry once → still 5xx → UpServerError
 *   - 4xx generic → UpClientError
 *   - POST /webhooks 4xx with quota title → UpWebhookLimitReachedError
 *   - parseRetryAfter: delta-seconds and HTTP-date forms
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("UpApiClient — typed errors + retry", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("throws UpUnauthorizedError on 401", async () => {
    const { createUpApiClient, UpUnauthorizedError } = await import("@/lib/up-api");
    const client = createUpApiClient("bad-token");

    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 401,
      headers: new Headers(),
      json: () => Promise.resolve({ errors: [{ status: "401", title: "Unauthorized", detail: "Bad token" }] }),
    });

    await expect(client.ping()).rejects.toBeInstanceOf(UpUnauthorizedError);
  });

  it("retries once on 429 with Retry-After then succeeds", async () => {
    const { createUpApiClient } = await import("@/lib/up-api");
    const client = createUpApiClient("token");

    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: new Headers({ "Retry-After": "1" }),
        json: () => Promise.resolve({ errors: [{ status: "429", title: "Rate", detail: "Slow down" }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ meta: { id: "u", statusEmoji: "⚡️" } }),
      });

    const promise = client.ping();
    // Advance the fake retry timer
    await vi.advanceTimersByTimeAsync(1000);
    await expect(promise).resolves.toEqual({ meta: { id: "u", statusEmoji: "⚡️" } });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("throws UpRateLimitedError if 429 persists after one retry", async () => {
    const { createUpApiClient, UpRateLimitedError } = await import("@/lib/up-api");
    const client = createUpApiClient("token");

    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 429,
      headers: new Headers({ "Retry-After": "1" }),
      json: () => Promise.resolve({ errors: [{ status: "429", title: "Rate", detail: "Slow down" }] }),
    });

    const promise = client.ping();
    await vi.advanceTimersByTimeAsync(1000);
    await expect(promise).rejects.toBeInstanceOf(UpRateLimitedError);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("retries once on 5xx with 1s backoff then succeeds", async () => {
    const { createUpApiClient } = await import("@/lib/up-api");
    const client = createUpApiClient("token");

    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        headers: new Headers(),
        json: () => Promise.resolve({ errors: [{ status: "502", title: "Bad Gateway", detail: "" }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ meta: { id: "u", statusEmoji: "⚡️" } }),
      });

    const promise = client.ping();
    await vi.advanceTimersByTimeAsync(1000);
    await expect(promise).resolves.toBeDefined();
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("throws UpServerError if 5xx persists after one retry", async () => {
    const { createUpApiClient, UpServerError } = await import("@/lib/up-api");
    const client = createUpApiClient("token");

    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 503,
      headers: new Headers(),
      json: () => Promise.resolve({ errors: [{ status: "503", title: "Service Unavailable", detail: "" }] }),
    });

    const promise = client.ping();
    await vi.advanceTimersByTimeAsync(1000);
    await expect(promise).rejects.toBeInstanceOf(UpServerError);
  });

  it("throws UpClientError on generic 400", async () => {
    const { createUpApiClient, UpClientError } = await import("@/lib/up-api");
    const client = createUpApiClient("token");

    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 400,
      headers: new Headers(),
      json: () => Promise.resolve({ errors: [{ status: "400", title: "Bad Request", detail: "Bad input" }] }),
    });

    await expect(client.ping()).rejects.toBeInstanceOf(UpClientError);
  });

  it("throws UpWebhookLimitReachedError on POST /webhooks at quota", async () => {
    const { createUpApiClient, UpWebhookLimitReachedError } = await import("@/lib/up-api");
    const client = createUpApiClient("token");

    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 400,
      headers: new Headers(),
      json: () =>
        Promise.resolve({
          errors: [
            {
              status: "400",
              title: "Webhook Quota Reached",
              detail: "Maximum of 10 webhooks per personal access token",
            },
          ],
        }),
    });

    await expect(
      client.createWebhook({ url: "https://example.com/hook" })
    ).rejects.toBeInstanceOf(UpWebhookLimitReachedError);
  });

  it("validates webhook URL length client-side before hitting the network", async () => {
    const { createUpApiClient, UpClientError } = await import("@/lib/up-api");
    const client = createUpApiClient("token");

    const longUrl = "https://example.com/" + "a".repeat(400);
    await expect(client.createWebhook({ url: longUrl })).rejects.toBeInstanceOf(UpClientError);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe("parseRetryAfter", () => {
  it("parses delta-seconds form", async () => {
    const { parseRetryAfter } = await import("@/lib/up-errors");
    expect(parseRetryAfter("30")).toBe(30000);
    expect(parseRetryAfter("0")).toBe(0);
    expect(parseRetryAfter("1.5")).toBe(1500);
  });

  it("parses HTTP-date form", async () => {
    const { parseRetryAfter } = await import("@/lib/up-errors");
    const future = new Date(Date.now() + 5_000).toUTCString();
    const ms = parseRetryAfter(future);
    expect(ms).not.toBeNull();
    expect(ms!).toBeGreaterThan(0);
    expect(ms!).toBeLessThanOrEqual(6_000);
  });

  it("returns null for unparseable input", async () => {
    const { parseRetryAfter } = await import("@/lib/up-errors");
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter("nope")).toBeNull();
  });
});
