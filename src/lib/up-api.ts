/**
 * UP Bank API Integration
 * Documentation: https://developer.up.com.au/
 */

const UP_API_BASE_URL = "https://api.up.com.au/api/v1";
const UP_API_HOSTNAME = "api.up.com.au";

/** Safety limit for pagination to prevent infinite loops */
export const MAX_PAGES = 100;

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

export interface UpAccount {
  type: "accounts";
  id: string;
  attributes: {
    displayName: string;
    accountType: "SAVER" | "TRANSACTIONAL" | "HOME_LOAN";
    ownershipType: "INDIVIDUAL" | "JOINT";
    balance: {
      currencyCode: string;
      value: string;
      valueInBaseUnits: number;
    };
    createdAt: string;
  };
  relationships: {
    transactions: {
      links: {
        related: string;
      };
    };
  };
  links: {
    self: string;
  };
}

export interface UpTransaction {
  type: "transactions";
  id: string;
  attributes: {
    status: "HELD" | "SETTLED";
    rawText: string | null;
    description: string;
    message: string | null;
    isCategorizable: boolean;
    holdInfo: {
      amount: {
        currencyCode: string;
        value: string;
        valueInBaseUnits: number;
      };
      foreignAmount: {
        currencyCode: string;
        value: string;
        valueInBaseUnits: number;
      } | null;
    } | null;
    roundUp: {
      amount: {
        currencyCode: string;
        value: string;
        valueInBaseUnits: number;
      };
      boostPortion: {
        currencyCode: string;
        value: string;
        valueInBaseUnits: number;
      } | null;
    } | null;
    cashback: {
      description: string;
      amount: {
        currencyCode: string;
        value: string;
        valueInBaseUnits: number;
      };
    } | null;
    amount: {
      currencyCode: string;
      value: string;
      valueInBaseUnits: number;
    };
    foreignAmount: {
      currencyCode: string;
      value: string;
      valueInBaseUnits: number;
    } | null;
    cardPurchaseMethod: {
      method: "BAR_CODE" | "OCR" | "CARD_PIN" | "CARD_DETAILS" | "CARD_ON_FILE" | "ECOMMERCE" | "MAGNETIC_STRIPE" | "CONTACTLESS";
      cardNumberSuffix: string | null;
    } | null;
    settledAt: string | null;
    createdAt: string;
    performingCustomer?: { displayName: string } | null;
  };
  relationships: {
    account: {
      data: {
        type: "accounts";
        id: string;
      };
      links: {
        related: string;
      };
    };
    transferAccount: {
      data: {
        type: "accounts";
        id: string;
      } | null;
      links: {
        related: string;
      };
    };
    category: {
      data: {
        type: "categories";
        id: string;
      } | null;
      links: {
        self: string;
        related: string;
      };
    };
    parentCategory: {
      data: {
        type: "categories";
        id: string;
      } | null;
      links: {
        related: string;
      };
    };
    tags: {
      data: Array<{
        type: "tags";
        id: string;
      }>;
      links: {
        self: string;
      };
    };
  };
  links: {
    self: string;
  };
}

export interface UpCategory {
  type: "categories";
  id: string;
  attributes: {
    name: string;
  };
  relationships: {
    parent: {
      data: {
        type: "categories";
        id: string;
      } | null;
      links: {
        related: string;
      };
    };
    children: {
      data: Array<{
        type: "categories";
        id: string;
      }>;
      links: {
        related: string;
      };
    };
  };
  links: {
    self: string;
  };
}

export interface UpPaginatedResponse<T> {
  data: T[];
  links: {
    prev: string | null;
    next: string | null;
  };
}

export interface UpApiError {
  errors: Array<{
    status: string;
    title: string;
    detail: string;
    source?: {
      parameter?: string;
      pointer?: string;
    };
  }>;
}

