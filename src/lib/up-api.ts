/**
 * Up Bank API client.
 *
 * @see https://developer.up.com.au/ — official developer documentation
 *
 * Type definitions live in `up-types.ts`. Constants in `up-constants.ts`.
 * Error classes in `up-errors.ts`. This module composes them into an HTTP client.
 *
 * To audit drift against the latest docs, fetch `/websites/developer_up_au`
 * via context7 and compare each method's `@see` link to the current schema.
 */

import {
  MAX_PAGES,
  PAGE_SIZE_DEFAULT,
  RETRY_AFTER_MAX_MS,
  RETRY_BACKOFF_MS,
  UP_API_BASE_URL,
  UP_API_HOSTNAME,
  WEBHOOK_DESCRIPTION_MAX_CHARS,
  WEBHOOK_URL_MAX_CHARS,
} from "./up-constants";
import {
  UpApiError,
  UpClientError,
  UpRateLimitedError,
  UpServerError,
  UpUnauthorizedError,
  UpWebhookLimitReachedError,
  isWebhookLimitReached,
  parseRetryAfter,
} from "./up-errors";
import type {
  AccountTypeEnum,
  OwnershipTypeEnum,
  TransactionStatusEnum,
  UpAccount,
  UpApiErrorPayload,
  UpCategoriesResponse,
  UpCategory,
  UpPaginatedResponse,
  UpPingResponse,
  UpSingleResponse,
  UpTag,
  UpTransaction,
  UpWebhook,
  UpWebhookDeliveryLog,
} from "./up-types";

// ─── Re-exports for backwards compatibility ──────────────────────────────────

export type {
  UpAccount,
  UpTransaction,
  UpCategory,
  UpPaginatedResponse,
  UpTag,
  UpWebhook,
  UpWebhookDeliveryLog,
} from "./up-types";

export { MAX_PAGES } from "./up-constants";
export {
  UpApiError,
  UpClientError,
  UpRateLimitedError,
  UpServerError,
  UpUnauthorizedError,
  UpWebhookLimitReachedError,
} from "./up-errors";

// ─── SSRF guard for pagination URLs ──────────────────────────────────────────

/**
 * Validate that a pagination URL points to the expected Up Bank API domain.
 * Prevents SSRF attacks where a compromised API response could redirect
 * requests to internal services via crafted pagination links.
 */
