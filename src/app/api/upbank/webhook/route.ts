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
import { createHmac, timingSafeEqual } from "crypto";
import { matchSingleTransactionToExpenses, matchSingleTransactionToIncomeSources } from "@/lib/match-expense-transactions";
import { inferCategoryId } from "@/lib/infer-category";
import { aiCategorizeTransaction } from "@/lib/ai-categorize";
import { getPlaintextToken } from "@/lib/token-encryption";
import { webhookLimiter, getClientIp } from "@/lib/rate-limiter";

// Up Bank Webhook Event Types
type WebhookEventType =
  | "TRANSACTION_CREATED"
  | "TRANSACTION_SETTLED"
  | "TRANSACTION_DELETED"
  | "PING";

interface WebhookPayload {
  data: {
    type: "webhook-events";
    id: string;
    attributes: {
      eventType: WebhookEventType;
      createdAt: string;
    };
    relationships: {
      webhook: {
        data: {
          type: "webhooks";
          id: string;
        };
        links?: {
          related: string;
        };
      };
      transaction?: {
        data: {
          type: "transactions";
          id: string;
        };
        links?: {
          related: string;
        };
      };
    };
  };
}

interface UpTransaction {
  data: {
    type: "transactions";
    id: string;
    attributes: {
      status: "HELD" | "SETTLED";
      rawText: string | null;
      description: string;
      message: string | null;
      isCategorizable: boolean;
      holdInfo: {
        amount: { valueInBaseUnits: number; currencyCode: string };
        foreignAmount: { valueInBaseUnits: number; currencyCode: string } | null;
      } | null;
      roundUp: {
        amount: { valueInBaseUnits: number };
        boostPortion: { valueInBaseUnits: number } | null;
      } | null;
      cashback: {
        description: string;
        amount: { valueInBaseUnits: number };
      } | null;
      amount: {
        currencyCode: string;
        value: string;
        valueInBaseUnits: number;
      };
      foreignAmount: {
        currencyCode: string;
        valueInBaseUnits: number;
      } | null;
      cardPurchaseMethod: {
        method: string;
        cardNumberSuffix: string | null;
      } | null;
      settledAt: string | null;
      createdAt: string;
      performingCustomer?: { displayName: string } | null;
    };
    relationships: {
      account: {
        data: { type: "accounts"; id: string };
      };
      transferAccount: {
        data: { type: "accounts"; id: string } | null;
      };
      category: {
        data: { type: "categories"; id: string } | null;
      };
      parentCategory: {
        data: { type: "categories"; id: string } | null;
      };
      tags: {
        data: Array<{ type: "tags"; id: string }>;
      };
    };
  };
}

/**
 * Verify the webhook signature using HMAC SHA-256
 */
