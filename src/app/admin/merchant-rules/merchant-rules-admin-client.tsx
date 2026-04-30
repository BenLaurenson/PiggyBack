"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Category = {
  id: string;
  name: string;
  parent_category_id: string | null;
};

type Rule = {
  id: string;
  merchant_pattern: string;
  category_id: string;
  parent_category_id: string | null;
  source: "curated" | "user-suggested" | "promoted";
  suggested_by_user_id: string | null;
  notes: string | null;
  is_active: boolean;
  last_applied_at: string | null;
  applied_count: number;
  created_at: string;
  updated_at: string;
};

type Suggestion = {
  merchant_description: string;
  category_id: string;
  parent_category_id: string | null;
  vote_count: number;
  first_suggested_at: string;
  most_recent_apply_at: string | null;
  sample_user_ids: string[];
};

interface Props {
  categories: Category[];
}

export function MerchantRulesAdminClient({ categories }: Props) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [query, setQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<Record<string, string>>({});

  const [showAdd, setShowAdd] = useState(false);
  const [newPattern, setNewPattern] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newNotes, setNewNotes] = useState("");

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(true);

  const categoriesById = useMemo(() => {
    const map = new Map<string, Category>();
    for (const c of categories) map.set(c.id, c);
    return map;
  }, [categories]);

  // Children-only categories (have a parent) make sense as the default
  // category_id for a rule. Top-level groups appear as parent options.
  const leafCategories = useMemo(
    () =>
      categories.filter((c) => c.parent_category_id !== null).sort((a, b) =>
        a.name.localeCompare(b.name)
      ),
    [categories]
  );

  async function loadRules() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (query) params.set("q", query);
      const res = await fetch(`/api/admin/merchant-rules?${params}`);
      if (!res.ok) throw new Error("Failed to load rules");
      const json = await res.json();
      setRules(json.rules);
      setTotal(json.total);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function loadSuggestions() {
    try {
      const res = await fetch("/api/admin/merchant-rules/suggestions");
      if (!res.ok) return;
      const json = await res.json();
      setSuggestions(json.suggestions || []);
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => {
    loadRules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, query]);

  useEffect(() => {
    loadSuggestions();
  }, []);

  async function saveCategory(rule: Rule) {
    const newCategoryId = editing[rule.id];
    if (!newCategoryId || newCategoryId === rule.category_id) {
      setEditing((e) => {
        const c = { ...e };
        delete c[rule.id];
        return c;
      });
      return;
    }
    const cat = categoriesById.get(newCategoryId);
    const parentId = cat?.parent_category_id || null;

    const res = await fetch(`/api/admin/merchant-rules/${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category_id: newCategoryId,
        parent_category_id: parentId,
      }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error || "Failed to update rule");
      return;
    }
    setEditing((e) => {
      const c = { ...e };
      delete c[rule.id];
      return c;
    });
    await loadRules();
  }

  async function toggleActive(rule: Rule) {
    const res = await fetch(`/api/admin/merchant-rules/${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !rule.is_active }),
    });
    if (!res.ok) {
      setError("Failed to toggle rule");
      return;
    }
    await loadRules();
  }

  async function deleteRule(rule: Rule) {
    if (!confirm(`Delete rule for "${rule.merchant_pattern}"?`)) return;
    const res = await fetch(`/api/admin/merchant-rules/${rule.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      setError("Failed to delete rule");
      return;
    }
    await loadRules();
  }

  async function createRule(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!newPattern.trim() || !newCategory) {
      setError("Pattern and category are required");
      return;
    }
    const cat = categoriesById.get(newCategory);
    const parentId = cat?.parent_category_id || null;
    const res = await fetch("/api/admin/merchant-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        merchant_pattern: newPattern.trim(),
        category_id: newCategory,
        parent_category_id: parentId,
        notes: newNotes.trim() || null,
      }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error || "Failed to create rule");
      return;
    }
    setNewPattern("");
    setNewCategory("");
    setNewNotes("");
    setShowAdd(false);
    await loadRules();
  }

  async function promoteSuggestion(s: Suggestion) {
    const res = await fetch("/api/admin/merchant-rules/suggestions/promote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        merchant_pattern: s.merchant_description,
        category_id: s.category_id,
        parent_category_id: s.parent_category_id,
      }),
    });
    if (!res.ok) {
      setError("Failed to promote suggestion");
      return;
    }
    await Promise.all([loadRules(), loadSuggestions()]);
  }

  async function rejectSuggestion(s: Suggestion) {
    if (!confirm(`Reject suggestion for "${s.merchant_description}"?`)) return;
    const res = await fetch("/api/admin/merchant-rules/suggestions/promote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        merchant_pattern: s.merchant_description,
        category_id: s.category_id,
        reject: true,
      }),
    });
    if (!res.ok) {
      setError("Failed to reject suggestion");
      return;
    }
    await loadSuggestions();
  }

  function formatRelative(iso: string | null): string {
    if (!iso) return "Never";
    const then = new Date(iso).getTime();
    const now = Date.now();
    const diffMs = now - then;
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(iso).toLocaleDateString();
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      {/* Suggestion queue */}
      {suggestions.length > 0 ? (
        <section className="rounded-2xl border bg-card p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-[family-name:var(--font-nunito)] font-bold text-lg">
              User-suggested rules ({suggestions.length})
            </h2>
            <button
              onClick={() => setShowSuggestions((v) => !v)}
              className="text-xs underline text-muted-foreground"
            >
              {showSuggestions ? "Hide" : "Show"}
            </button>
          </div>
          {showSuggestions ? (
            <ul className="divide-y">
              {suggestions.map((s) => (
                <li
                  key={s.merchant_description}
                  className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                >
                  <div>
                    <p className="font-bold">
                      {s.merchant_description}{" "}
                      <span className="ml-2 text-xs text-muted-foreground font-normal">
                        x{s.vote_count} user
                        {s.vote_count === 1 ? "" : "s"}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Suggested category:{" "}
                      <code>{s.category_id}</code>
                      {" - "}
                      first suggested {formatRelative(s.first_suggested_at)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => promoteSuggestion(s)}
                      data-testid="promote-btn"
                    >
                      Promote
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => rejectSuggestion(s)}
                    >
                      Reject
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {/* Search + add */}
      <section className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setQuery(searchInput.trim());
          }}
          className="flex gap-2 flex-1 max-w-md"
        >
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by pattern…"
          />
          <Button type="submit" variant="outline">
            Search
          </Button>
          {query ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setSearchInput("");
                setQuery("");
                setPage(1);
              }}
            >
              Clear
            </Button>
          ) : null}
        </form>
        <Button onClick={() => setShowAdd((v) => !v)}>
          {showAdd ? "Cancel" : "Add new rule"}
        </Button>
      </section>

      {/* Add new */}
      {showAdd ? (
        <form
          onSubmit={createRule}
          className="rounded-2xl border bg-card p-4 sm:p-5 space-y-3"
        >
          <div>
            <label className="text-xs uppercase tracking-wide text-muted-foreground block mb-1">
              Merchant pattern (case-insensitive substring match)
            </label>
            <Input
              value={newPattern}
              onChange={(e) => setNewPattern(e.target.value)}
              placeholder="e.g. ALDI"
              required
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-muted-foreground block mb-1">
              Category
            </label>
            <select
              className="w-full h-10 rounded-md border bg-background px-3 text-sm"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              required
            >
              <option value="">Select a category…</option>
              {leafCategories.map((c) => {
                const parent = c.parent_category_id
                  ? categoriesById.get(c.parent_category_id)
                  : null;
                return (
                  <option key={c.id} value={c.id}>
                    {parent ? `${parent.name} > ${c.name}` : c.name} ({c.id})
                  </option>
                );
              })}
            </select>
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-muted-foreground block mb-1">
              Notes (optional)
            </label>
            <Input
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit">Create rule</Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowAdd(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {/* Rules table */}
      <section className="rounded-2xl border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <p className="text-sm">
            {loading ? "Loading…" : `${total} rules`}
          </p>
          <div className="flex items-center gap-2 text-sm">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
            >
              Prev
            </Button>
            <span>
              Page {page} of {totalPages}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
            >
              Next
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground bg-muted/40">
                <th className="px-3 py-2">Pattern</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2">Last applied</th>
                <th className="px-3 py-2">Applied #</th>
                <th className="px-3 py-2">Active</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rules.map((rule) => {
                const isEditing = rule.id in editing;
                const currentCat = categoriesById.get(rule.category_id);
                return (
                  <tr key={rule.id} data-testid={`rule-row-${rule.id}`}>
                    <td className="px-3 py-2 font-medium">
                      {rule.merchant_pattern}
                    </td>
                    <td className="px-3 py-2">
                      {isEditing ? (
                        <div className="flex gap-1">
                          <select
                            className="h-9 rounded-md border bg-background px-2 text-xs"
                            value={editing[rule.id]}
                            onChange={(e) =>
                              setEditing((m) => ({
                                ...m,
                                [rule.id]: e.target.value,
                              }))
                            }
                          >
                            {leafCategories.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name} ({c.id})
                              </option>
                            ))}
                          </select>
                          <Button
                            size="sm"
                            onClick={() => saveCategory(rule)}
                            data-testid={`save-${rule.id}`}
                          >
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setEditing((e) => {
                                const c = { ...e };
                                delete c[rule.id];
                                return c;
                              })
                            }
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <button
                          className="text-left hover:underline"
                          onClick={() =>
                            setEditing((m) => ({
                              ...m,
                              [rule.id]: rule.category_id,
                            }))
                          }
                          data-testid={`edit-${rule.id}`}
                        >
                          {currentCat?.name || rule.category_id}{" "}
                          <span className="text-xs text-muted-foreground">
                            ({rule.category_id})
                          </span>
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-muted">
                        {rule.source}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {formatRelative(rule.last_applied_at)}
                    </td>
                    <td className="px-3 py-2 text-xs">{rule.applied_count}</td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => toggleActive(rule)}
                        className="text-xs underline"
                      >
                        {rule.is_active ? "Yes" : "No"}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deleteRule(rule)}
                      >
                        Delete
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {rules.length === 0 && !loading ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-8 text-center text-sm text-muted-foreground"
                  >
                    No rules found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
