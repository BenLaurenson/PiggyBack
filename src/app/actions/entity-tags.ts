"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { demoActionGuard } from "@/lib/demo-guard";
import { safeErrorMessage } from "@/lib/safe-error";

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

export type EntityType = "transaction" | "goal" | "investment";

const VALID_ENTITY_TYPES: EntityType[] = ["transaction", "goal", "investment"];

const MAX_TAG_LENGTH = 50;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ----------------------------------------------------------------------------
// Validation helpers
// ----------------------------------------------------------------------------

function isEntityType(value: unknown): value is EntityType {
  return typeof value === "string" && (VALID_ENTITY_TYPES as string[]).includes(value);
}

function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase();
}

function validateInputs(
  entityType: unknown,
  entityId: unknown,
  tagName: unknown
): { error: string } | { entityType: EntityType; entityId: string; tagName: string } {
  if (!isEntityType(entityType)) {
    return { error: "Invalid entity type" };
  }
  if (typeof entityId !== "string" || !UUID_RE.test(entityId)) {
    return { error: "Invalid entity id" };
  }
  if (typeof tagName !== "string") {
    return { error: "Invalid tag" };
  }
  const normalized = normalizeTag(tagName);
  if (normalized.length === 0 || normalized.length > MAX_TAG_LENGTH) {
    return { error: `Tag must be 1-${MAX_TAG_LENGTH} characters` };
  }
  return { entityType, entityId, tagName: normalized };
}

function revalidateForEntity(entityType: EntityType, entityId: string) {
  // Best-effort: revalidate the relevant paths so server components refetch.
  switch (entityType) {
    case "transaction":
      revalidatePath("/activity");
      revalidatePath(`/activity/${entityId}`);
      break;
    case "goal":
      revalidatePath("/goals");
      revalidatePath(`/goals/${entityId}`);
      revalidatePath("/home");
      break;
    case "investment":
      revalidatePath("/invest");
      revalidatePath(`/invest/${entityId}`);
      break;
  }
}

// ----------------------------------------------------------------------------
// addTag
// ----------------------------------------------------------------------------

/**
 * Attach a tag to a transaction, goal, or investment.
 *
 * Writes to `entity_tags` for all entity types, and ALSO mirrors transaction
 * tags into the legacy `transaction_tags` table during the transition window
 * so existing queries (activity feed, AI tools, etc.) keep working.
 */
export async function addTag(
  entityType: EntityType,
  entityId: string,
  tagName: string
): Promise<{ success: true; tag: string } | { error: string }> {
  const blocked = demoActionGuard();
  if (blocked) return blocked;

  const validated = validateInputs(entityType, entityId, tagName);
  if ("error" in validated) return validated;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Ensure the canonical tags table has a row (for legacy FK on transaction_tags).
  await supabase.from("tags").upsert({ name: validated.tagName }, { onConflict: "name" });

  // Write the polymorphic row. RLS verifies entity ownership.
  const { error: entityError } = await supabase.from("entity_tags").upsert(
    {
      entity_type: validated.entityType,
      entity_id: validated.entityId,
      tag_name: validated.tagName,
      user_id: user.id,
    },
    { onConflict: "entity_type,entity_id,tag_name" }
  );

  if (entityError) {
    return { error: safeErrorMessage(entityError, "Failed to add tag") };
  }

  // Back-compat: keep transaction_tags in sync for the transaction case.
  if (validated.entityType === "transaction") {
    const { error: legacyError } = await supabase.from("transaction_tags").upsert(
      { transaction_id: validated.entityId, tag_name: validated.tagName },
      { onConflict: "transaction_id,tag_name" }
    );
    if (legacyError) {
      // Don't fail the request — entity_tags is the source of truth going forward.
      console.error("[addTag] failed to mirror to transaction_tags:", legacyError);
    }
  }

  revalidateForEntity(validated.entityType, validated.entityId);
  return { success: true, tag: validated.tagName };
}

// ----------------------------------------------------------------------------
// removeTag
// ----------------------------------------------------------------------------

