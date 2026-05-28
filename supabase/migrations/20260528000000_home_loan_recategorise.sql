-- Recategorise historical HOME_LOAN transactions so they stop polluting
-- spending and income aggregations.
--
-- Pre-fix, the inferred categoriser had no awareness of account_type:
--   - HOME_LOAN drawdowns (large negative amounts at settlement) fell through
--     to "genuinely uncategorised" and were counted as spending — typically a
--     5- or 6-figure spike in the month of property settlement.
--   - HOME_LOAN interest charges (negative amounts, monthly) were classified
--     as "interest", which is the "Interest Earned" category — they belong
--     under Housing as a real expense, not as inverted income.
--
-- This migration only updates rows that look like they were affected by the
-- prior incorrect inference. It is conservative: it does not touch rows that
-- already have a user category override, a merchant rule applied, or a
-- non-default category.
--
-- Safe to run multiple times.

-- 1. HOME_LOAN drawdowns → external-transfer
UPDATE public.transactions t
   SET category_id = 'external-transfer',
       parent_category_id = NULL
  FROM public.accounts a
 WHERE t.account_id = a.id
   AND a.account_type = 'HOME_LOAN'
   AND t.transaction_type = 'Drawdown'
   AND (t.category_id IS NULL OR t.category_id = 'interest')
   AND NOT EXISTS (
         SELECT 1 FROM public.transaction_category_overrides o
          WHERE o.transaction_id = t.id
       );

-- 2. HOME_LOAN interest charges → rent-and-mortgage (Housing & Utilities)
UPDATE public.transactions t
   SET category_id = 'rent-and-mortgage',
       parent_category_id = NULL
  FROM public.accounts a
 WHERE t.account_id = a.id
   AND a.account_type = 'HOME_LOAN'
   AND t.transaction_type = 'Interest'
   AND t.amount_cents < 0
   AND (t.category_id IS NULL OR t.category_id = 'interest')
   AND NOT EXISTS (
         SELECT 1 FROM public.transaction_category_overrides o
          WHERE o.transaction_id = t.id
       );
