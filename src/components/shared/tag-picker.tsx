"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Plus, X, Tag as TagIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  addTag,
  removeTag,
  suggestTags,
  type EntityType,
  type TagSuggestion,
} from "@/app/actions/entity-tags";

// ----------------------------------------------------------------------------
// Props
// ----------------------------------------------------------------------------

export interface TagPickerProps {
  entityType: EntityType;
  entityId: string;
  /** Tags currently on the entity (lower-cased). Optimistic UI updates locally. */
  initialTags?: string[];
  /** Optional callback fired when tags change (after server confirms). */
  onChange?: (tags: string[]) => void;
  /** Compact mode hides the "Add tag" trigger label, just shows a "+" button. */
  compact?: boolean;
  /** Tone of the tag chips. Defaults to "lavender" to match the activity modal. */
  tone?: "lavender" | "blue" | "mint";
  className?: string;
}

const TONE_STYLES: Record<NonNullable<TagPickerProps["tone"]>, { bg: string; fg: string }> = {
  lavender: { bg: "var(--pastel-lavender-light)", fg: "var(--pastel-lavender-dark)" },
  blue: { bg: "var(--pastel-blue-light)", fg: "var(--pastel-blue-dark)" },
  mint: { bg: "var(--pastel-mint-light)", fg: "var(--pastel-mint-dark)" },
};

// ----------------------------------------------------------------------------
// Component
// ----------------------------------------------------------------------------

export function TagPicker({
  entityType,
  entityId,
  initialTags = [],
  onChange,
  compact = false,
  tone = "lavender",
  className,
}: TagPickerProps) {
  const [tags, setTags] = useState<string[]>(() =>
    Array.from(new Set(initialTags.map((t) => t.toLowerCase())))
  );
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<TagSuggestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const toneStyle = TONE_STYLES[tone];

  // Debounced suggestion fetch.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const handle = setTimeout(async () => {
      try {
        const results = await suggestTags(entityType, query, 8);
        if (cancelled) return;
        // Filter out tags the entity already has.
        const filtered = results.filter((s) => !tags.includes(s.tag));
        setSuggestions(filtered);
      } catch (err) {
        console.error("[tag-picker] suggestion fetch failed:", err);
      }
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [open, query, entityType, tags]);

  // Auto-focus the input whenever the popover opens. Reset state happens in the
  // onOpenChange handler below to keep this effect side-effect-free per
  // react-hooks/set-state-in-effect.
  useEffect(() => {
    if (open) {
      // Defer to next frame so Radix has portaled the content.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setQuery("");
      setError(null);
    }
  };

  const trimmed = useMemo(() => query.trim().toLowerCase(), [query]);
  const canCreate =
    trimmed.length > 0 &&
    trimmed.length <= 50 &&
    !tags.includes(trimmed) &&
    !suggestions.some((s) => s.tag === trimmed);

  const commitAdd = (raw: string) => {
    const normalized = raw.trim().toLowerCase();
    if (!normalized) return;
    if (tags.includes(normalized)) {
      setQuery("");
      return;
    }
    if (normalized.length > 50) {
      setError("Tag too long (max 50 chars)");
      return;
    }

    // Optimistic update.
    const next = [...tags, normalized];
    setTags(next);
    setQuery("");
    setError(null);
    onChange?.(next);

    startTransition(async () => {
      const result = await addTag(entityType, entityId, normalized);
      if ("error" in result) {
        setError(result.error);
        const reverted = tags.filter((t) => t !== normalized);
        setTags(reverted);
        onChange?.(reverted);
      }
    });
  };

  const commitRemove = (tag: string) => {
    const next = tags.filter((t) => t !== tag);
    setTags(next);
    onChange?.(next);
    startTransition(async () => {
      const result = await removeTag(entityType, entityId, tag);
      if ("error" in result) {
        setError(result.error);
        // Re-add on failure.
        setTags((prev) => (prev.includes(tag) ? prev : [...prev, tag]));
      }
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (canCreate) commitAdd(trimmed);
      else if (suggestions.length > 0) commitAdd(suggestions[0].tag);
    } else if (e.key === "Escape") {
      handleOpenChange(false);
    }
  };

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((tag) => (
          <Badge
            key={tag}
            className="rounded-full text-xs font-[family-name:var(--font-dm-sans)] flex items-center gap-1 pl-2 pr-1"
            style={{ backgroundColor: toneStyle.bg, color: toneStyle.fg }}
          >
            <span>{tag}</span>
            <button
              type="button"
              onClick={() => commitRemove(tag)}
              disabled={pending}
              aria-label={`Remove tag ${tag}`}
              className="ml-0.5 rounded-full hover:bg-black/10 p-0.5 transition-colors cursor-pointer disabled:opacity-50"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}

        <Popover open={open} onOpenChange={handleOpenChange}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full h-7 px-2 text-xs gap-1 cursor-pointer"
              style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
            >
              <Plus className="h-3 w-3" />
              {!compact && <span>Add tag</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-3">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <TagIcon className="h-3.5 w-3.5" style={{ color: "var(--text-tertiary)" }} />
                <Input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type or pick a tag…"
                  className="h-8 text-sm"
                  maxLength={50}
                />
              </div>

              {error && (
                <p className="text-xs" style={{ color: "var(--pastel-coral-dark)" }}>
                  {error}
                </p>
              )}

              <div className="max-h-56 overflow-y-auto -mx-1">
                {canCreate && (
                  <button
                    type="button"
                    onClick={() => commitAdd(trimmed)}
                    className="w-full text-left px-2 py-1.5 rounded-md text-xs flex items-center gap-2 hover:bg-black/5 cursor-pointer"
                  >
                    <Plus className="h-3 w-3" />
                    <span>
                      Create <strong>{trimmed}</strong>
                    </span>
                  </button>
                )}
                {suggestions.length === 0 && !canCreate && (
                  <p className="px-2 py-2 text-xs" style={{ color: "var(--text-tertiary)" }}>
                    {query.length > 0 ? "No matching tags" : "Start typing to see suggestions"}
                  </p>
                )}
                {suggestions.map((s) => (
                  <button
                    key={s.tag}
                    type="button"
                    onClick={() => commitAdd(s.tag)}
                    className="w-full text-left px-2 py-1.5 rounded-md text-xs flex items-center justify-between gap-2 hover:bg-black/5 cursor-pointer"
                  >
                    <span className="truncate">{s.tag}</span>
                    <span
                      className="text-[10px] uppercase tracking-wider"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      {s.source === "previous" ? "Used before" : "From Up Bank"}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