function verifySignature(
  rawBody: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature) return false;

  try {
    // Validate hex format and length before comparison.
    // SHA-256 produces 64 hex chars. Buffer.from with invalid hex silently
    // creates a wrong-length buffer, causing timingSafeEqual to throw.
    const HEX_REGEX = /^[0-9a-f]{64}$/i;
    if (!HEX_REGEX.test(signature)) {
      return false;
    }

    const expectedSig = createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");

    const sigBuffer = Buffer.from(signature, "hex");
    const expectedBuffer = Buffer.from(expectedSig, "hex");

    // Double-check buffer lengths match (defensive)
    if (sigBuffer.length !== expectedBuffer.length) {
      return false;
    }

    // Use timing-safe comparison to prevent timing attacks
    return timingSafeEqual(sigBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

interface UpAccount {
  data: {
    type: "accounts";
    id: string;
    attributes: {
      displayName: string;
      accountType: "SAVER" | "TRANSACTIONAL" | "HOME_LOAN";
      ownershipType: "INDIVIDUAL" | "JOINT";
      balance: {
        currencyCode: string;
        value: string;
        valueInBaseUnits: number;
      };
    };
  };
}

// Validate Up Bank IDs before interpolating into URLs to prevent SSRF.
// IDs are opaque strings — only allow safe alphanumeric/dash/underscore characters.
const UP_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;

/**
 * Fetch account details from Up Bank API to get current balance
 */
async function fetchAccount(
  accountId: string,
  token: string
): Promise<UpAccount | null> {
  if (!UP_ID_REGEX.test(accountId)) return null;
  try {
    const response = await fetch(
      `https://api.up.com.au/api/v1/accounts/${accountId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      console.error("Failed to fetch account:", response.status);
      return null;
    }

    return response.json();
  } catch (error) {
    console.error("Error fetching account:", error);
    return null;
  }
}

/**
 * Fetch the full transaction details from Up Bank API
 */
async function fetchTransaction(
  transactionId: string,
  token: string
): Promise<UpTransaction | null> {
  if (!UP_ID_REGEX.test(transactionId)) return null;
  try {
    const response = await fetch(
      `https://api.up.com.au/api/v1/transactions/${transactionId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      console.error("Failed to fetch transaction:", response.status);
      return null;
    }

    return response.json();
  } catch (error) {
    console.error("Error fetching transaction:", error);
    return null;
  }
}

/**
 * Update account balance from Up Bank API
 */
async function updateAccountBalance(
  upAccountId: string,
  token: string,
  userId: string
) {
  const supabase = createServiceRoleClient();

  // Fetch current balance from Up Bank
  const accountData = await fetchAccount(upAccountId, token);
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

  // Sync any linked savings goals
  try {
    const { data: accountRows } = await supabase
      .from("accounts")
      .select("id")
      .eq("up_account_id", upAccountId);

    if (accountRows && accountRows.length > 0) {
      const accountIds = accountRows.map((a) => a.id);

      const { data: linkedGoals } = await supabase
        .from("savings_goals")
        .select("id, current_amount_cents, target_amount_cents")
        .in("linked_account_id", accountIds)
        .eq("is_completed", false);

      if (linkedGoals && linkedGoals.length > 0) {
        for (const goal of linkedGoals) {
          if (goal.current_amount_cents !== newBalance) {
            const delta = newBalance - goal.current_amount_cents;
            const isCompleted = newBalance >= goal.target_amount_cents;

            // Use optimistic concurrency: only update if current_amount_cents
            // still matches what we read. This prevents lost updates when
            // multiple webhooks process simultaneously (H26 fix).
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

            // Only record contribution if our update actually took effect
            // (i.e., no other webhook updated the goal between our read and write)
            if (!goalUpdateError && updatedGoal && updatedGoal.length > 0) {
              await supabase
                .from("goal_contributions")
                .insert({
                  goal_id: goal.id,
                  amount_cents: delta,
                  balance_after_cents: newBalance,
                  source: "webhook_sync",
                });
            }
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
  transactionData: UpTransaction,
  userId: string,
  token: string
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
  await updateAccountBalance(txn.relationships.account.data.id, token, userId);

  // Also update transfer account balance if applicable
  if (txn.relationships.transferAccount?.data?.id) {
    await updateAccountBalance(txn.relationships.transferAccount.data.id, token, userId);
  }

  // 2. Find transfer account if applicable
  let transferAccountId = null;
  if (txn.relationships.transferAccount?.data?.id) {
    const { data: transferAccount } = await supabase
      .from("accounts")
      .select("id")
      .eq("up_account_id", txn.relationships.transferAccount.data.id)
      .limit(1)
      .maybeSingle();
    transferAccountId = transferAccount?.id || null;
  }

  // 3. Infer category + check merchant rules
  const categoryId = inferCategoryId({
    upCategoryId: txn.relationships.category.data?.id || null,
    transferAccountId,
    roundUpAmountCents: txn.attributes.roundUp?.amount?.valueInBaseUnits || null,
    transactionType: (txn.attributes as Record<string, unknown>).transactionType as string || null,
    description: txn.attributes.description,
    amountCents: txn.attributes.amount.valueInBaseUnits,
  });

  // Check merchant category rules (user's explicit rules take precedence)
  let finalCategoryId = categoryId;
  let finalParentCategoryId = txn.relationships.parentCategory.data?.id || null;

  const { data: merchantRule } = await supabase
    .from("merchant_category_rules")
    .select("category_id, parent_category_id")
    .eq("user_id", userId)
    .eq("merchant_description", txn.attributes.description)
    .maybeSingle();

  if (merchantRule) {
    finalCategoryId = merchantRule.category_id;
    finalParentCategoryId = merchantRule.parent_category_id;
  }

  // Check if this transaction already exists with a user override (highest priority)
  const { data: existingTxn } = await supabase
    .from("transactions")
    .select("id")
    .eq("account_id", account.id)
    .eq("up_transaction_id", txn.id)
    .maybeSingle();

  if (existingTxn) {
    const { data: override } = await supabase
      .from("transaction_category_overrides")
      .select("override_category_id, override_parent_category_id")
      .eq("transaction_id", existingTxn.id)
      .maybeSingle();

    if (override) {
      finalCategoryId = override.override_category_id;
      finalParentCategoryId = override.override_parent_category_id;
    }
  }

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
        transaction_type: (txn.attributes as Record<string, unknown>).transactionType as string || null,
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
    const signature = request.headers.get("X-Up-Authenticity-Signature");

    // 2. Parse payload to get webhook ID
    let payload: WebhookPayload;
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

    // 4.5 Replay protection - reject events older than 5 minutes
    const eventTime = new Date(payload.data.attributes.createdAt).getTime();
    if (Number.isNaN(eventTime)) {
      console.error("Invalid createdAt timestamp in webhook event");
      return NextResponse.json({ error: "Invalid timestamp" }, { status: 400 });
    }
    const now = Date.now();
    const FIVE_MINUTES = 5 * 60 * 1000;
    if (Math.abs(now - eventTime) > FIVE_MINUTES) {
      console.error("Webhook event too old or from the future, possible replay attack");
      return NextResponse.json({ error: "Event expired" }, { status: 400 });
    }

    // 4.6 Decrypt the API token
    const apiToken = getPlaintextToken(config.encrypted_token);

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
        const transactionData = await fetchTransaction(txnId, apiToken);

        if (transactionData) {
          await processTransaction(transactionData, config.user_id, apiToken);
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

    // Always return 200 OK to acknowledge receipt
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
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
