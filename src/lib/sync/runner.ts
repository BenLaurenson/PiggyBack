/**
 * Sync runner.
 *
 * Extracts the sync logic out of the API route handler so it can be
 * invoked from non-request contexts (e.g., the reconciliation cron).
 *
 * Behaviour preserved from the prior route handler:
 *  - Idempotent ON CONFLICT DO UPDATE upserts for accounts, transactions,
 *    categories, tags, and transaction_tags.
 *  - Per-account loop: each account fetches its own paginated transactions.
 *  - Categories sync first (ensures FK targets exist for transactions).
 *
 * New behaviour:
 *  - Each invocation creates a sync_runs row + per-account sync_account_attempts.
 *  - Per-account state transitions (IDLE/CURRENT/STALE_PARTIAL/SYNC_FAILED_PERMANENT).
 *  - 401 cascade: if an Up API call returns 401, all of the user's accounts
 *    are flipped to STALE_PARTIAL and up_api_configs.is_active is set to
 *    false (token revocation).
 *
 * NB: This module reads the user's encrypted token via service-role and
 * never accepts a plaintext token from a caller. The caller passes only
 * the user_id + the trigger.
 */

import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { getPlaintextToken } from "@/lib/token-encryption";
import { inferCategoryId, ensureInferredCategories } from "@/lib/infer-category";
import { validateUpApiUrl } from "@/lib/up-api";
import {
  startSyncRun,
  recordAccountAttempt,
  finishSyncRun,
  markAccountSyncing,
  markAccountCurrent,
  markAccountStalePartial,
  type SyncTrigger,
} from "@/lib/sync/state";

/** Internal exception thrown when Up returns 401 — drives the cascade. */
export class UpUnauthorizedError extends Error {
  constructor(public detail: string) {
    super(detail);
    this.name = "UpUnauthorizedError";
  }
}

/** Optional progress callback used by the streaming route handler. */
export type ProgressEvent =
  | { phase: "syncing-categories"; message: string }
  | { phase: "syncing-accounts"; message: string; txnCount?: number }
  | { phase: "syncing-transactions"; message: string; txnCount: number }
  | { phase: "finishing"; message: string; txnCount: number }
  | { phase: "done"; message: string; txnCount: number; errors?: string[] }
  | { phase: "error"; message: string };

export interface RunSyncResult {
  ok: boolean;
  partial: boolean;
  totalTxns: number;
  errors: string[];
  syncRunId: string | null;
  /** Account display names (or DB ids) that ended in STALE_PARTIAL/SYNC_FAILED_PERMANENT. */
  failedAccounts: string[];
  /** Set when the user's PAT is revoked. */
  unauthorized: boolean;
}

/**
 * Returns categories topologically sorted so parents come before children.
 * Pulled from the route handler verbatim.
 */
function sortCategoriesParentFirst<T extends {
  id: string;
  relationships: { parent: { data?: { id: string } | null } };
}>(categories: T[]): T[] {
  const sorted: T[] = [];
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
    if (remaining.length === beforeLength) {
      sorted.push(...remaining);
      break;
    }
  }
  return sorted;
}

export interface RunSyncOptions {
  userId: string;
  trigger: SyncTrigger;
  onProgress?: (ev: ProgressEvent) => void;
}

