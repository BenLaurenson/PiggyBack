import { describe, it, expect, vi } from "vitest";
import { slugify, generateUniqueSlug, insertBudgetWithSlugRetry } from "../slugify";

// =====================================================
// slugify() — pure string transformation
// =====================================================
describe("slugify", () => {
  it("converts basic name to lowercase kebab-case", () => {
    expect(slugify("My Budget")).toBe("my-budget");
  });

  it("replaces ampersands with 'and'", () => {
    expect(slugify("Food & Dining")).toBe("food-and-dining");
  });

  it("strips special characters", () => {
    expect(slugify("Ben's Budget!")).toBe("bens-budget");
  });

  it("preserves numbers", () => {
    expect(slugify("Budget #2")).toBe("budget-2");
  });

  it("handles slashes in names like 50/30/20", () => {
    expect(slugify("50/30/20 Budget")).toBe("503020-budget");
  });

  it("collapses multiple spaces into single hyphens", () => {
    expect(slugify("My   Budget")).toBe("my-budget");
  });

  it("collapses multiple hyphens", () => {
    expect(slugify("My -- Budget")).toBe("my-budget");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugify(" -My Budget- ")).toBe("my-budget");
  });

  it("handles emoji in names", () => {
    expect(slugify("💰 My Budget")).toBe("my-budget");
  });

  it("returns 'budget' for empty string", () => {
    expect(slugify("")).toBe("budget");
  });

  it("returns 'budget' for string with only special chars", () => {
    expect(slugify("!@#$%")).toBe("budget");
  });

  it("truncates slugs longer than 80 characters on hyphen boundary", () => {
    const longName = "this is a very long budget name that should be truncated because it exceeds the eighty character limit for url slugs";
    const result = slugify(longName);
    expect(result.length).toBeLessThanOrEqual(80);
    expect(result.endsWith("-")).toBe(false);
  });

  it("handles mixed case", () => {
    expect(slugify("My PERSONAL Budget")).toBe("my-personal-budget");
  });

  it("handles curly quotes and apostrophes", () => {
    expect(slugify("Ben\u2019s Budget")).toBe("bens-budget");
    expect(slugify("Ben\u2018s Budget")).toBe("bens-budget");
  });
});

// =====================================================
// generateUniqueSlug() — collision handling
// =====================================================
describe("generateUniqueSlug", () => {
  // The mock returns data via thenable, matching how Supabase query chains work.
  function mockSupabaseAsync(existingSlugs: string[]) {
    const data = existingSlugs.map((s) => ({ slug: s }));
    const queryBuilder = {
      select: () => queryBuilder,
      eq: () => queryBuilder,
      like: () => queryBuilder,
      neq: () => queryBuilder,
      then: (resolve: (val: { data: typeof data }) => void) => {
        resolve({ data });
      },
    };
    return {
      from: () => queryBuilder,
    };
  }

  it("returns base slug when no collisions", async () => {
    const supabase = mockSupabaseAsync([]);
    const slug = await generateUniqueSlug(supabase, "p1", "My Budget");
    expect(slug).toBe("my-budget");
  });

  it("appends counter and random suffix when base slug is taken", async () => {
    const supabase = mockSupabaseAsync(["my-budget"]);
    const slug = await generateUniqueSlug(supabase, "p1", "My Budget");
    // Format: my-budget-2-<4 hex chars>
    expect(slug).toMatch(/^my-budget-2-[a-f0-9]{4}$/);
  });

  it("appends counter and random suffix when -2 is also taken", async () => {
    const supabase = mockSupabaseAsync(["my-budget", "my-budget-2"]);
    const slug = await generateUniqueSlug(supabase, "p1", "My Budget");
    expect(slug).toMatch(/^my-budget-3-[a-f0-9]{4}$/);
  });

  it("handles many collisions", async () => {
    const existing = ["my-budget"];
    for (let i = 2; i <= 10; i++) existing.push(`my-budget-${i}`);
    const supabase = mockSupabaseAsync(existing);
    const slug = await generateUniqueSlug(supabase, "p1", "My Budget");
    expect(slug).toMatch(/^my-budget-11-[a-f0-9]{4}$/);
  });

  it("produces different random suffixes on repeated calls", async () => {
    const supabase = mockSupabaseAsync(["my-budget"]);
    const slugs = new Set<string>();
    for (let i = 0; i < 10; i++) {
      slugs.add(await generateUniqueSlug(supabase, "p1", "My Budget"));
    }
    // With 4 hex chars (65536 possibilities), 10 calls should produce at least 2 distinct slugs
    expect(slugs.size).toBeGreaterThan(1);
  });

  it("uses 'budget' fallback for empty name", async () => {
    const supabase = mockSupabaseAsync([]);
    const slug = await generateUniqueSlug(supabase, "p1", "");
    expect(slug).toBe("budget");
  });
});

