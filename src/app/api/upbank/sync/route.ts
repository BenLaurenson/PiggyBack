/**
 * Up Bank Sync — categories, accounts, transactions, tags.
 *
 * @see https://developer.up.com.au/ — official Up developer docs
 *
 * Streams progress as NDJSON (one JSON object per line) so the UI can
 * show real-time phase updates. Re-syncs are idempotent (upsert-everywhere).
 *
 * Strategy:
 *   1. Categories — single GET /categories call (Up doesn't paginate this).
 *   2. Accounts   — getAllPages of /accounts (small list, page[size]=100).
 *   3. Transactions — TIME-WINDOW CHUNKING. Walk one month at a time per
 *      account using filter[since] / filter[until]. Bounded memory, naturally
 *      resumable on timeout: a partial sync just leaves last_synced_at unchanged
 *      so the next run picks up from there.
 *   4. Tags — getAllPages of /tags into tags_canonical for the UI tag picker.
 */

import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { getPlaintextToken } from "@/lib/token-encryption";
import { ensureInferredCategories } from "@/lib/infer-category";
import { syncLimiter, getClientIp, rateLimitKey } from "@/lib/rate-limiter";
import {
  createUpApiClient,
  UpUnauthorizedError,
  type UpApiClient,
} from "@/lib/up-api";
import { PAGE_SIZE_DEFAULT, SYNC_WINDOW_DAYS } from "@/lib/up-constants";
import {
  ensureCategoryExists,
  resolveCategoryBatch,
  type BatchResolverContext,
} from "@/lib/resolve-category";
import type { UpAccount, UpCategory, UpTransaction } from "@/lib/up-types";
import {
  loadMerchantDefaultRules,
  recordRuleApplications,
} from "@/lib/merchant-default-rules";
import { track } from "@/lib/analytics/server";
import { FunnelEvent } from "@/lib/analytics/events";

export const maxDuration = 300; // 5 minutes per sync run

type SendFn = (data: Record<string, unknown>) => void;

