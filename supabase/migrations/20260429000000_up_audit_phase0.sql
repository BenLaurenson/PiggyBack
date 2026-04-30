-- =============================================================================
-- Phase 0 (context7 audit): Up Bank API alignment + capability adds
-- =============================================================================
-- This migration adds three things surfaced by the Up Bank API audit:
--   1. transactions.note_text       — Up's customer-attached note (attributes.note.text)
--   2. transactions.has_attachment  — boolean from relationships.attachment.data presence
--   3. tags_canonical               — list of all tags as Up returns them via GET /tags,
--                                     used to power the activity tag-picker UI
--
-- @see https://developer.up.com.au/#get_tags
-- @see https://developer.up.com.au/#get_transactions_id (note + attachment fields)
-- =============================================================================

-- 1. Customer-attached transaction note (different from PiggyBack's user-authored
--    transaction_notes table — that's for partner-visible markdown notes).
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS note_text text;

-- 2. Receipt-attachment indicator. We don't yet fetch attachments via /attachments,
--    but we surface a paperclip icon when this is true.
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS has_attachment boolean NOT NULL DEFAULT false;

-- 3. Canonical tag list synced from GET /tags. The existing `tags` table is
--    populated organically as transactions arrive; tags_canonical mirrors
--    Up's authoritative list (whether or not we've seen those tags locally yet).
CREATE TABLE IF NOT EXISTS public.tags_canonical (
  -- Up uses the tag label itself as the unique identifier.
  id text PRIMARY KEY,
  -- The user_id this tag was last seen under (tags are scoped per-PAT in Up).
  -- This lets multi-tenant deployments keep separate tag namespaces.
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_synced_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

-- One canonical row per (user, tag) — a tag can be used by multiple users
-- but each user's PAT scopes their own copy.
CREATE INDEX IF NOT EXISTS tags_canonical_user_id_idx ON public.tags_canonical (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS tags_canonical_user_id_tag_id_idx
  ON public.tags_canonical (user_id, id);

-- RLS: users can only see their own tags
ALTER TABLE public.tags_canonical ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own canonical tags"
  ON public.tags_canonical
  FOR SELECT
  USING (user_id = auth.uid());

-- Service role bypasses RLS for the sync route. No INSERT/UPDATE/DELETE policies
-- because all writes happen via service role (sync route + admin tooling).

-- =============================================================================
-- Notes for future migrations:
--
--   * If Up adds new transaction attributes (a new column on /transactions),
--     follow the pattern above: ADD COLUMN IF NOT EXISTS … on `transactions`,
--     and update src/lib/up-types.ts to include the field.
--
--   * Up's `/tags` listing supports pagination via `page[after]` cursor; that
--     pagination is opaque, so the sync route walks links.next via UpApiClient.
-- =============================================================================