export async function removeTag(
  entityType: EntityType,
  entityId: string,
  tagName: string
): Promise<{ success: true } | { error: string }> {
  const blocked = demoActionGuard();
  if (blocked) return blocked;

  const validated = validateInputs(entityType, entityId, tagName);
  if ("error" in validated) return validated;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("entity_tags")
    .delete()
    .eq("entity_type", validated.entityType)
    .eq("entity_id", validated.entityId)
    .eq("tag_name", validated.tagName)
    .eq("user_id", user.id);

  if (error) {
    return { error: safeErrorMessage(error, "Failed to remove tag") };
  }

  // Mirror removal to transaction_tags for back-compat.
  if (validated.entityType === "transaction") {
    const { error: legacyError } = await supabase
      .from("transaction_tags")
      .delete()
      .eq("transaction_id", validated.entityId)
      .eq("tag_name", validated.tagName);
    if (legacyError) {
      console.error("[removeTag] failed to mirror delete to transaction_tags:", legacyError);
    }
  }

  revalidateForEntity(validated.entityType, validated.entityId);
  return { success: true };
}

// ----------------------------------------------------------------------------
// suggestTags — autocomplete helper for the tag picker
// ----------------------------------------------------------------------------

export interface TagSuggestion {
  tag: string;
  /** Higher = more relevant. */
  score: number;
  /** Where the suggestion came from (for diagnostics / chip styling). */
  source: "canonical" | "previous";
}

/**
 * Returns ranked tag suggestions for the current user.
 *
 * Ranking (highest first):
 *   1. Tags the user has already used on the same entity_type → most relevant.
 *   2. Tags the user has used on a different entity_type      → known vocabulary.
 *   3. Canonical tags from Up Bank (tags_canonical)           → discoverable but unused.
 *
 * Within each tier, exact prefix matches win, then substring matches.
 */
export async function suggestTags(
  entityType: EntityType,
  query: string = "",
  limit: number = 10
): Promise<TagSuggestion[]> {
  if (!isEntityType(entityType)) return [];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const q = query.trim().toLowerCase();

  const [{ data: usedRows }, { data: canonicalRows }] = await Promise.all([
    supabase
      .from("entity_tags")
      .select("tag_name, entity_type")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("tags_canonical")
      .select("id")
      .eq("user_id", user.id)
      .limit(200),
  ]);

  // Deduplicate while remembering the best (= highest) score we've seen for each tag.
  const scoreMap = new Map<string, TagSuggestion>();

  const upsertSuggestion = (tag: string, score: number, source: TagSuggestion["source"]) => {
    const normalized = tag.toLowerCase();
    if (q && !normalized.includes(q)) return;
    const prefixBoost = q && normalized.startsWith(q) ? 5 : 0;
    const finalScore = score + prefixBoost;
    const existing = scoreMap.get(normalized);
    if (!existing || existing.score < finalScore) {
      scoreMap.set(normalized, { tag: normalized, score: finalScore, source });
    }
  };

  // Tier 1 + 2: previously-used tags
  for (const row of usedRows ?? []) {
    const sameEntity = row.entity_type === entityType;
    upsertSuggestion(row.tag_name, sameEntity ? 100 : 50, "previous");
  }

  // Tier 3: canonical tags from Up Bank sync
  for (const row of canonicalRows ?? []) {
    upsertSuggestion(row.id, 10, "canonical");
  }

  return Array.from(scoreMap.values())
    .sort((a, b) => b.score - a.score || a.tag.localeCompare(b.tag))
    .slice(0, limit);
}

// ----------------------------------------------------------------------------
// listTags — fetch tags currently attached to an entity
// ----------------------------------------------------------------------------

export async function listTags(
  entityType: EntityType,
  entityId: string
): Promise<string[]> {
  if (!isEntityType(entityType)) return [];
  if (typeof entityId !== "string" || !UUID_RE.test(entityId)) return [];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("entity_tags")
    .select("tag_name")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: true });

  return (data ?? []).map((r) => r.tag_name as string);
}