function sortCategoriesParentFirst(categories: UpCategory[]): UpCategory[] {
  const sorted: UpCategory[] = [];
  const remaining = [...categories];
  const processedIds = new Set<string>();

  while (remaining.length > 0) {
    const beforeLength = remaining.length;
    for (let i = remaining.length - 1; i >= 0; i--) {
      const category = remaining[i];
      const parentId = category.relationships.parent.data?.id;
      if (!parentId || processedIds.has(parentId)) {
        sorted.push(category);
        processedIds.add(category.id);
        remaining.splice(i, 1);
      }
    }
    // If a cycle is detected (no progress), break and append remainder.
    if (remaining.length === beforeLength) {
      sorted.push(...remaining);
      break;
    }
  }

  return sorted;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = getClientIp(request);
  const rateLimitResult = syncLimiter.check(rateLimitKey(user.id, ip));
  if (!rateLimitResult.allowed) {
    return Response.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil((rateLimitResult.retryAfterMs ?? 0) / 1000)) },
      }
    );
  }

  const { data: config } = await supabase
    .from("up_api_configs")
    .select("encrypted_token, last_synced_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!config?.encrypted_token) {
    return Response.json({ error: "Up Bank not connected" }, { status: 400 });
  }

  let apiToken: string;
  try {
    apiToken = getPlaintextToken(config.encrypted_token);
  } catch {
    return Response.json(
      { error: "Failed to decrypt token. Check encryption key." },
      { status: 500 }
    );
  }

  const client = createUpApiClient(apiToken);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send: SendFn = (data) => {
        controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
      };

      try {
        const errors: string[] = [];

        // ─── Categories ──────────────────────────────────────────────────────
        send({ phase: "syncing-categories", message: "Syncing categories..." });
        try {
          const categoriesRes = await client.getCategories();
          const sortedCategories = sortCategoriesParentFirst(categoriesRes.data);
          for (let i = 0; i < sortedCategories.length; i += 50) {
            const batch = sortedCategories.slice(i, i + 50).map((c) => ({
              id: c.id,
              name: c.attributes.name,
              parent_category_id: c.relationships.parent.data?.id || null,
            }));
            const { error } = await supabase
              .from("categories")
              .upsert(batch, { onConflict: "id" });
            if (error) {
              console.error("Failed to upsert categories batch:", error);
              errors.push(`Failed to upsert categories: ${error.message}`);
            }
          }
        } catch (error) {
          if (error instanceof UpUnauthorizedError) {
            send({ phase: "error", message: "Up Bank rejected your token. Please reconnect." });
            controller.close();
            return;
          }
          send({ phase: "error", message: "Failed to fetch categories from Up Bank" });
          controller.close();
          return;
        }

        await ensureInferredCategories(supabase);

        // ─── Accounts ────────────────────────────────────────────────────────
        send({ phase: "syncing-accounts", message: "Syncing your accounts..." });

        let upAccounts: UpAccount[];
        try {
          const initial = await client.getAccounts({ pageSize: PAGE_SIZE_DEFAULT });
          upAccounts = await client.getAllPages(initial);
        } catch (error) {
          if (error instanceof UpUnauthorizedError) {
            send({ phase: "error", message: "Up Bank rejected your token. Please reconnect." });
            controller.close();
            return;
          }
          send({ phase: "error", message: "Failed to fetch accounts from Up Bank" });
          controller.close();
          return;
        }

        // accounts.last_synced_at is the canonical signal for "this account's
        // transactions have been successfully fetched". Set it AFTER the window
        // loop succeeds, never here — otherwise a user with partial-sync data
        // would have last_synced_at set on accounts that never got transactions.
        const upAccountIdToDbId = new Map<string, string>();
        for (const account of upAccounts) {
          const { data: savedAccount, error: accountError } = await supabase
            .from("accounts")
            .upsert(
              {
                user_id: user.id,
                up_account_id: account.id,
                display_name: account.attributes.displayName,
                account_type: account.attributes.accountType,
                ownership_type: account.attributes.ownershipType,
                balance_cents: account.attributes.balance.valueInBaseUnits,
                currency_code: account.attributes.balance.currencyCode,
                is_active: true,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "user_id,up_account_id" }
            )
            .select("id")
            .single();

          if (!savedAccount) {
            console.error(
              `Failed to upsert account ${account.attributes.displayName} (${account.id}):`,
              accountError
            );
            send({
              phase: "syncing-accounts",
              message: `Warning: failed to sync account "${account.attributes.displayName}"`,
              txnCount: 0,
            });
            continue;
          }
          upAccountIdToDbId.set(account.id, savedAccount.id);
        }

        // ─── Pre-load resolver context (overrides + merchant rules) ──────────
        const { data: allOverrides } = await supabase
          .from("transaction_category_overrides")
          .select("transaction_id, override_category_id, override_parent_category_id");
        const overridesByTxnId = new Map(
          (allOverrides || []).map((o) => [
            o.transaction_id as string,
            {
              override_category_id: o.override_category_id as string,
              override_parent_category_id: o.override_parent_category_id as string | null,
            },
          ])
        );

        const { data: merchantRules } = await supabase
          .from("merchant_category_rules")
          .select("id, merchant_description, category_id, parent_category_id")
          .eq("user_id", user.id);
        const merchantRulesByDesc = new Map(
          (merchantRules || []).map((r) => [
            r.merchant_description as string,
            {
              id: r.id as string,
              category_id: r.category_id as string,
              parent_category_id: r.parent_category_id as string | null,
            },
          ])
        );

        // Load global merchant default rules (admin-curated). These act as
        // a fallback when the user has no personal rule for a description.
        const { byPattern: defaultRulesByPattern } =
          await loadMerchantDefaultRules();

        const resolverCtx: BatchResolverContext = {
          overridesByTxnId,
          merchantRulesByDesc,
          upAccountIdToDbId,
          defaultRulesByPattern,
        };

        // Track rule applications during this sync so we can bump
        // last_applied_at / applied_count at the end.
        const userRuleAppliedIds = new Set<string>();
        const defaultRuleAppliedCounts = new Map<string, number>();

        // ─── Transactions (chunked-window) ───────────────────────────────────
        send({
          phase: "syncing-transactions",
          message: "Syncing transactions...",
          txnCount: 0,
        });

        let totalTxns = 0;
        const seenCategories = new Set<string>();

        const twelveMonthsAgo = new Date();
        twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
        const lastSyncTime = config.last_synced_at
          ? new Date(config.last_synced_at)
          : twelveMonthsAgo;
        const sinceDate = lastSyncTime > twelveMonthsAgo ? lastSyncTime : twelveMonthsAgo;
        const now = new Date();

        for (const account of upAccounts) {
          const savedAccountId = upAccountIdToDbId.get(account.id);
          if (!savedAccountId) continue;

          send({
            phase: "syncing-transactions",
            message: `Syncing ${account.attributes.displayName}...`,
            txnCount: totalTxns,
          });

          const { data: existingTxns } = await supabase
            .from("transactions")
            .select("id, up_transaction_id")
            .eq("account_id", savedAccountId);
          const txnIdByUpId = new Map(
            (existingTxns || []).map((t) => [t.up_transaction_id as string, t.id as string])
          );

          // Per-account retry loop. The Up API client already handles 429 +
          // single 5xx retry; this outer wrapper covers everything else
          // (network blips, Supabase write failures, transient bugs) by
          // retrying the whole window-walk for the account up to 3 times
          // with linear backoff. UpUnauthorizedError still propagates out
          // immediately — retrying a 401 is wasteful.
          //
          // Idempotency: every transaction upsert uses
          // `ON CONFLICT (account_id, up_transaction_id) DO UPDATE`, so
          // re-running a window doesn't create duplicates. Same for the
          // tag join table.
          const MAX_ACCOUNT_ATTEMPTS = 3;
          let accountAttempt = 0;
          let accountSucceeded = false;
          let lastAccountErr: unknown = null;

          while (accountAttempt < MAX_ACCOUNT_ATTEMPTS && !accountSucceeded) {
            accountAttempt++;
            const startTotalTxns = totalTxns;
            try {
              for (
                const cursor = new Date(sinceDate);
                cursor < now;
              ) {
                const windowEnd = new Date(cursor);
                windowEnd.setDate(windowEnd.getDate() + SYNC_WINDOW_DAYS);
                const upperBound = windowEnd > now ? now : windowEnd;

                const windowSyncResult = await syncTransactionWindow({
                  client,
                  accountId: account.id,
                  accountDisplayName: account.attributes.displayName,
                  savedAccountId,
                  since: cursor.toISOString(),
                  until: upperBound.toISOString(),
                  resolverCtx,
                  txnIdByUpId,
                  seenCategories,
                  supabase,
                  send,
                  startCount: totalTxns,
                  errors,
                  userRuleAppliedIds,
                  defaultRuleAppliedCounts,
                });

                totalTxns = windowSyncResult.newTotal;
                cursor.setDate(cursor.getDate() + SYNC_WINDOW_DAYS);
              }
              // Mark this account as fully synced. Service-role write so we
              // don't depend on the user-scoped client's RLS context (long-
              // running streams have been observed to lose it).
              try {
                const adminClientForAccount = createServiceRoleClient();
                await adminClientForAccount
                  .from("accounts")
                  .update({ last_synced_at: new Date().toISOString() })
                  .eq("id", savedAccountId);
              } catch (markErr) {
                console.warn(
                  `Couldn't mark accounts.last_synced_at for "${account.attributes.displayName}":`,
                  markErr
                );
                // Non-fatal — the data is in, the marker just won't update.
              }
              accountSucceeded = true;
            } catch (accountErr) {
              lastAccountErr = accountErr;
              // Permanent failure — don't retry, propagate immediately.
              if (accountErr instanceof UpUnauthorizedError) throw accountErr;

              // Reset progress counter back to where we were before this attempt
              // started, so the next attempt's progress events match reality.
              totalTxns = startTotalTxns;

              if (accountAttempt < MAX_ACCOUNT_ATTEMPTS) {
                const backoffMs = accountAttempt * 2000; // 2s, 4s
                console.warn(
                  `Sync attempt ${accountAttempt}/${MAX_ACCOUNT_ATTEMPTS} failed for "${account.attributes.displayName}", retrying in ${backoffMs}ms:`,
                  accountErr instanceof Error ? accountErr.message : accountErr
                );
                send({
                  phase: "syncing-transactions",
                  message: `Retrying ${account.attributes.displayName}... (attempt ${
                    accountAttempt + 1
                  } of ${MAX_ACCOUNT_ATTEMPTS})`,
                  txnCount: totalTxns,
                });
                await new Promise((r) => setTimeout(r, backoffMs));
              }
            }
          }

          if (!accountSucceeded) {
            console.error(
              `All ${MAX_ACCOUNT_ATTEMPTS} sync attempts failed for "${account.attributes.displayName}":`,
              lastAccountErr
            );
            errors.push(
              `Couldn't sync "${account.attributes.displayName}" after ${MAX_ACCOUNT_ATTEMPTS} attempts: ${
                lastAccountErr instanceof Error ? lastAccountErr.message : "unknown error"
              }`
            );
            send({
              phase: "syncing-transactions",
              message: `Skipped ${account.attributes.displayName} (couldn't fetch transactions)`,
              txnCount: totalTxns,
            });
          }
        }

        // ─── Tags canonical sync ─────────────────────────────────────────────
        send({ phase: "syncing-tags", message: "Syncing tag list..." });
        try {
          const initialTags = await client.getTags({ pageSize: PAGE_SIZE_DEFAULT });
          const allTags = await client.getAllPages(initialTags);
          if (allTags.length > 0) {
            const rows = allTags.map((tag) => ({
              id: tag.id,
              user_id: user.id,
              last_synced_at: new Date().toISOString(),
            }));
            const { error: tagsError } = await supabase
              .from("tags_canonical")
              .upsert(rows, { onConflict: "user_id,id" });
            if (tagsError) {
              console.error("Failed to upsert tags_canonical:", tagsError);
              errors.push(`Failed to upsert canonical tags: ${tagsError.message}`);
            }
          }
        } catch (error) {
          // Tag sync is best-effort — the activity page falls back to the
          // organically-populated `tags` table.
          console.error("Tag canonical sync failed:", error);
        }

        // ─── Finishing ───────────────────────────────────────────────────────
        send({ phase: "finishing", message: "Finishing up...", txnCount: totalTxns });

        // Only mark up_api_configs.last_synced_at when EVERY account synced
        // successfully. If we marked it on partial failure, future incremental
        // syncs would use it as their `since` cursor and skip back-history for
        // the accounts that didn't make it — leaving the user with permanent
        // gaps. Per-account state lives on accounts.last_synced_at; the
        // health-check cron can find any user where account.last_synced_at
        // < up_api_configs.created_at and force a re-sync.
        const fullySynced = errors.length === 0;
        if (fullySynced) {
          const adminClientForSync = createServiceRoleClient();
          const { data: configUpdateRows, error: configUpdateError } = await adminClientForSync
            .from("up_api_configs")
            .update({ last_synced_at: new Date().toISOString() })
            .eq("user_id", user.id)
            .select("user_id");
          if (configUpdateError) {
            console.error("Failed to update last_synced_at:", configUpdateError);
            errors.push(`Failed to update sync timestamp: ${configUpdateError.message}`);
          } else if (!configUpdateRows || configUpdateRows.length === 0) {
            console.error("last_synced_at update matched 0 rows for user", user.id);
            errors.push("Failed to record sync timestamp (no matching config row)");
          }
        }

        // Bump rule application stats (fire-and-forget; errors logged).
        if (defaultRuleAppliedCounts.size > 0) {
          await recordRuleApplications(defaultRuleAppliedCounts);
        }
        if (userRuleAppliedIds.size > 0) {
          try {
            const adminClient = createServiceRoleClient();
            await adminClient.rpc(
              "touch_merchant_category_rules_applied",
              { p_rule_ids: Array.from(userRuleAppliedIds) }
            );
          } catch (err) {
            console.error("Failed to touch user merchant rules:", err);
          }
        }

        // Phase 4 funnel: first_sync_completed fires only on the very first
        // successful sync (when last_synced_at was previously null).
        const isFirstSync = !config.last_synced_at;
        if (isFirstSync && errors.length === 0) {
          void track(FunnelEvent.FIRST_SYNC_COMPLETED, {
            userId: user.id,
            tenantId: user.id,
            properties: { transaction_count: totalTxns },
          });
        }

        if (errors.length > 0) {
          send({
            phase: "done",
            message: `Synced ${totalTxns} transactions with ${errors.length} error(s)`,
            txnCount: totalTxns,
            errors,
          });
        } else {
          send({
            phase: "done",
            message: `Synced ${totalTxns} transactions!`,
            txnCount: totalTxns,
          });
        }
      } catch (err) {
        if (err instanceof UpUnauthorizedError) {
          send({ phase: "error", message: "Up Bank rejected your token. Please reconnect." });
        } else {
          console.error("Sync error:", err);
          send({ phase: "error", message: "Sync failed. Please try again later." });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
    },
  });
}