// =====================================================
// insertBudgetWithSlugRetry() — retry on unique violation
// =====================================================
describe("insertBudgetWithSlugRetry", () => {
  function mockSupabaseForInsert(
    existingSlugs: string[],
    insertBehavior: (row: Record<string, unknown>) => { data: Record<string, unknown> | null; error: { code: string; message: string } | null }
  ) {
    const data = existingSlugs.map((s) => ({ slug: s }));
    const queryBuilder = {
      select: () => queryBuilder,
      eq: () => queryBuilder,
      like: () => queryBuilder,
      neq: () => queryBuilder,
      then: (resolve: (val: { data: typeof data }) => void) => {
        resolve({ data });
      },
    };

    return {
      from: (table: string) => {
        if (table === "user_budgets") {
          return {
            // For SELECT queries (used by generateUniqueSlug)
            select: () => queryBuilder,
            // For INSERT queries (used by insertBudgetWithSlugRetry)
            insert: (row: Record<string, unknown>) => ({
              select: () => ({
                single: () => insertBehavior(row),
              }),
            }),
          };
        }
        return { select: () => queryBuilder };
      },
    };
  }

  it("succeeds on first attempt when no collision", async () => {
    const supabase = mockSupabaseForInsert([], (row) => ({
      data: { id: "1", ...row },
      error: null,
    }));

    const { data, error } = await insertBudgetWithSlugRetry(
      supabase,
      { name: "Test" },
      "p1",
      "My Budget"
    );

    expect(error).toBeNull();
    expect(data).toBeTruthy();
    expect((data as any).slug).toBe("my-budget");
  });

  it("retries on unique constraint violation (23505)", async () => {
    let attempt = 0;
    const supabase = mockSupabaseForInsert([], (row) => {
      attempt++;
      if (attempt === 1) {
        return { data: null, error: { code: "23505", message: "duplicate key" } };
      }
      return { data: { id: "1", ...row }, error: null };
    });

    const { data, error } = await insertBudgetWithSlugRetry(
      supabase,
      { name: "Test" },
      "p1",
      "My Budget"
    );

    expect(error).toBeNull();
    expect(data).toBeTruthy();
    expect(attempt).toBe(2);
    // Retry slug should be a random suffix variant
    expect((data as any).slug).toMatch(/^my-budget-[a-f0-9]{4}$/);
  });

  it("gives up after maxRetries", async () => {
    const supabase = mockSupabaseForInsert([], () => ({
      data: null,
      error: { code: "23505", message: "duplicate key" },
    }));

    const { data, error } = await insertBudgetWithSlugRetry(
      supabase,
      { name: "Test" },
      "p1",
      "My Budget",
      undefined,
      2 // maxRetries
    );

    expect(data).toBeNull();
    expect(error).toBeTruthy();
    expect((error as any).code).toBe("23505");
  });

  it("does not retry on non-23505 errors", async () => {
    let attempt = 0;
    const supabase = mockSupabaseForInsert([], () => {
      attempt++;
      return { data: null, error: { code: "42501", message: "permission denied" } };
    });

    const { data, error } = await insertBudgetWithSlugRetry(
      supabase,
      { name: "Test" },
      "p1",
      "My Budget"
    );

    expect(attempt).toBe(1);
    expect(data).toBeNull();
    expect((error as any).code).toBe("42501");
  });
});