class UpApiClient {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const response = await fetch(`${UP_API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error: UpApiError = await response.json();
      throw new Error(error.errors[0]?.detail || "UP API request failed");
    }

    // 204 No Content has no body (e.g., addTags, removeTags)
    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  }

  /**
   * Verify the token is valid by pinging the API
   */
  async ping(): Promise<{ meta: { id: string; statusEmoji: string } }> {
    return this.request("/util/ping");
  }

  /**
   * Get all accounts
   */
  async getAccounts(
    params: {
      pageSize?: number;
      filterAccountType?: "SAVER" | "TRANSACTIONAL" | "HOME_LOAN";
      filterOwnershipType?: "INDIVIDUAL" | "JOINT";
    } = {}
  ): Promise<UpPaginatedResponse<UpAccount>> {
    const searchParams = new URLSearchParams();
    if (params.pageSize) searchParams.set("page[size]", params.pageSize.toString());
    if (params.filterAccountType) searchParams.set("filter[accountType]", params.filterAccountType);
    if (params.filterOwnershipType) searchParams.set("filter[ownershipType]", params.filterOwnershipType);

    const query = searchParams.toString();
    return this.request(`/accounts${query ? `?${query}` : ""}`);
  }

  /**
   * Get a single account by ID
   */
  async getAccount(id: string): Promise<{ data: UpAccount }> {
    return this.request(`/accounts/${id}`);
  }

  /**
   * Get all transactions
   */
  async getTransactions(
    params: {
      pageSize?: number;
      filterStatus?: "HELD" | "SETTLED";
      filterSince?: string; // ISO 8601 date-time
      filterUntil?: string; // ISO 8601 date-time
      filterCategory?: string;
      filterTag?: string;
    } = {}
  ): Promise<UpPaginatedResponse<UpTransaction>> {
    const searchParams = new URLSearchParams();
    if (params.pageSize) searchParams.set("page[size]", params.pageSize.toString());
    if (params.filterStatus) searchParams.set("filter[status]", params.filterStatus);
    if (params.filterSince) searchParams.set("filter[since]", params.filterSince);
    if (params.filterUntil) searchParams.set("filter[until]", params.filterUntil);
    if (params.filterCategory) searchParams.set("filter[category]", params.filterCategory);
    if (params.filterTag) searchParams.set("filter[tag]", params.filterTag);

    const query = searchParams.toString();
    return this.request(`/transactions${query ? `?${query}` : ""}`);
  }

  /**
   * Get transactions for a specific account
   */
  async getAccountTransactions(
    accountId: string,
    params: {
      pageSize?: number;
      filterStatus?: "HELD" | "SETTLED";
      filterSince?: string;
      filterUntil?: string;
      filterCategory?: string;
      filterTag?: string;
    } = {}
  ): Promise<UpPaginatedResponse<UpTransaction>> {
    const searchParams = new URLSearchParams();
    if (params.pageSize) searchParams.set("page[size]", params.pageSize.toString());
    if (params.filterStatus) searchParams.set("filter[status]", params.filterStatus);
    if (params.filterSince) searchParams.set("filter[since]", params.filterSince);
    if (params.filterUntil) searchParams.set("filter[until]", params.filterUntil);
    if (params.filterCategory) searchParams.set("filter[category]", params.filterCategory);
    if (params.filterTag) searchParams.set("filter[tag]", params.filterTag);

    const query = searchParams.toString();
    return this.request(`/accounts/${accountId}/transactions${query ? `?${query}` : ""}`);
  }

  /**
   * Get a single transaction by ID
   */
  async getTransaction(id: string): Promise<{ data: UpTransaction }> {
    return this.request(`/transactions/${id}`);
  }

  /**
   * Get all categories
   */
  async getCategories(
    params: { filterParent?: string } = {}
  ): Promise<UpPaginatedResponse<UpCategory>> {
    const searchParams = new URLSearchParams();
    if (params.filterParent) searchParams.set("filter[parent]", params.filterParent);

    const query = searchParams.toString();
    return this.request(`/categories${query ? `?${query}` : ""}`);
  }

  /**
   * Get a single category by ID
   */
  async getCategory(id: string): Promise<{ data: UpCategory }> {
    return this.request(`/categories/${id}`);
  }

  /**
   * Categorize a transaction
   */
  async categorizeTransaction(
    transactionId: string,
    categoryId: string | null
  ): Promise<void> {
    await this.request(`/transactions/${transactionId}/relationships/category`, {
      method: "PATCH",
      body: JSON.stringify({
        data: categoryId ? { type: "categories", id: categoryId } : null,
      }),
    });
  }

  /**
   * Add tags to a transaction
   */
  async addTags(
    transactionId: string,
    tags: string[]
  ): Promise<void> {
    await this.request(`/transactions/${transactionId}/relationships/tags`, {
      method: "POST",
      body: JSON.stringify({
        data: tags.map((tag) => ({ type: "tags", id: tag })),
      }),
    });
  }

  /**
   * Remove tags from a transaction
   */
  async removeTags(
    transactionId: string,
    tags: string[]
  ): Promise<void> {
    await this.request(`/transactions/${transactionId}/relationships/tags`, {
      method: "DELETE",
      body: JSON.stringify({
        data: tags.map((tag) => ({ type: "tags", id: tag })),
      }),
    });
  }

  /**
   * Get all pages of a paginated response
   */
  async getAllPages<T>(
    initialResponse: UpPaginatedResponse<T>
  ): Promise<T[]> {
    let allData = [...initialResponse.data];
    let nextUrl = initialResponse.links.next;
    let pageCount = 0;

    while (nextUrl && pageCount < MAX_PAGES) {
      validateUpApiUrl(nextUrl);
      const response = await fetch(nextUrl, {
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch next page");
      }

      const data: UpPaginatedResponse<T> = await response.json();
      allData = [...allData, ...data.data];
      nextUrl = data.links.next;
      pageCount++;
    }

    if (pageCount >= MAX_PAGES && nextUrl) {
      console.warn(`Pagination stopped at MAX_PAGES limit (${MAX_PAGES}). Some data may be missing.`);
    }

    return allData;
  }
}

export function createUpApiClient(token: string): UpApiClient {
  return new UpApiClient(token);
}

export type { UpApiClient };
