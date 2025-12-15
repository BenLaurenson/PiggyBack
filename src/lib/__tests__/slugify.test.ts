import { describe, it, expect, vi } from "vitest";
import { slugify, generateUniqueSlug } from "../slugify";

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
  function mockSupabase(existingSlugs: string[]) {
    return {
      from: () => ({
        select: () => ({
          eq: function () { return this; },
          like: function () { return this; },
          neq: function () { return this; },
          then: undefined,
          data: existingSlugs.map((s) => ({ slug: s })),
        }),
      }),
    };
  }

  // The mock above returns data synchronously, but generateUniqueSlug
  // awaits the query chain. We need to return a thenable.
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

  it("appends -2 when base slug is taken", async () => {
    const supabase = mockSupabaseAsync(["my-budget"]);
    const slug = await generateUniqueSlug(supabase, "p1", "My Budget");
    expect(slug).toBe("my-budget-2");
  });

  it("appends -3 when -2 is also taken", async () => {
    const supabase = mockSupabaseAsync(["my-budget", "my-budget-2"]);
    const slug = await generateUniqueSlug(supabase, "p1", "My Budget");
    expect(slug).toBe("my-budget-3");
  });

  it("handles many collisions", async () => {
    const existing = ["my-budget"];
    for (let i = 2; i <= 10; i++) existing.push(`my-budget-${i}`);
    const supabase = mockSupabaseAsync(existing);
    const slug = await generateUniqueSlug(supabase, "p1", "My Budget");
    expect(slug).toBe("my-budget-11");
  });

  it("uses 'budget' fallback for empty name", async () => {
    const supabase = mockSupabaseAsync([]);
    const slug = await generateUniqueSlug(supabase, "p1", "");
    expect(slug).toBe("budget");
  });
});
