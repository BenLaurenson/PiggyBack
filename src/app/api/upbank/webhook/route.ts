/**
 * Up Bank Webhook Handler
 * Receives real-time transaction events and processes them
 *
 * Uses service role client to bypass RLS since webhooks come from Up Bank
 * without a user session. Security is provided by HMAC signature verification.
 */

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { installLogScrubber } from "@/lib/log-scrubber";

// Install secret-redacting wrappers around console.* before any logs fire.
installLogScrubber();
import { createHmac, timingSafeEqual } from "crypto";
import { matchSingleTransactionToExpenses, matchSingleTransactionToIncomeSources } from "@/lib/match-expense-transactions";
import { matchTransactionToRecurringInvestments } from "@/lib/match-recurring-investments";
import { ensureInferredCategories } from "@/lib/infer-category";
import { aiCategorizeTransaction } from "@/lib/ai-categorize";
import { getPlaintextToken } from "@/lib/token-encryption";
import { webhookLimiter, getClientIp } from "@/lib/rate-limiter";
import { createUpApiClient, UpUnauthorizedError, type UpApiClient } from "@/lib/up-api";
import {
  REPLAY_WINDOW_MS,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_SIGNATURE_HEX_REGEX,
} from "@/lib/up-constants";
import type { UpAccount, UpTransaction, UpWebhookEvent } from "@/lib/up-types";
import { ensureCategoryExists, resolveCategorySingle } from "@/lib/resolve-category";

/**
 * Verify the webhook signature using HMAC SHA-256.
 *
 * @see https://developer.up.com.au/#callback_post_webhookURL — Up's signing spec
 *
 * The signed payload is the *entire raw request body*, hex-encoded,
 * compared in constant time. The 64-hex regex pre-check guards against
 * malformed signatures that would crash `timingSafeEqual`.
 */
