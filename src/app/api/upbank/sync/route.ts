import { createClient } from "@/utils/supabase/server";
import { getPlaintextToken } from "@/lib/token-encryption";
import { inferCategoryId } from "@/lib/infer-category";

export const maxDuration = 300; // 5 minutes for long syncs

function sortCategoriesParentFirst(categories: any[]): any[] {
  const sorted: any[] = [];
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

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: config } = await supabase
    .from("up_api_configs")
    .select("encrypted_token, last_synced_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!config?.encrypted_token) {
    return Response.json({ error: "Up Bank not connected" }, { status: 400 });
  }

  const apiToken = getPlaintextToken(config.encrypted_token);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
      };

      try {
        // Phase: Sync categories
        send({ phase: "syncing-categories", message: "Syncing categories..." });

        const categoriesRes = await fetch(
          "https://api.up.com.au/api/v1/categories",
          { headers: { Authorization: `Bearer ${apiToken}` } }
        );
        if (categoriesRes.ok) {
          const { data: upCategories } = await categoriesRes.json();
          const sortedCategories = sortCategoriesParentFirst(upCategories);
          for (const category of sortedCategories) {
            await supabase.from("categories").upsert(
              {
                id: category.id,
                name: category.attributes.name,
                parent_category_id:
                  category.relationships.parent.data?.id || null,
              },
              { onConflict: "id" }
            );
          }
        }

        // Phase: Sync accounts
        send({ phase: "syncing-accounts", message: "Syncing your accounts..." });

        const accountsRes = await fetch(
          "https://api.up.com.au/api/v1/accounts",
          { headers: { Authorization: `Bearer ${apiToken}` } }
        );
        if (!accountsRes.ok) {
          send({
            phase: "error",
            message: "Failed to fetch accounts from Up Bank",
          });
          controller.close();
          return;
        }

        const { data: upAccounts } = await accountsRes.json();

        // Pre-load overrides and merchant rules for category resolution
        const { data: allOverrides } = await supabase
          .from("transaction_category_overrides")
          .select(
            "transaction_id, override_category_id, override_parent_category_id"
          );

        const overridesByTxnId = new Map(
          (allOverrides || []).map((o: any) => [o.transaction_id, o])
        );

        const { data: merchantRules } = await supabase
          .from("merchant_category_rules")
          .select("merchant_description, category_id, parent_category_id")
          .eq("user_id", user.id);

        const merchantRulesByDesc = new Map(
          (merchantRules || []).map((r: any) => [r.merchant_description, r])
        );

        // Phase: Sync transactions
        send({
          phase: "syncing-transactions",
          message: "Syncing transactions...",
          txnCount: 0,
        });

        let totalTxns = 0;

        for (const account of upAccounts) {
          send({
            phase: "syncing-transactions",
            message: `Syncing ${account.attributes.displayName}...`,
            txnCount: totalTxns,
          });

          const { data: savedAccount } = await supabase
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
                last_synced_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
              { onConflict: "user_id,up_account_id" }
            )
            .select()
            .single();

          if (!savedAccount) continue;

          // Pre-load existing transaction IDs for override lookup
          const { data: existingTxns } = await supabase
            .from("transactions")
            .select("id, up_transaction_id")
            .eq("account_id", savedAccount.id);

          const txnIdByUpId = new Map(
            (existingTxns || []).map((t: any) => [t.up_transaction_id, t.id])
          );

          const twelveMonthsAgo = new Date();
          twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

          const lastSyncTime = config.last_synced_at
            ? new Date(config.last_synced_at)
            : twelveMonthsAgo;
          const sinceDate =
            lastSyncTime > twelveMonthsAgo ? lastSyncTime : twelveMonthsAgo;

          let nextUrl: string | null = `https://api.up.com.au/api/v1/accounts/${account.id}/transactions?page[size]=100&filter[since]=${sinceDate.toISOString()}`;

          while (nextUrl) {
            const transactionsRes = await fetch(nextUrl, {
              headers: { Authorization: `Bearer ${apiToken}` },
            });

            if (!transactionsRes.ok) break;

            const txnData: any = await transactionsRes.json();

            for (const txn of txnData.data) {
              let transferAccountId = null;
              if (txn.relationships.transferAccount?.data?.id) {
                const { data: transferAccount } = await supabase
                  .from("accounts")
                  .select("id")
                  .eq(
                    "up_account_id",
                    txn.relationships.transferAccount.data.id
                  )
                  .eq("user_id", user.id)
                  .maybeSingle();
                transferAccountId = transferAccount?.id || null;
              }

              // Resolve category: override > merchant rule > infer
              let finalCategoryId = inferCategoryId({
                upCategoryId:
                  txn.relationships.category.data?.id || null,
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
                  finalParentCategoryId =
                    override.override_parent_category_id;
                }
              }

              await supabase.from("transactions").upsert(
                {
                  account_id: savedAccount.id,
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
                    txn.attributes.holdInfo?.foreignAmount?.valueInBaseUnits ||
                    null,
                  hold_info_foreign_currency_code:
                    txn.attributes.holdInfo?.foreignAmount?.currencyCode || null,
                  round_up_amount_cents:
                    txn.attributes.roundUp?.amount?.valueInBaseUnits || null,
                  round_up_boost_cents:
                    txn.attributes.roundUp?.boostPortion?.valueInBaseUnits ||
                    null,
                  cashback_amount_cents:
                    txn.attributes.cashback?.amount?.valueInBaseUnits || null,
                  cashback_description:
                    txn.attributes.cashback?.description || null,
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
                },
                { onConflict: "account_id,up_transaction_id" }
              );

              // Sync tags
              if (
                txn.relationships.tags?.data &&
                Array.isArray(txn.relationships.tags.data)
              ) {
                for (const tag of txn.relationships.tags.data) {
                  await supabase
                    .from("tags")
                    .upsert({ name: tag.id }, { onConflict: "name" });

                  const { data: savedTransaction } = await supabase
                    .from("transactions")
                    .select("id")
                    .eq("up_transaction_id", txn.id)
                    .eq("account_id", savedAccount.id)
                    .maybeSingle();

                  if (savedTransaction) {
                    await supabase.from("transaction_tags").upsert(
                      {
                        transaction_id: savedTransaction.id,
                        tag_name: tag.id,
                      },
                      { onConflict: "transaction_id,tag_name" }
                    );
                  }
                }
              }

              totalTxns++;
              if (totalTxns % 25 === 0) {
                send({
                  phase: "syncing-transactions",
                  message: `Syncing ${account.attributes.displayName}... ${totalTxns} transactions`,
                  txnCount: totalTxns,
                });
              }
            }

            nextUrl = txnData.links?.next || null;
          }
        }

        // Phase: Finishing
        send({
          phase: "finishing",
          message: "Finishing up...",
          txnCount: totalTxns,
        });

        await supabase
          .from("up_api_configs")
          .update({ last_synced_at: new Date().toISOString() })
          .eq("user_id", user.id);

        send({
          phase: "done",
          message: `Synced ${totalTxns} transactions!`,
          txnCount: totalTxns,
        });
      } catch (err) {
        send({
          phase: "error",
          message: err instanceof Error ? err.message : "Sync failed",
        });
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