interface WindowSyncOptions {
  client: UpApiClient;
  accountId: string;
  accountDisplayName: string;
  savedAccountId: string;
  since: string;
  until: string;
  resolverCtx: BatchResolverContext;
  txnIdByUpId: Map<string, string>;
  seenCategories: Set<string>;
  supabase: Awaited<ReturnType<typeof createClient>>;
  send: SendFn;
  startCount: number;
  errors: string[];
  /** Accumulator: user merchant_category_rules.id values applied during this sync. */
  userRuleAppliedIds: Set<string>;
  /** Accumulator: merchant_default_rules.id → count of applications during this sync. */
  defaultRuleAppliedCounts: Map<string, number>;
}

/**
 * Sync one [since, until) window of transactions for one account.
 * Walks all pages within the window using getAllPages internally.
 */
async function syncTransactionWindow(opts: WindowSyncOptions): Promise<{ newTotal: number }> {
  const initial = await opts.client.getAccountTransactions(opts.accountId, {
    pageSize: PAGE_SIZE_DEFAULT,
    filterSince: opts.since,
    filterUntil: opts.until,
  });
  const allTxns: UpTransaction[] = await opts.client.getAllPages(initial);

  let total = opts.startCount;
  if (allTxns.length === 0) return { newTotal: total };

  // Defensive: ensure any unknown category IDs Up returns are inserted before
  // we reference them. Cache by id to avoid redundant upserts.
  for (const txn of allTxns) {
    const catId = txn.relationships.category.data?.id ?? null;
    const parentId = txn.relationships.parentCategory.data?.id ?? null;
    if (catId && !opts.seenCategories.has(catId)) {
      await ensureCategoryExists(opts.supabase, catId);
      opts.seenCategories.add(catId);
    }
    if (parentId && !opts.seenCategories.has(parentId)) {
      await ensureCategoryExists(opts.supabase, parentId);
      opts.seenCategories.add(parentId);
    }
  }

  const txnRows: Record<string, unknown>[] = [];
  const tagData: { upTxnId: string; tagName: string }[] = [];

  for (const txn of allTxns) {
    const transferAccountId = txn.relationships.transferAccount?.data?.id
      ? opts.resolverCtx.upAccountIdToDbId.get(txn.relationships.transferAccount.data.id) ?? null
      : null;

    const existingId = opts.txnIdByUpId.get(txn.id) ?? null;
    const {
      categoryId,
      parentCategoryId,
      appliedUserRuleId,
      appliedDefaultRuleId,
    } = resolveCategoryBatch(txn, opts.resolverCtx, existingId);

    if (appliedUserRuleId) opts.userRuleAppliedIds.add(appliedUserRuleId);
    if (appliedDefaultRuleId) {
      opts.defaultRuleAppliedCounts.set(
        appliedDefaultRuleId,
        (opts.defaultRuleAppliedCounts.get(appliedDefaultRuleId) ?? 0) + 1
      );
    }

    txnRows.push({
      account_id: opts.savedAccountId,
      up_transaction_id: txn.id,
      description: txn.attributes.description,
      raw_text: txn.attributes.rawText,
      message: txn.attributes.message,
      amount_cents: txn.attributes.amount.valueInBaseUnits,
      currency_code: txn.attributes.amount.currencyCode,
      status: txn.attributes.status,
      category_id: categoryId,
      parent_category_id: parentCategoryId,
      settled_at: txn.attributes.settledAt,
      created_at: txn.attributes.createdAt,
      hold_info_amount_cents: txn.attributes.holdInfo?.amount?.valueInBaseUnits ?? null,
      hold_info_foreign_amount_cents:
        txn.attributes.holdInfo?.foreignAmount?.valueInBaseUnits ?? null,
      hold_info_foreign_currency_code:
        txn.attributes.holdInfo?.foreignAmount?.currencyCode ?? null,
      round_up_amount_cents: txn.attributes.roundUp?.amount?.valueInBaseUnits ?? null,
      round_up_boost_cents: txn.attributes.roundUp?.boostPortion?.valueInBaseUnits ?? null,
      cashback_amount_cents: txn.attributes.cashback?.amount?.valueInBaseUnits ?? null,
      cashback_description: txn.attributes.cashback?.description ?? null,
      foreign_amount_cents: txn.attributes.foreignAmount?.valueInBaseUnits ?? null,
      foreign_currency_code: txn.attributes.foreignAmount?.currencyCode ?? null,
      card_purchase_method: txn.attributes.cardPurchaseMethod?.method ?? null,
      card_number_suffix: txn.attributes.cardPurchaseMethod?.cardNumberSuffix ?? null,
      transfer_account_id: transferAccountId,
      is_categorizable: txn.attributes.isCategorizable ?? true,
      transaction_type: txn.attributes.transactionType,
      deep_link_url: txn.attributes.deepLinkURL ?? null,
      note_text: txn.attributes.note?.text ?? null,
      has_attachment: txn.relationships.attachment?.data !== null,
      performing_customer: txn.attributes.performingCustomer?.displayName ?? null,
    });

    if (txn.relationships.tags?.data) {
      for (const tag of txn.relationships.tags.data) {
        tagData.push({ upTxnId: txn.id, tagName: tag.id });
      }
    }
  }

  if (txnRows.length > 0) {
    const { error: txnError } = await opts.supabase
      .from("transactions")
      .upsert(txnRows, { onConflict: "account_id,up_transaction_id" });
    if (txnError) {
      console.error("Failed to upsert transactions:", txnError);
      opts.errors.push(
        `Failed to upsert transactions for ${opts.accountDisplayName}: ${txnError.message}`
      );
    }
  }

  if (tagData.length > 0) {
    // Tag-related writes use the service-role client because the
    // long-running stream context periodically loses RLS auth state
    // (auth.uid() returns null), causing 403s on transaction_tags' RLS
    // INSERT policy that joins through transactions → accounts. The
    // route's auth check upstream already validated the user — these
    // are internal writes scoped to the savedAccountId we just
    // confirmed belongs to them.
    const adminClient = createServiceRoleClient();

    const uniqueTagNames = [...new Set(tagData.map((t) => t.tagName))];
    const { error: tagsError } = await adminClient
      .from("tags")
      .upsert(uniqueTagNames.map((name) => ({ name })), { onConflict: "name" });
    if (tagsError) {
      console.error("Failed to upsert tags:", tagsError);
      opts.errors.push(`Failed to upsert tags: ${tagsError.message}`);
    }

    const tagUpTxnIds = [...new Set(tagData.map((t) => t.upTxnId))];
    const { data: tagTxns } = await adminClient
      .from("transactions")
      .select("id, up_transaction_id")
      .eq("account_id", opts.savedAccountId)
      .in("up_transaction_id", tagUpTxnIds);
    const tagTxnIdMap = new Map(
      (tagTxns || []).map((t) => [t.up_transaction_id as string, t.id as string])
    );

    const tagAssociations = tagData
      .filter((t) => tagTxnIdMap.has(t.upTxnId))
      .map((t) => ({
        transaction_id: tagTxnIdMap.get(t.upTxnId),
        tag_name: t.tagName,
      }));

    if (tagAssociations.length > 0) {
      const { error: tagAssocError } = await adminClient
        .from("transaction_tags")
        .upsert(tagAssociations, { onConflict: "transaction_id,tag_name" });
      if (tagAssocError) {
        console.error("Failed to upsert transaction tags:", tagAssocError);
        opts.errors.push(`Failed to upsert transaction tags: ${tagAssocError.message}`);
      }
    }
  }

  total += allTxns.length;
  opts.send({
    phase: "syncing-transactions",
    message: `Syncing ${opts.accountDisplayName}... ${total} transactions`,
    txnCount: total,
  });

  return { newTotal: total };
}