export async function runSyncForUser(
  options: RunSyncOptions
): Promise<RunSyncResult> {
  const { userId, trigger, onProgress } = options;
  const send = (ev: ProgressEvent) => onProgress?.(ev);

  const supabase = createServiceRoleClient();

  // Track per-run metrics for both the FE response and sync_runs summary.
  const errors: string[] = [];
  const failedAccounts: string[] = [];
  let totalTxns = 0;
  let accountsSucceeded = 0;
  let accountsPartial = 0;
  let accountsFailed = 0;
  let unauthorized = false;

  // Pull encrypted token via service-role (no user session required).
  const { data: config } = await supabase
    .from("up_api_configs")
    .select("encrypted_token, last_synced_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (!config?.encrypted_token) {
    return {
      ok: false,
      partial: false,
      totalTxns: 0,
      errors: ["Up Bank not connected"],
      syncRunId: null,
      failedAccounts: [],
      unauthorized: false,
    };
  }

  let apiToken: string;
  try {
    apiToken = getPlaintextToken(config.encrypted_token);
  } catch {
    return {
      ok: false,
      partial: false,
      totalTxns: 0,
      errors: ["Failed to decrypt token. Check encryption key."],
      syncRunId: null,
      failedAccounts: [],
      unauthorized: false,
    };
  }

  // Open a sync_runs row for this invocation.
  const syncRunId = await startSyncRun(userId, trigger);

  try {
    // ----------------------------------------------------------------
    // Phase: categories
    // ----------------------------------------------------------------
    send({ phase: "syncing-categories", message: "Syncing categories..." });

    const categoriesRes = await fetch(
      "https://api.up.com.au/api/v1/categories",
      { headers: { Authorization: `Bearer ${apiToken}` } }
    );

    if (categoriesRes.status === 401) {
      throw new UpUnauthorizedError("Up Bank token revoked");
    }

    if (categoriesRes.ok) {
      type UpCategoryShape = {
        id: string;
        attributes: { name: string };
        relationships: { parent: { data?: { id: string } | null } };
      };
      const { data: upCategories } = (await categoriesRes.json()) as {
        data: UpCategoryShape[];
      };
      const sortedCategories = sortCategoriesParentFirst<UpCategoryShape>(upCategories);
      for (let i = 0; i < sortedCategories.length; i += 50) {
        const batch = sortedCategories
          .slice(i, i + 50)
          .map((category) => ({
            id: category.id,
            name: category.attributes.name,
            parent_category_id: category.relationships.parent.data?.id || null,
          }));
        const { error: categoryError } = await supabase
          .from("categories")
          .upsert(batch, { onConflict: "id" });
        if (categoryError) {
          console.error("Failed to upsert categories batch:", categoryError);
          errors.push(`Failed to upsert categories: ${categoryError.message}`);
        }
      }
    }

    await ensureInferredCategories(supabase);

    // ----------------------------------------------------------------
    // Phase: accounts
    // ----------------------------------------------------------------
    send({ phase: "syncing-accounts", message: "Syncing your accounts..." });

    const upAccounts: Array<{
      id: string;
      attributes: {
        displayName: string;
        accountType: string;
        ownershipType: string;
        balance: { valueInBaseUnits: number; currencyCode: string };
      };
    }> = [];
    let accountsNextUrl: string | null =
      "https://api.up.com.au/api/v1/accounts?page[size]=100";

    while (accountsNextUrl) {
      validateUpApiUrl(accountsNextUrl);
      const accountsRes: Response = await fetch(accountsNextUrl, {
        headers: { Authorization: `Bearer ${apiToken}` },
      });
      if (accountsRes.status === 401) {
        throw new UpUnauthorizedError("Up Bank token revoked");
      }
      if (!accountsRes.ok) {
        send({
          phase: "error",
          message: "Failed to fetch accounts from Up Bank",
        });
        const msg = `Failed to fetch accounts (${accountsRes.status})`;
        errors.push(msg);
        break;
      }
      const accountsPage: {
        data: typeof upAccounts;
        links?: { next?: string };
      } = await accountsRes.json();
      upAccounts.push(...accountsPage.data);
      accountsNextUrl = accountsPage.links?.next ?? null;
    }

    const upAccountIdToDbId = new Map<string, string>();

    for (const account of upAccounts) {
      const { data: savedAccount, error: accountError } = await supabase
        .from("accounts")
        .upsert(
          {
            user_id: userId,
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
        .select()
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

    // Pre-load overrides + merchant rules for category resolution.
    const { data: allOverrides } = await supabase
      .from("transaction_category_overrides")
      .select(
        "transaction_id, override_category_id, override_parent_category_id"
      );
    const overridesByTxnId = new Map(
      (allOverrides || []).map((o: { transaction_id: string; override_category_id: string; override_parent_category_id: string }) => [
        o.transaction_id,
        o,
      ])
    );

    const { data: merchantRules } = await supabase
      .from("merchant_category_rules")
      .select("merchant_description, category_id, parent_category_id")
      .eq("user_id", userId);
    const merchantRulesByDesc = new Map(
      (merchantRules || []).map((r: { merchant_description: string; category_id: string; parent_category_id: string }) => [r.merchant_description, r])
    );

    // ----------------------------------------------------------------
    // Phase: transactions (per-account)
    // ----------------------------------------------------------------
    send({
      phase: "syncing-transactions",
      message: "Syncing transactions...",
      txnCount: 0,
    });

    // Per-account cursor: prefer accounts.last_synced_at when set, else 12-months-ago.
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const { data: accountCursors } = await supabase
      .from("accounts")
      .select("id, last_synced_at")
      .eq("user_id", userId);
    const cursorByAcctId = new Map<string, string | null>(
      (accountCursors || []).map((a: { id: string; last_synced_at: string | null }) => [
        a.id,
        a.last_synced_at,
      ])
    );

    for (const account of upAccounts) {
      const savedAccountId = upAccountIdToDbId.get(account.id);
      if (!savedAccountId) continue;

      const cursorIso = cursorByAcctId.get(savedAccountId) ?? null;
      const sinceDate = cursorIso
        ? new Date(cursorIso) > twelveMonthsAgo
          ? new Date(cursorIso)
          : twelveMonthsAgo
        : twelveMonthsAgo;
      const untilIso = new Date().toISOString();
      const accountStartedAt = Date.now();
      const accountTxnsBefore = totalTxns;

      // Mark SYNCING for this account.
      await markAccountSyncing(savedAccountId);

      send({
        phase: "syncing-transactions",
        message: `Syncing ${account.attributes.displayName}...`,
        txnCount: totalTxns,
      });

      // Pre-load existing transaction IDs so we honour user overrides.
      const { data: existingTxns } = await supabase
        .from("transactions")
        .select("id, up_transaction_id")
        .eq("account_id", savedAccountId);
      const txnIdByUpId = new Map(
        (existingTxns || []).map((t: { id: string; up_transaction_id: string }) => [t.up_transaction_id, t.id])
      );

      let nextUrl: string | null = `https://api.up.com.au/api/v1/accounts/${account.id}/transactions?page[size]=100&filter[since]=${sinceDate.toISOString()}`;
      let pageCount = 0;
      let accountFailed = false;
      const accountErrors: string[] = [];

      while (nextUrl) {
        validateUpApiUrl(nextUrl);
        const transactionsRes = await fetch(nextUrl, {
          headers: { Authorization: `Bearer ${apiToken}` },
        });

        if (transactionsRes.status === 401) {
          throw new UpUnauthorizedError("Up Bank token revoked");
        }
        if (!transactionsRes.ok) {
          // Don't throw — record per-account failure and move on.
          accountErrors.push(
            `Up returned ${transactionsRes.status} for ${account.attributes.displayName}`
          );
          accountFailed = true;
          break;
        }

        const txnData: {
          data: Array<{
            id: string;
            attributes: {
              description: string;
              rawText: string | null;
              message: string | null;
              amount: { valueInBaseUnits: number; currencyCode: string };
              status: string;
              settledAt: string | null;
              createdAt: string;
              holdInfo?: {
                amount?: { valueInBaseUnits: number };
                foreignAmount?: { valueInBaseUnits: number; currencyCode: string };
              } | null;
              roundUp?: {
                amount?: { valueInBaseUnits: number };
                boostPortion?: { valueInBaseUnits: number };
              } | null;
              cashback?: {
                amount?: { valueInBaseUnits: number };
                description?: string;
              } | null;
              foreignAmount?: { valueInBaseUnits: number; currencyCode: string } | null;
              cardPurchaseMethod?: {
                method?: string;
                cardNumberSuffix?: string;
              } | null;
              isCategorizable?: boolean;
              transactionType?: string | null;
              deepLinkURL?: string | null;
            };
            relationships: {
              transferAccount?: { data?: { id: string } | null };
              category: { data?: { id: string } | null };
              parentCategory: { data?: { id: string } | null };
              tags?: { data?: Array<{ id: string }> };
            };
          }>;
          links?: { next?: string };
        } = await transactionsRes.json();

        // Build batch + collect tags.
        const txnRows: Record<string, unknown>[] = [];
        const tagData: { upTxnId: string; tagName: string }[] = [];

        for (const txn of txnData.data) {
          const transferAccountId = txn.relationships.transferAccount?.data?.id
            ? upAccountIdToDbId.get(
                txn.relationships.transferAccount.data.id
              ) || null
            : null;

          let finalCategoryId = inferCategoryId({
            upCategoryId: txn.relationships.category.data?.id || null,
            transferAccountId,
            roundUpAmountCents:
              txn.attributes.roundUp?.amount?.valueInBaseUnits || null,
            transactionType: txn.attributes.transactionType || null,
            description: txn.attributes.description,
            amountCents: txn.attributes.amount.valueInBaseUnits,
          });
          let finalParentCategoryId =
            txn.relationships.parentCategory.data?.id || null;

          const merchantRule = merchantRulesByDesc.get(
            txn.attributes.description
          );
          if (merchantRule) {
            finalCategoryId = merchantRule.category_id;
            finalParentCategoryId = merchantRule.parent_category_id;
          }

          const existingId = txnIdByUpId.get(txn.id);
          if (existingId) {
            const override = overridesByTxnId.get(existingId);
            if (override) {
              finalCategoryId = override.override_category_id;
              finalParentCategoryId = override.override_parent_category_id;
            }
          }

          txnRows.push({
            account_id: savedAccountId,
            up_transaction_id: txn.id,
            description: txn.attributes.description,
            raw_text: txn.attributes.rawText,
            message: txn.attributes.message,
            amount_cents: txn.attributes.amount.valueInBaseUnits,
            currency_code: txn.attributes.amount.currencyCode,
            status: txn.attributes.status,
            category_id: finalCategoryId,
            parent_category_id: finalParentCategoryId,
            settled_at: txn.attributes.settledAt,
            created_at: txn.attributes.createdAt,
            hold_info_amount_cents:
              txn.attributes.holdInfo?.amount?.valueInBaseUnits || null,
            hold_info_foreign_amount_cents:
              txn.attributes.holdInfo?.foreignAmount?.valueInBaseUnits || null,
            hold_info_foreign_currency_code:
              txn.attributes.holdInfo?.foreignAmount?.currencyCode || null,
            round_up_amount_cents:
              txn.attributes.roundUp?.amount?.valueInBaseUnits || null,
            round_up_boost_cents:
              txn.attributes.roundUp?.boostPortion?.valueInBaseUnits || null,
            cashback_amount_cents:
              txn.attributes.cashback?.amount?.valueInBaseUnits || null,
            cashback_description: txn.attributes.cashback?.description || null,
            foreign_amount_cents:
              txn.attributes.foreignAmount?.valueInBaseUnits || null,
            foreign_currency_code:
              txn.attributes.foreignAmount?.currencyCode || null,
            card_purchase_method:
              txn.attributes.cardPurchaseMethod?.method || null,
            card_number_suffix:
              txn.attributes.cardPurchaseMethod?.cardNumberSuffix || null,
            transfer_account_id: transferAccountId,
            is_categorizable: txn.attributes.isCategorizable ?? true,
            transaction_type: txn.attributes.transactionType || null,
            deep_link_url: txn.attributes.deepLinkURL || null,
          });

          if (
            txn.relationships.tags?.data &&
            Array.isArray(txn.relationships.tags.data)
          ) {
            for (const tag of txn.relationships.tags.data) {
              tagData.push({ upTxnId: txn.id, tagName: tag.id });
            }
          }
        }

        if (txnRows.length > 0) {
          const { error: txnError } = await supabase
            .from("transactions")
            .upsert(txnRows, { onConflict: "account_id,up_transaction_id" });
          if (txnError) {
            console.error("Failed to upsert transactions:", txnError);
            errors.push(
              `Failed to upsert transactions for ${account.attributes.displayName}: ${txnError.message}`
            );
            accountErrors.push(`upsert error: ${txnError.message}`);
          }
        }

        if (tagData.length > 0) {
          const uniqueTagNames = [...new Set(tagData.map((t) => t.tagName))];
          const { error: tagsError } = await supabase
            .from("tags")
            .upsert(
              uniqueTagNames.map((name) => ({ name })),
              { onConflict: "name" }
            );
          if (tagsError) {
            console.error("Failed to upsert tags:", tagsError);
            errors.push(`Failed to upsert tags: ${tagsError.message}`);
          }

          const tagUpTxnIds = [...new Set(tagData.map((t) => t.upTxnId))];
          const { data: tagTxns } = await supabase
            .from("transactions")
            .select("id, up_transaction_id")
            .eq("account_id", savedAccountId)
            .in("up_transaction_id", tagUpTxnIds);
          const tagTxnIdMap = new Map(
            (tagTxns || []).map((t: { id: string; up_transaction_id: string }) => [t.up_transaction_id, t.id])
          );
          const tagAssociations = tagData
            .filter((t) => tagTxnIdMap.has(t.upTxnId))
            .map((t) => ({
              transaction_id: tagTxnIdMap.get(t.upTxnId),
              tag_name: t.tagName,
            }));
          if (tagAssociations.length > 0) {
            const { error: tagAssocError } = await supabase
              .from("transaction_tags")
              .upsert(tagAssociations, {
                onConflict: "transaction_id,tag_name",
              });
            if (tagAssocError) {
              console.error("Failed to upsert transaction tags:", tagAssocError);
              errors.push(
                `Failed to upsert transaction tags: ${tagAssocError.message}`
              );
            }
          }
        }

        totalTxns += txnData.data.length;
        send({
          phase: "syncing-transactions",
          message: `Syncing ${account.attributes.displayName}... ${totalTxns} transactions`,
          txnCount: totalTxns,
        });

        nextUrl = txnData.links?.next || null;
        pageCount++;
      }

      const accountTxnsThisRun = totalTxns - accountTxnsBefore;
      const durationMs = Date.now() - accountStartedAt;

      // Update sync_state per outcome and write the audit row.
      if (accountFailed) {
        accountsPartial++;
        failedAccounts.push(account.attributes.displayName || savedAccountId);
        const reason =
          accountErrors[0] ?? "Up Bank request failed; will retry next reconciliation";
        await markAccountStalePartial(savedAccountId, reason);
        if (syncRunId) {
          await recordAccountAttempt({
            syncRunId,
            accountId: savedAccountId,
            since: sinceDate.toISOString(),
            until: untilIso,
            attemptNumber: 1,
            outcome: "partial",
            errorMessage: reason,
            windowsSkipped: 1,
            windowsTotal: pageCount > 0 ? pageCount : 1,
            txnsInserted: accountTxnsThisRun,
            durationMs,
          });
        }
      } else {
        accountsSucceeded++;
        await markAccountCurrent(savedAccountId);
        if (syncRunId) {
          await recordAccountAttempt({
            syncRunId,
            accountId: savedAccountId,
            since: sinceDate.toISOString(),
            until: untilIso,
            attemptNumber: 1,
            outcome: "success",
            windowsSkipped: 0,
            windowsTotal: pageCount,
            txnsInserted: accountTxnsThisRun,
            durationMs,
          });
        }
      }
    }

    // ----------------------------------------------------------------
    // Phase: finishing
    // ----------------------------------------------------------------
    send({
      phase: "finishing",
      message: "Finishing up...",
      txnCount: totalTxns,
    });

    const { error: configUpdateError } = await supabase
      .from("up_api_configs")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("user_id", userId);
    if (configUpdateError) {
      console.error("Failed to update last_synced_at:", configUpdateError);
      errors.push(
        `Failed to update sync timestamp: ${configUpdateError.message}`
      );
    }
  } catch (err) {
    if (err instanceof UpUnauthorizedError) {
      unauthorized = true;
      // Cascade: flip all of the user's accounts to STALE_PARTIAL and
      // disable the up_api_configs row so the cron stops trying.
      const reason = `Up Bank token revoked: ${err.detail}`;
      try {
        await supabase
          .from("accounts")
          .update({
            sync_state: "STALE_PARTIAL",
            sync_last_error: reason,
          })
          .eq("user_id", userId);
        await supabase
          .from("up_api_configs")
          .update({ is_active: false })
          .eq("user_id", userId);
      } catch (cascadeErr) {
        console.error("[runSyncForUser] cascade failed", cascadeErr);
      }
      // Mark all accounts that were already counted as failed.
      accountsFailed += 1;
      errors.push(reason);
    } else {
      console.error("Sync error:", err);
      errors.push(err instanceof Error ? err.message : "Sync failed");
    }
  } finally {
    if (syncRunId) {
      await finishSyncRun(syncRunId, {
        totalTxnsInserted: totalTxns,
        accountsSucceeded,
        accountsPartial,
        accountsFailed,
        errors,
      });
    }
  }

  return {
    ok: errors.length === 0 && !unauthorized,
    partial: accountsPartial > 0 || (errors.length > 0 && totalTxns > 0),
    totalTxns,
    errors,
    syncRunId,
    failedAccounts,
    unauthorized,
  };
}