function verifySignature(
  rawBody: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature) return false;

  try {
    if (!WEBHOOK_SIGNATURE_HEX_REGEX.test(signature)) {
      return false;
    }

    const expectedSig = createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");

    const sigBuffer = Buffer.from(signature, "hex");
    const expectedBuffer = Buffer.from(expectedSig, "hex");

    if (sigBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return timingSafeEqual(sigBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

/**
 * Fetch account details via UpApiClient. Returns null on transient failure
 * so the caller can decide whether to retry — a 401 throws (caller surfaces it).
 */
async function fetchAccount(
  client: UpApiClient,
  accountId: string
): Promise<{ data: UpAccount } | null> {
  try {
    return await client.getAccount(accountId);
  } catch (error) {
    if (error instanceof UpUnauthorizedError) throw error;
    console.error("Error fetching account:", error);
    return null;
  }
}

/**
 * Fetch the full transaction details via UpApiClient. See `fetchAccount`.
 */
async function fetchTransaction(
  client: UpApiClient,
  transactionId: string
): Promise<{ data: UpTransaction } | null> {
  try {
    return await client.getTransaction(transactionId);
  } catch (error) {
    if (error instanceof UpUnauthorizedError) throw error;
    console.error("Error fetching transaction:", error);
    return null;
  }
}

/**
 * Update account balance from Up Bank API
 */
async function updateAccountBalance(
  upAccountId: string,
  client: UpApiClient,
  userId: string
) {
  const supabase = createServiceRoleClient();

  // Fetch current balance from Up Bank
  const accountData = await fetchAccount(client, upAccountId);
  if (!accountData) {
    return;
  }

  const newBalance = accountData.data.attributes.balance.valueInBaseUnits;

  // Update balance for ALL accounts matching this Up Bank account ID.
  // No user_id filter needed: up_account_id is unique per Up Bank account,
  // and both partners may have account rows for the same Up Bank account.
  const { error } = await supabase
    .from("accounts")
    .update({
      balance_cents: newBalance,
      updated_at: new Date().toISOString(),
    })
    .eq("up_account_id", upAccountId);

  if (error) {
    console.error("Error updating account balance:", error);
  }

  // Sync linked savings goals.
  //
  // Behaviour by goal count for a given Saver account:
  //   0 goals → nothing to do.
  //   1 goal  → auto-sync: goal.current_amount_cents = account balance.
  //   2+ goals → DO NOT auto-sync. Multiple goals can't all hold the same
  //              balance (the user would see incorrect progress on each), and
  //              we have no signal to allocate the balance fairly between
  //              them. The user must contribute manually via the goal UI.
  //              (Phase 1.3 fix — was previously assigning newBalance to
  //              every goal.)
  try {
    const { data: accountRows } = await supabase
      .from("accounts")
      .select("id")
      .eq("up_account_id", upAccountId);

    if (accountRows && accountRows.length > 0) {
      const accountIds = accountRows.map((a) => a.id);

      const { data: linkedGoals } = await supabase
        .from("savings_goals")
        .select("id, current_amount_cents, target_amount_cents, partnership_id, linked_account_id")
        .in("linked_account_id", accountIds)
        .eq("is_completed", false);

      if (linkedGoals && linkedGoals.length > 0) {
        // Group by linked_account_id. Only auto-sync when exactly one active
        // goal points at a given account.
        const goalsByAccount = new Map<string, typeof linkedGoals>();
        for (const g of linkedGoals) {
          const list = goalsByAccount.get(g.linked_account_id) ?? [];
          list.push(g);
          goalsByAccount.set(g.linked_account_id, list);
        }

        for (const [accountId, goals] of goalsByAccount.entries()) {
          if (goals.length !== 1) {
            // Skip — let the user manage these manually.
            console.log(
              `Goal sync skipped for account ${accountId}: ${goals.length} active goals share this Saver`
            );
            continue;
          }
          const goal = goals[0];
          if (goal.current_amount_cents === newBalance) continue;

          const delta = newBalance - goal.current_amount_cents;
          const isCompleted = newBalance >= goal.target_amount_cents;

          // Optimistic concurrency: only update if current_amount_cents still
          // matches what we read. Prevents lost updates when multiple webhooks
          // process simultaneously (H26 fix).
          const { data: updatedGoal, error: goalUpdateError } = await supabase
            .from("savings_goals")
            .update({
              current_amount_cents: newBalance,
              is_completed: isCompleted,
              ...(isCompleted ? { completed_at: new Date().toISOString() } : {}),
              updated_at: new Date().toISOString(),
            })
            .eq("id", goal.id)
            .eq("current_amount_cents", goal.current_amount_cents)
            .select("id");

          if (!goalUpdateError && updatedGoal && updatedGoal.length > 0) {
            await supabase.from("goal_contributions").insert({
              goal_id: goal.id,
              amount_cents: delta,
              balance_after_cents: newBalance,
              source: "webhook_sync",
            });
          }
        }
      }
    }
  } catch (err) {
    console.error("Error syncing linked goals:", err);
  }

  // Upsert today's net worth snapshot for the user's partnership
  try {
    const { data: membership } = await supabase
      .from("partnership_members")
      .select("partnership_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (membership) {
      const { data: members } = await supabase
        .from("partnership_members")
        .select("user_id")
        .eq("partnership_id", membership.partnership_id);

      const memberIds = members?.map((m) => m.user_id) || [];

      const { data: allAccounts } = await supabase
        .from("accounts")
        .select("id, display_name, account_type, balance_cents, ownership_type, up_account_id, user_id")
        .in("user_id", memberIds)
        .eq("is_active", true);

      if (allAccounts && allAccounts.length > 0) {
        // Deduplicate JOINT accounts (earliest user_id wins)
        const seenJointIds = new Set<string>();
        const dedupedAccounts = allAccounts.filter((acc) => {
          if (acc.ownership_type === "JOINT" && acc.up_account_id) {
            if (seenJointIds.has(acc.up_account_id)) return false;
            const allForThis = allAccounts.filter(
              (a) => a.up_account_id === acc.up_account_id && a.ownership_type === "JOINT"
            );
            const winner = allForThis.sort((a, b) => a.user_id.localeCompare(b.user_id))[0];
            seenJointIds.add(acc.up_account_id);
            return acc.id === winner.id;
          }
          return true;
        });

        const totalBalance = dedupedAccounts.reduce(
          (sum, acc) => sum + (acc.balance_cents || 0),
          0
        );

        const breakdown = dedupedAccounts.map((acc) => ({
          account_id: acc.id,
          display_name: acc.display_name,
          account_type: acc.account_type,
          balance_cents: acc.balance_cents,
        }));

        // Also include investment total in net worth snapshot
        const { data: investmentsData } = await supabase
          .from("investments")
          .select("current_value_cents")
          .eq("partnership_id", membership.partnership_id);
        const investmentTotal = (investmentsData || []).reduce(
          (sum, inv) => sum + (inv.current_value_cents || 0),
          0
        );

        const today = new Date().toISOString().split("T")[0];

        // Use upsert with onConflict to avoid race condition when
        // concurrent webhook events try to create the same snapshot.
        await supabase.from("net_worth_snapshots").upsert(
          {
            partnership_id: membership.partnership_id,
            snapshot_date: today,
            total_balance_cents: totalBalance,
            account_breakdown: breakdown,
            investment_total_cents: investmentTotal,
          },
          { onConflict: "partnership_id,snapshot_date" }
        );
      }
    }
  } catch (err) {
    console.error("Error upserting net worth snapshot:", err);
  }
}

/**
 * Process a transaction event - upsert to database and match to expenses
 */
async function processTransaction(
  transactionData: { data: UpTransaction },
  userId: string,
  client: UpApiClient
) {
  const supabase = createServiceRoleClient();
  const txn = transactionData.data;

  // 1. Find the account in our database
  // Use only up_account_id (globally unique per UP Bank account) — no user_id filter
  // needed since service role bypasses RLS and up_account_id is unique.
  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("id, ownership_type")
    .eq("up_account_id", txn.relationships.account.data.id)
    .limit(1)
    .maybeSingle();

  if (accountError) {
    console.error("Account lookup error:", accountError.message);
    return;
  }

  if (!account) {
    return;
  }

  // 1.5 Update account balance (transactions affect balance)
  await updateAccountBalance(txn.relationships.account.data.id, client, userId);

  // Also update transfer account balance if applicable
  if (txn.relationships.transferAccount?.data?.id) {
    await updateAccountBalance(txn.relationships.transferAccount.data.id, client, userId);
  }

  // 2. Find transfer account if applicable
  let transferAccountId: string | null = null;
  if (txn.relationships.transferAccount?.data?.id) {
    const { data: transferAccount } = await supabase
      .from("accounts")
      .select("id")
      .eq("up_account_id", txn.relationships.transferAccount.data.id)
      .limit(1)
      .maybeSingle();
    transferAccountId = transferAccount?.id || null;
  }

  // 3. Ensure inferred categories exist + defensive insert if Up sends a
  //    category we haven't synced yet (e.g., Up added a new category mid-month).
  await ensureInferredCategories(supabase);
  await ensureCategoryExists(supabase, txn.relationships.category.data?.id ?? null);
  await ensureCategoryExists(supabase, txn.relationships.parentCategory.data?.id ?? null);

  // 4. Look up existing transaction for override resolution
  const { data: existingTxn } = await supabase
    .from("transactions")
    .select("id")
    .eq("account_id", account.id)
    .eq("up_transaction_id", txn.id)
    .maybeSingle();

  // 5. Resolve category via three-tier resolver
  const { categoryId: finalCategoryId, parentCategoryId: finalParentCategoryId } =
    await resolveCategorySingle(txn, {
      userId,
      supabase,
      transferAccountId,
      existingTxnId: existingTxn?.id ?? null,
    });

  const { data: savedTransaction, error: txnError } = await supabase
    .from("transactions")
    .upsert(
      {
        account_id: account.id,
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
        card_purchase_method: txn.attributes.cardPurchaseMethod?.method || null,
        card_number_suffix:
          txn.attributes.cardPurchaseMethod?.cardNumberSuffix || null,
        transfer_account_id: transferAccountId,
        is_categorizable: txn.attributes.isCategorizable ?? true,
        transaction_type: txn.attributes.transactionType,
        deep_link_url: txn.attributes.deepLinkURL ?? null,
        note_text: txn.attributes.note?.text ?? null,
        has_attachment: txn.relationships.attachment?.data !== null,
        performing_customer: txn.attributes.performingCustomer?.displayName || null,
        is_shared: account?.ownership_type === 'JOINT',
      },
      {
        onConflict: "account_id,up_transaction_id",
      }
    )
    .select("id")
    .single();

  if (txnError) {
    console.error("Error upserting transaction:", txnError);
    return;
  }

  // 4. Handle tags
  if (txn.relationships.tags?.data && Array.isArray(txn.relationships.tags.data)) {
    for (const tag of txn.relationships.tags.data) {
      await supabase.from("tags").upsert({ name: tag.id }, { onConflict: "name" });

      if (savedTransaction) {
        await supabase.from("transaction_tags").upsert(
          {
            transaction_id: savedTransaction.id,
            tag_name: tag.id,
          },
          {
            onConflict: "transaction_id,tag_name",
          }
        );
      }
    }
  }

  // 5. Match to expenses (negative amounts) or income sources (positive amounts)
  if (savedTransaction && txn.attributes.amount.valueInBaseUnits < 0) {
    await matchSingleTransactionToExpenses(
      savedTransaction.id,
      txn.attributes.description,
      account.id,
      txn.attributes.settledAt || txn.attributes.createdAt,
      txn.attributes.amount.valueInBaseUnits
    );

    // 5a. Match to recurring investment rules (debits only — see docs in
    // match-recurring-investments.ts). Resolve the partnership for this
    // user once and pass it through.
    try {
      const { data: membership } = await supabase
        .from("partnership_members")
        .select("partnership_id")
        .eq("user_id", userId)
        .maybeSingle();

      if (membership?.partnership_id) {
        await matchTransactionToRecurringInvestments({
          supabase,
          transactionId: savedTransaction.id,
          description: txn.attributes.description,
          amountCents: txn.attributes.amount.valueInBaseUnits,
          partnershipId: membership.partnership_id,
          contributedAt:
            txn.attributes.settledAt || txn.attributes.createdAt,
        });
      }
    } catch (err) {
      // Detection is best-effort — never block the rest of the pipeline.
      console.error("[recurring-invest] match error:", err);
    }
  } else if (savedTransaction && txn.attributes.amount.valueInBaseUnits > 0) {
    await matchSingleTransactionToIncomeSources(
      savedTransaction.id,
      txn.attributes.description,
      account.id,
      txn.attributes.settledAt || txn.attributes.createdAt,
      txn.attributes.amount.valueInBaseUnits
    );
  }

  // 6. AI categorization for uncategorized transactions (fire-and-forget)
  if (savedTransaction && !finalCategoryId && (txn.attributes.isCategorizable ?? true)) {
    // Fetch user's account IDs to scope the merchant cache query
    const { data: userAccounts } = await supabase
      .from("accounts")
      .select("id")
      .eq("user_id", userId);
    const userAccountIds = userAccounts?.map(a => a.id) || [];

    aiCategorizeTransaction({
      transactionId: savedTransaction.id,
      description: txn.attributes.description,
      amountCents: txn.attributes.amount.valueInBaseUnits,
      userId,
      accountIds: userAccountIds,
    }).catch((err) => console.error("[AI-categorize] Error:", err));
  }

}

/**
 * Process a TRANSACTION_DELETED event
 * Soft-deletes the transaction and removes associated expense matches
 */
async function processTransactionDeletion(upTransactionId: string, userId: string) {
  const supabase = createServiceRoleClient();

  // 1. Scope to the webhook owner's accounts to avoid global search (H14 fix)
  const { data: userAccounts } = await supabase
    .from("accounts")
    .select("id")
    .eq("user_id", userId);

  if (!userAccounts || userAccounts.length === 0) {
    return;
  }

  const accountIds = userAccounts.map((a) => a.id);

  // 2. Find the local transaction scoped to the user's accounts
  const { data: transaction } = await supabase
    .from("transactions")
    .select("id")
    .eq("up_transaction_id", upTransactionId)
    .in("account_id", accountIds)
    .maybeSingle();

  if (!transaction) {
    return;
  }

  // 3. Remove associated expense matches
  const { data: matches } = await supabase
    .from("expense_matches")
    .select("id, expense_definition_id")
    .eq("transaction_id", transaction.id);

  if (matches && matches.length > 0) {
    await supabase
      .from("expense_matches")
      .delete()
      .eq("transaction_id", transaction.id);

  }

  // 4. Soft-delete the transaction (mark as deleted)
  const { error: updateError } = await supabase
    .from("transactions")
    .update({
      status: "DELETED",
      updated_at: new Date().toISOString(),
    })
    .eq("id", transaction.id);

  if (updateError) {
    console.error("Error soft-deleting transaction:", updateError);
  }
}

export async function POST(request: Request) {
  try {
    // Rate limit by IP to prevent webhook endpoint abuse
    const ip = getClientIp(request);
    const rateCheck = webhookLimiter.check(ip);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(Math.ceil((rateCheck.retryAfterMs || 60000) / 1000)) } }
      );
    }

    // 1. Get raw body for signature verification
    const rawBody = await request.text();
    const signature = request.headers.get(WEBHOOK_SIGNATURE_HEADER);

    // 2. Parse payload to get webhook ID
    let payload: UpWebhookEvent;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      console.error("Invalid JSON payload");
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const webhookId = payload.data?.relationships?.webhook?.data?.id;
    if (!webhookId) {
      console.error("Missing webhook ID in payload");
      return NextResponse.json({ error: "Missing webhook ID" }, { status: 400 });
    }

    // 3. Look up webhook secret from database (using service role to bypass RLS)
    const supabase = createServiceRoleClient();
    const { data: config, error: configError } = await supabase
      .from("up_api_configs")
      .select("webhook_secret, encrypted_token, user_id")
      .eq("webhook_id", webhookId)
      .maybeSingle();

    if (configError || !config) {
      console.error("Webhook not found:", webhookId);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 4. Verify signature (decrypt the stored webhook secret first)
    const webhookSecret = getPlaintextToken(config.webhook_secret);
    if (!webhookSecret) {
      console.error("Webhook secret is null/empty — rejecting request");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!verifySignature(rawBody, signature, webhookSecret)) {
      console.error("Invalid webhook signature");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 4.5 Replay protection - reject events outside the configured window
    const eventTime = new Date(payload.data.attributes.createdAt).getTime();
    if (Number.isNaN(eventTime)) {
      console.error("Invalid createdAt timestamp in webhook event");
      return NextResponse.json({ error: "Invalid timestamp" }, { status: 400 });
    }
    const now = Date.now();
    if (Math.abs(now - eventTime) > REPLAY_WINDOW_MS) {
      console.error("Webhook event too old or from the future, possible replay attack");
      return NextResponse.json({ error: "Event expired" }, { status: 400 });
    }

    // 4.6 Decrypt the API token and build a typed client
    const apiToken = getPlaintextToken(config.encrypted_token);
    const client = createUpApiClient(apiToken);

    // 5. Handle event
    const eventType = payload.data.attributes.eventType;

    switch (eventType) {
      case "PING":
        // Just acknowledge ping events
        break;

      case "TRANSACTION_CREATED":
      case "TRANSACTION_SETTLED": {
        const txnId = payload.data.relationships.transaction?.data?.id;
        if (!txnId) {
          console.error("Missing transaction ID in event");
          break;
        }

        // Fetch full transaction details from UP Bank API
        const transactionData = await fetchTransaction(client, txnId);

        if (transactionData) {
          await processTransaction(transactionData, config.user_id, client);
        } else if (eventType === "TRANSACTION_SETTLED") {
          // Fallback: if we can't fetch the transaction but this is a SETTLED event,
          // try to update the existing HELD record directly
          // fetchTransaction failed for SETTLED event, attempt direct status update
          const fallbackSupabase = createServiceRoleClient();
          const { data: existingTxn } = await fallbackSupabase
            .from("transactions")
            .select("id, account_id")
            .eq("up_transaction_id", txnId)
            .eq("status", "HELD")
            .maybeSingle();

          if (existingTxn) {
            const { error: updateErr } = await fallbackSupabase
              .from("transactions")
              .update({
                status: "SETTLED",
                settled_at: new Date().toISOString(),
              })
              .eq("id", existingTxn.id);

            if (updateErr) {
              console.error("Fallback SETTLED update failed:", updateErr.message);
            }
          } else {
            console.error(`Could not fetch or find transaction ${txnId} for SETTLED event`);
            // Return 500 so UP Bank retries
            return NextResponse.json(
              { success: false, error: "Failed to process SETTLED event" },
              { status: 500 }
            );
          }
        } else {
          // TRANSACTION_CREATED but fetchTransaction failed — return 500 to retry
          console.error("Failed to fetch transaction for CREATED event:", txnId);
          return NextResponse.json(
            { success: false, error: "Failed to fetch transaction" },
            { status: 500 }
          );
        }
        break;
      }

      case "TRANSACTION_DELETED": {
        const deletedTxnId = payload.data.relationships.transaction?.data?.id;
        if (deletedTxnId) {
          await processTransactionDeletion(deletedTxnId, config.user_id);
        }
        break;
      }

      default:
        // Unknown event type, ignore
    }

    // Bust cached pages so next visit sees fresh data
    revalidatePath("/home");
    revalidatePath("/budget");
    revalidatePath("/goals");
    revalidatePath("/activity");
    revalidatePath("/analysis");
    revalidatePath("/invest");

    // Always return 200 OK to acknowledge receipt
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    // Distinguish PAT-revoked from other failures so we don't retry forever
    if (error instanceof UpUnauthorizedError) {
      console.error("Webhook handler: PAT revoked or invalid", error.firstError?.detail ?? "");
      return NextResponse.json(
        { success: false, error: "Up Bank authentication failed" },
        { status: 401 }
      );
    }
    console.error("Webhook handler error:", error);
    // Return 500 so UP Bank retries the webhook delivery
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Disable body parsing since we need the raw body for signature verification
export const runtime = "nodejs";
