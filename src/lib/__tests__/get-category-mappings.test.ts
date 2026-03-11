import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock react cache to pass through (no actual React server context in tests)
vi.mock("react", () => ({
  cache: (fn: any) => fn,
}));

describe("getCategoryMappings", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("should query category_mappings table with correct select and limit", async () => {
    const mockLimit = vi.fn().mockResolvedValue({
      data: [
        { up_category_id: "cat-1", new_parent_name: "Food", new_child_name: "Groceries", icon: "🛒", display_order: 1 },
      ],
      error: null,
    });
    const mockSelect = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ select: mockSelect });
    const mockSupabase = { from: mockFrom } as any;

    const { getCategoryMappings } = await import("../get-category-mappings");
    const result = await getCategoryMappings(mockSupabase);

    expect(mockFrom).toHaveBeenCalledWith("category_mappings");
    expect(mockSelect).toHaveBeenCalledWith(
      "up_category_id, new_parent_name, new_child_name, icon, display_order"
    );
    expect(mockLimit).toHaveBeenCalledWith(200);
    expect(result.data).toHaveLength(1);
    expect(result.data![0].new_parent_name).toBe("Food");
  });

  it("should return error when query fails", async () => {
    const mockLimit = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "Connection failed" },
    });
    const mockSelect = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ select: mockSelect });
    const mockSupabase = { from: mockFrom } as any;

    const { getCategoryMappings } = await import("../get-category-mappings");
    const result = await getCategoryMappings(mockSupabase);

    expect(result.data).toBeNull();
    expect(result.error).toBeDefined();
  });
});

describe("buildCategoryLookup", () => {
  it("should build a Map from category_id to parent/child names", async () => {
    const { buildCategoryLookup } = await import("../get-category-mappings");
    const mappings = [
      { up_category_id: "cat-1", new_parent_name: "Food", new_child_name: "Groceries" },
      { up_category_id: "cat-2", new_parent_name: "Transport", new_child_name: "Fuel" },
      { up_category_id: "cat-3", new_parent_name: "Food", new_child_name: "Dining" },
    ];

    const lookup = buildCategoryLookup(mappings);

    expect(lookup.size).toBe(3);
    expect(lookup.get("cat-1")).toEqual({ parent: "Food", child: "Groceries" });
    expect(lookup.get("cat-2")).toEqual({ parent: "Transport", child: "Fuel" });
    expect(lookup.get("cat-3")).toEqual({ parent: "Food", child: "Dining" });
  });

  it("should return empty Map for empty input", async () => {
    const { buildCategoryLookup } = await import("../get-category-mappings");
    const lookup = buildCategoryLookup([]);
    expect(lookup.size).toBe(0);
  });

  it("should overwrite duplicate category_ids (last one wins)", async () => {
    const { buildCategoryLookup } = await import("../get-category-mappings");
    const mappings = [
      { up_category_id: "cat-1", new_parent_name: "Food", new_child_name: "Groceries" },
      { up_category_id: "cat-1", new_parent_name: "Food", new_child_name: "Supermarket" },
    ];

    const lookup = buildCategoryLookup(mappings);
    expect(lookup.size).toBe(1);
    expect(lookup.get("cat-1")).toEqual({ parent: "Food", child: "Supermarket" });
  });
});
