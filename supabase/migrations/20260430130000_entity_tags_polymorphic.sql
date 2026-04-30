-- =============================================================================
-- Polymorphic entity_tags table — Phase 1 task #47
-- =============================================================================
-- Lets users tag goals, investments, and transactions through a single table
-- using (entity_type, entity_id) as a polymorphic foreign key. The legacy
-- `transaction_tags` table stays in place for back-compat — server actions
-- write to BOTH during the transition.
--
-- entity_type values:
--   'transaction'  → transactions.id (uuid)
--   'goal'         → savings_goals.id (uuid)
--   'investment'   → investments.id (uuid)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.entity_tags (
  entity_type text NOT NULL CHECK (entity_type IN ('transaction', 'goal', 'investment')),
  entity_id   uuid NOT NULL,
  tag_name    text NOT NULL,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT timezone('utc', now()),
  PRIMARY KEY (entity_type, entity_id, tag_name)
);

-- Lookup indexes
CREATE INDEX IF NOT EXISTS entity_tags_user_id_idx
  ON public.entity_tags (user_id);
CREATE INDEX IF NOT EXISTS entity_tags_entity_idx
  ON public.entity_tags (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS entity_tags_tag_name_idx
  ON public.entity_tags (tag_name);

-- =============================================================================
-- Backfill from existing transaction_tags
-- =============================================================================
-- transaction_tags is keyed by transaction_id; we resolve user_id by joining
-- through transactions → accounts. Goals/investments don't have legacy data
-- to backfill (they didn't support tags yet).
-- =============================================================================

INSERT INTO public.entity_tags (entity_type, entity_id, tag_name, user_id, created_at)
SELECT
  'transaction'      AS entity_type,
  tt.transaction_id  AS entity_id,
  tt.tag_name        AS tag_name,
  a.user_id          AS user_id,
  tt.created_at      AS created_at
FROM public.transaction_tags tt
JOIN public.transactions t ON t.id = tt.transaction_id
JOIN public.accounts a     ON a.id = t.account_id
ON CONFLICT (entity_type, entity_id, tag_name) DO NOTHING;

-- =============================================================================
-- Row-Level Security
-- =============================================================================
-- Goals and investments are partnership-owned (not user-owned), so the policies
-- accept either:
--   * user_id matches the row's stored user_id (direct ownership),
--   * OR the entity belongs to a partnership the user is a member of.
-- This matches the access model already used by savings_goals / investments.
-- =============================================================================

ALTER TABLE public.entity_tags ENABLE ROW LEVEL SECURITY;

-- SELECT: users see their own tags, plus tags on partnership-shared entities
-- their partnership owns.
CREATE POLICY "Users can read their entity tags"
  ON public.entity_tags
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      entity_type = 'transaction' AND entity_id IN (
        SELECT t.id FROM public.transactions t
        JOIN public.accounts a ON a.id = t.account_id
        WHERE a.user_id = auth.uid()
      )
    )
    OR (
      entity_type = 'goal' AND entity_id IN (
        SELECT g.id FROM public.savings_goals g
        JOIN public.partnership_members pm ON pm.partnership_id = g.partnership_id
        WHERE pm.user_id = auth.uid()
      )
    )
    OR (
      entity_type = 'investment' AND entity_id IN (
        SELECT i.id FROM public.investments i
        JOIN public.partnership_members pm ON pm.partnership_id = i.partnership_id
        WHERE pm.user_id = auth.uid()
      )
    )
  );

-- INSERT: row.user_id must equal the caller AND the entity must be owned/shared
-- by the caller's account or partnership.
CREATE POLICY "Users can insert their entity tags"
  ON public.entity_tags
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      (entity_type = 'transaction' AND entity_id IN (
        SELECT t.id FROM public.transactions t
        JOIN public.accounts a ON a.id = t.account_id
        WHERE a.user_id = auth.uid()
      ))
      OR (entity_type = 'goal' AND entity_id IN (
        SELECT g.id FROM public.savings_goals g
        JOIN public.partnership_members pm ON pm.partnership_id = g.partnership_id
        WHERE pm.user_id = auth.uid()
      ))
      OR (entity_type = 'investment' AND entity_id IN (
        SELECT i.id FROM public.investments i
        JOIN public.partnership_members pm ON pm.partnership_id = i.partnership_id
        WHERE pm.user_id = auth.uid()
      ))
    )
  );

-- DELETE: only the user who owns the row can delete it. Partners cannot delete
-- tags they didn't author (mirrors how transaction_tags currently behaves).
CREATE POLICY "Users can delete their entity tags"
  ON public.entity_tags
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