export function validateUpApiUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid pagination URL: ${url}`);
  }
  if (parsed.hostname !== UP_API_HOSTNAME || parsed.protocol !== "https:") {
    throw new Error(
      `Pagination URL does not match expected Up Bank API domain (${UP_API_HOSTNAME}): ${url}`
    );
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ─── Client ──────────────────────────────────────────────────────────────────

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: string;
  /** Skip auto-retry. Used internally to avoid infinite loops. */
  skipRetry?: boolean;
}

class UpApiClient {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  /**
   * Make an authenticated request to Up Bank.
   *
   * Auto-retries once on:
   *   - 429 (with `Retry-After` honored, capped at RETRY_AFTER_MAX_MS)
   *   - 5xx (1s backoff)
   *
   * Throws typed errors:
   *   - UpUnauthorizedError on 401
   *   - UpRateLimitedError on 429 after retry exhausted
   *   - UpClientError on other 4xx (including UpWebhookLimitReachedError on 400 + quota)
   *   - UpServerError on 5xx after retry exhausted
   *
   * @see https://developer.up.com.au/#errors
   */
  private async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const url = endpoint.startsWith("http") ? endpoint : `${UP_API_BASE_URL}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (response.ok) {
      // 204 No Content (e.g., addTags, removeTags, categorize)
      if (response.status === 204) {
        return undefined as T;
      }
      return response.json() as Promise<T>;
    }

    // Try to parse the JSON:API error body. May fail on 5xx with empty body.
    let payload: UpApiErrorPayload | null = null;
    try {
      payload = (await response.json()) as UpApiErrorPayload;
    } catch {
      payload = null;
    }

    // 401 → unrecoverable, surface friendly typed error
    if (response.status === 401) {
      throw new UpUnauthorizedError(endpoint, payload);
    }

    // 429 → honor Retry-After once, then throw
    if (response.status === 429) {
      const retryAfterMs = parseRetryAfter(response.headers.get("Retry-After"));
      if (!options.skipRetry && retryAfterMs !== null) {
        const waitMs = Math.min(retryAfterMs, RETRY_AFTER_MAX_MS);
        await sleep(waitMs);
        return this.request<T>(endpoint, { ...options, skipRetry: true });
      }
      throw new UpRateLimitedError(endpoint, payload, retryAfterMs);
    }

    // 5xx → one retry on a 1s backoff
    if (response.status >= 500 && response.status < 600) {
      if (!options.skipRetry) {
        await sleep(RETRY_BACKOFF_MS);
        return this.request<T>(endpoint, { ...options, skipRetry: true });
      }
      throw new UpServerError(
        payload?.errors?.[0]?.detail ?? `Up Bank server error (${response.status})`,
        response.status,
        endpoint,
        payload
      );
    }

    // Other 4xx — detect webhook-quota variant on POST /webhooks
    if (endpoint.startsWith("/webhooks") && options.method === "POST" && isWebhookLimitReached(payload)) {
      throw new UpWebhookLimitReachedError(endpoint, payload);
    }

    throw new UpClientError(
      payload?.errors?.[0]?.detail ?? `Up Bank request failed (${response.status})`,
      response.status,
      endpoint,
      payload
    );
  }

  // ─── Util ──────────────────────────────────────────────────────────────────

  /**
   * Verify the token is valid by pinging the API.
   * @see https://developer.up.com.au/#get_util_ping
   */
  async ping(): Promise<UpPingResponse> {
    return this.request<UpPingResponse>("/util/ping");
  }

  // ─── Accounts ──────────────────────────────────────────────────────────────

  /**
   * Retrieve a paginated list of accounts.
   * @see https://developer.up.com.au/#get_accounts
   */
  async getAccounts(
    params: {
      pageSize?: number;
      filterAccountType?: AccountTypeEnum;
      filterOwnershipType?: OwnershipTypeEnum;
    } = {}
  ): Promise<UpPaginatedResponse<UpAccount>> {
    const searchParams = new URLSearchParams();
    if (params.pageSize) searchParams.set("page[size]", params.pageSize.toString());
    if (params.filterAccountType) searchParams.set("filter[accountType]", params.filterAccountType);
    if (params.filterOwnershipType) searchParams.set("filter[ownershipType]", params.filterOwnershipType);

    const query = searchParams.toString();
    return this.request<UpPaginatedResponse<UpAccount>>(`/accounts${query ? `?${query}` : ""}`);
  }

  /**
   * Retrieve a single account by ID.
   * @see https://developer.up.com.au/#get_accounts_id
   */
  async getAccount(id: string): Promise<UpSingleResponse<UpAccount>> {
    return this.request<UpSingleResponse<UpAccount>>(`/accounts/${encodeURIComponent(id)}`);
  }

  // ─── Transactions ──────────────────────────────────────────────────────────

  /**
   * Retrieve a paginated list of all transactions.
   * @see https://developer.up.com.au/#get_transactions
   */
  async getTransactions(
    params: {
      pageSize?: number;
      filterStatus?: TransactionStatusEnum;
      filterSince?: string; // ISO 8601 date-time
      filterUntil?: string; // ISO 8601 date-time
      filterCategory?: string;
      filterTag?: string;
    } = {}
  ): Promise<UpPaginatedResponse<UpTransaction>> {
    const searchParams = buildTransactionSearchParams(params);
    const query = searchParams.toString();
    return this.request<UpPaginatedResponse<UpTransaction>>(
      `/transactions${query ? `?${query}` : ""}`
    );
  }

  /**
   * Retrieve a paginated list of transactions for a specific account.
   * @see https://developer.up.com.au/#get_accounts_accountId_transactions
   */
  async getAccountTransactions(
    accountId: string,
    params: {
      pageSize?: number;
      filterStatus?: TransactionStatusEnum;
      filterSince?: string;
      filterUntil?: string;
      filterCategory?: string;
      filterTag?: string;
    } = {}
  ): Promise<UpPaginatedResponse<UpTransaction>> {
    const searchParams = buildTransactionSearchParams(params);
    const query = searchParams.toString();
    return this.request<UpPaginatedResponse<UpTransaction>>(
      `/accounts/${encodeURIComponent(accountId)}/transactions${query ? `?${query}` : ""}`
    );
  }

  /**
   * Retrieve a single transaction by ID.
   * @see https://developer.up.com.au/#get_transactions_id
   */
  async getTransaction(id: string): Promise<UpSingleResponse<UpTransaction>> {
    return this.request<UpSingleResponse<UpTransaction>>(`/transactions/${encodeURIComponent(id)}`);
  }

  // ─── Categories ────────────────────────────────────────────────────────────

  /**
   * Retrieve all categories.
   * Note: This endpoint is NOT paginated per Up's docs.
   * @see https://developer.up.com.au/#get_categories
   */
  async getCategories(params: { filterParent?: string } = {}): Promise<UpCategoriesResponse> {
    const searchParams = new URLSearchParams();
    if (params.filterParent) searchParams.set("filter[parent]", params.filterParent);
    const query = searchParams.toString();
    return this.request<UpCategoriesResponse>(`/categories${query ? `?${query}` : ""}`);
  }

  /**
   * Retrieve a single category by ID.
   * @see https://developer.up.com.au/#get_categories_id
   */
  async getCategory(id: string): Promise<UpSingleResponse<UpCategory>> {
    return this.request<UpSingleResponse<UpCategory>>(`/categories/${encodeURIComponent(id)}`);
  }

  /**
   * Set or clear a transaction's category.
   * Pass `null` to de-categorize.
   * @see https://developer.up.com.au/#patch_transactions_transactionId_relationships_category
   */
  async categorizeTransaction(transactionId: string, categoryId: string | null): Promise<void> {
    await this.request(`/transactions/${encodeURIComponent(transactionId)}/relationships/category`, {
      method: "PATCH",
      body: JSON.stringify({
        data: categoryId ? { type: "categories", id: categoryId } : null,
      }),
    });
  }

  // ─── Tags ──────────────────────────────────────────────────────────────────

  /**
   * Retrieve a paginated list of all tags currently in use, ordered lexicographically.
   * @see https://developer.up.com.au/#get_tags
   */
  async getTags(params: { pageSize?: number } = {}): Promise<UpPaginatedResponse<UpTag>> {
    const searchParams = new URLSearchParams();
    if (params.pageSize) searchParams.set("page[size]", params.pageSize.toString());
    const query = searchParams.toString();
    return this.request<UpPaginatedResponse<UpTag>>(`/tags${query ? `?${query}` : ""}`);
  }

  /**
   * Add tags to a transaction.
   * @see https://developer.up.com.au/#post_transactions_transactionId_relationships_tags
   */
  async addTags(transactionId: string, tags: string[]): Promise<void> {
    await this.request(`/transactions/${encodeURIComponent(transactionId)}/relationships/tags`, {
      method: "POST",
      body: JSON.stringify({
        data: tags.map((tag) => ({ type: "tags", id: tag })),
      }),
    });
  }

  /**
   * Remove tags from a transaction.
   * @see https://developer.up.com.au/#delete_transactions_transactionId_relationships_tags
   */
  async removeTags(transactionId: string, tags: string[]): Promise<void> {
    await this.request(`/transactions/${encodeURIComponent(transactionId)}/relationships/tags`, {
      method: "DELETE",
      body: JSON.stringify({
        data: tags.map((tag) => ({ type: "tags", id: tag })),
      }),
    });
  }

  // ─── Webhooks ──────────────────────────────────────────────────────────────

  /**
   * List webhooks registered against the current PAT.
   * @see https://developer.up.com.au/#get_webhooks
   */
  async listWebhooks(params: { pageSize?: number } = {}): Promise<UpPaginatedResponse<UpWebhook>> {
    const searchParams = new URLSearchParams();
    if (params.pageSize) searchParams.set("page[size]", params.pageSize.toString());
    const query = searchParams.toString();
    return this.request<UpPaginatedResponse<UpWebhook>>(`/webhooks${query ? `?${query}` : ""}`);
  }

  /**
   * Create a new webhook. URL must be ≤300 chars; description ≤64 chars.
   * Throws UpWebhookLimitReachedError if you've reached the 10-per-PAT cap.
   * @see https://developer.up.com.au/#post_webhooks
   */
  async createWebhook(input: { url: string; description?: string | null }): Promise<UpSingleResponse<UpWebhook>> {
    if (input.url.length > WEBHOOK_URL_MAX_CHARS) {
      throw new UpClientError(
        `Webhook URL exceeds Up's ${WEBHOOK_URL_MAX_CHARS}-character limit`,
        400,
        "/webhooks",
        null
      );
    }
    if (input.description && input.description.length > WEBHOOK_DESCRIPTION_MAX_CHARS) {
      // Truncate silently rather than fail — descriptions are cosmetic.
      input.description = input.description.slice(0, WEBHOOK_DESCRIPTION_MAX_CHARS);
    }
    return this.request<UpSingleResponse<UpWebhook>>("/webhooks", {
      method: "POST",
      body: JSON.stringify({
        data: {
          attributes: {
            url: input.url,
            ...(input.description ? { description: input.description } : {}),
          },
        },
      }),
    });
  }

  /**
   * Retrieve a webhook by ID.
   * @see https://developer.up.com.au/#get_webhooks_id
   */
  async getWebhook(id: string): Promise<UpSingleResponse<UpWebhook>> {
    return this.request<UpSingleResponse<UpWebhook>>(`/webhooks/${encodeURIComponent(id)}`);
  }

  /**
   * Delete a webhook by ID.
   * @see https://developer.up.com.au/#delete_webhooks_id
   */
  async deleteWebhook(id: string): Promise<void> {
    await this.request(`/webhooks/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  /**
   * Trigger a PING event to a registered webhook.
   * @see https://developer.up.com.au/#post_webhooks_webhookId_ping
   */
  async pingWebhook(id: string): Promise<void> {
    await this.request(`/webhooks/${encodeURIComponent(id)}/ping`, { method: "POST" });
  }

  /**
   * List delivery logs for a webhook (newest first).
   * @see https://developer.up.com.au/#get_webhooks_webhookId_logs
   */
  async getWebhookLogs(
    id: string,
    params: { pageSize?: number } = {}
  ): Promise<UpPaginatedResponse<UpWebhookDeliveryLog>> {
    const searchParams = new URLSearchParams();
    if (params.pageSize) searchParams.set("page[size]", params.pageSize.toString());
    const query = searchParams.toString();
    return this.request<UpPaginatedResponse<UpWebhookDeliveryLog>>(
      `/webhooks/${encodeURIComponent(id)}/logs${query ? `?${query}` : ""}`
    );
  }

  // ─── Pagination ────────────────────────────────────────────────────────────

  /**
   * Walk all pages of a paginated response, capped at MAX_PAGES.
   * Each request re-validates the next URL via `validateUpApiUrl` for SSRF safety.
   * Re-uses the typed retry/error logic of `request<T>`.
   */
  async getAllPages<T>(initialResponse: UpPaginatedResponse<T>): Promise<T[]> {
    let allData = [...initialResponse.data];
    let nextUrl = initialResponse.links.next;
    let pageCount = 0;

    while (nextUrl && pageCount < MAX_PAGES) {
      validateUpApiUrl(nextUrl);
      const data = await this.request<UpPaginatedResponse<T>>(nextUrl);
      allData = [...allData, ...data.data];
      nextUrl = data.links.next;
      pageCount++;
    }

    if (pageCount >= MAX_PAGES && nextUrl) {
      console.warn(
        `[UpApiClient] Pagination stopped at MAX_PAGES (${MAX_PAGES}). ` +
          `Some data may be missing — consider time-window chunking instead.`
      );
    }

    return allData;
  }
}

function buildTransactionSearchParams(params: {
  pageSize?: number;
  filterStatus?: TransactionStatusEnum;
  filterSince?: string;
  filterUntil?: string;
  filterCategory?: string;
  filterTag?: string;
}): URLSearchParams {
  const searchParams = new URLSearchParams();
  searchParams.set("page[size]", String(params.pageSize ?? PAGE_SIZE_DEFAULT));
  if (params.filterStatus) searchParams.set("filter[status]", params.filterStatus);
  if (params.filterSince) searchParams.set("filter[since]", params.filterSince);
  if (params.filterUntil) searchParams.set("filter[until]", params.filterUntil);
  if (params.filterCategory) searchParams.set("filter[category]", params.filterCategory);
  if (params.filterTag) searchParams.set("filter[tag]", params.filterTag);
  return searchParams;
}

export function createUpApiClient(token: string): UpApiClient {
  return new UpApiClient(token);
}

export type { UpApiClient };
