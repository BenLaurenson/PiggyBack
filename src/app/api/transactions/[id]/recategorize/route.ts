import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { parseBody, validateUuidParam } from "@/lib/validation";
import { generalApiLimiter } from "@/lib/rate-limiter";

/**
 * PATCH /api/transactions/[id]/recategorize
 *
 * Recategorize a transaction locally (LOCAL ONLY - does NOT sync to UP Bank API)
 * Optionally applies a merchant rule to all past + future transactions from that merchant.
 *
 * Request Body:
 * {
 *   category_id: string | null,
 *   apply_to_merchant?: boolean,
 *   notes?: string
 * }
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateCheck = generalApiLimiter.check(user.id);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rateCheck.retryAfterMs || 60000) / 1000)) } }
    );
  }

  const { id: transactionId } = await params;

  const idError = validateUuidParam(transactionId);
  if (idError) return idError;

  const recategorizeSchema = z.object({
    category_id: z.string().max(100).nullable(),
    apply_to_merchant: z.boolean().optional(),
    notes: z.string().max(500).optional(),
  });
  const parsed = await parseBody(request, recategorizeSchema);
  if (parsed.response) return parsed.response;
  const { category_id, apply_to_merchant, notes } = parsed.data;

  try {
    // Resolve the correct parent_category_id from the categories table
    let resolvedParentCategoryId: string | null = null;
    if (category_id) {
      const { data: categoryRecord } = await supabase
        .from("categories")
        .select("parent_category_id")
        .eq("id", category_id)
        .maybeSingle();
      resolvedParentCategoryId = categoryRecord?.parent_category_id || null;
    }

    // 1. Verify user owns this transaction (via account ownership)
    const { data: transaction, error: fetchError } = await supabase
      .from("transactions")
      .select(`
        id,
        category_id,
        parent_category_id,
        account_id,
        description
      `)
      .eq("id", transactionId)
      .maybeSingle();

    if (fetchError || !transaction) {
      return NextResponse.json(
        { error: "Transaction not found" },
        { status: 404 }
      );
    }

    // Check account ownership
    const { data: account } = await supabase
      .from("accounts")
      .select("user_id")
      .eq("id", transaction.account_id)
      .maybeSingle();

    if (!account || account.user_id !== user.id) {
      return NextResponse.json(
        { error: "You can only recategorize your own transactions" },
        { status: 403 }
      );
    }

    // 2. Create/update override for this transaction
    const { data: existingOverride } = await supabase
      .from("transaction_category_overrides")
      .select("*")
      .eq("transaction_id", transactionId)
      .maybeSingle();

    let overrideCreated = false;

    if (!existingOverride) {
      const { error: insertError } = await supabase
        .from("transaction_category_overrides")
        .insert({
          transaction_id: transactionId,
          original_category_id: transaction.category_id,
          original_parent_category_id: transaction.parent_category_id,
          override_category_id: category_id,
          override_parent_category_id: resolvedParentCategoryId,
          changed_by: user.id,
          notes: notes || null,
        });

      if (insertError) {
        console.error("Failed to create override:", insertError);
        return NextResponse.json(
          { error: "Failed to create category override" },
          { status: 500 }
        );
      }

      overrideCreated = true;
    } else {
      const { error: updateError } = await supabase
        .from("transaction_category_overrides")
        .update({
          override_category_id: category_id,
          override_parent_category_id: resolvedParentCategoryId,
          changed_at: new Date().toISOString(),
          notes: notes || existingOverride.notes,
        })
        .eq("id", existingOverride.id);

      if (updateError) {
        console.error("Failed to update override:", updateError);
        return NextResponse.json(
          { error: "Failed to update category override" },
          { status: 500 }
        );
      }
    }

    // 3. Update this transaction's categories
    const { error: updateTxnError } = await supabase
      .from("transactions")
      .update({
        category_id,
        parent_category_id: resolvedParentCategoryId,
      })
      .eq("id", transactionId);

    if (updateTxnError) {
      console.error("Failed to update transaction:", updateTxnError);
      return NextResponse.json(
        { error: "Failed to update transaction category" },
        { status: 500 }
      );
    }

    // 4. Merchant rule + bulk update (if requested)
    let bulkUpdatedCount = 0;
    let merchantRuleCreated = false;

    if (apply_to_merchant && category_id && transaction.description) {
      // a) Upsert merchant rule
      const { error: ruleError } = await supabase
        .from("merchant_category_rules")
        .upsert(
          {
            user_id: user.id,
            merchant_description: transaction.description,
            category_id: category_id,
            parent_category_id: resolvedParentCategoryId,
          },
          { onConflict: "user_id,merchant_description" }
        );

      if (ruleError) {
        console.error("Failed to create merchant rule:", ruleError);
      } else {
        merchantRuleCreated = true;
      }

      // b) Find all user's accounts
      const { data: userAccounts } = await supabase
        .from("accounts")
        .select("id")
        .eq("user_id", user.id);

      const accountIds = userAccounts?.map((a: any) => a.id) || [];

      if (accountIds.length > 0) {
        // c) Find other transactions from this merchant
        const { data: merchantTxns } = await supabase
          .from("transactions")
          .select("id, category_id, parent_category_id")
          .in("account_id", accountIds)
          .eq("description", transaction.description)
          .neq("id", transactionId);

        if (merchantTxns && merchantTxns.length > 0) {
          const txnIds = merchantTxns.map((t: any) => t.id);
          bulkUpdatedCount = txnIds.length;

          // d) Bulk update all matching transactions
          await supabase
            .from("transactions")
            .update({
              category_id: category_id,
              parent_category_id: resolvedParentCategoryId,
            })
            .in("id", txnIds);

          // e) Create/update override records for audit trail
          const { data: existingOverrides } = await supabase
            .from("transaction_category_overrides")
            .select("transaction_id")
            .in("transaction_id", txnIds);

          const overriddenIds = new Set(
            existingOverrides?.map((o: any) => o.transaction_id) || []
          );

          // New overrides for transactions that don't have one
          const newOverrides = merchantTxns
            .filter((t: any) => !overriddenIds.has(t.id))
            .map((t: any) => ({
              transaction_id: t.id,
              original_category_id: t.category_id,
              original_parent_category_id: t.parent_category_id,
              override_category_id: category_id,
              override_parent_category_id: resolvedParentCategoryId,
              changed_by: user.id,
              notes: `Merchant rule: All "${transaction.description}" transactions`,
            }));

          // Batch insert new overrides
          const BATCH_SIZE = 100;
          for (let i = 0; i < newOverrides.length; i += BATCH_SIZE) {
            const batch = newOverrides.slice(i, i + BATCH_SIZE);
            await supabase
              .from("transaction_category_overrides")
              .insert(batch);
          }

          // Update existing overrides
          const existingIds = merchantTxns
            .filter((t: any) => overriddenIds.has(t.id))
            .map((t: any) => t.id);

          if (existingIds.length > 0) {
            await supabase
              .from("transaction_category_overrides")
              .update({
                override_category_id: category_id,
                override_parent_category_id: resolvedParentCategoryId,
                changed_at: new Date().toISOString(),
                notes: `Merchant rule: All "${transaction.description}" transactions`,
              })
              .in("transaction_id", existingIds);
          }
        }
      }
    }

    // 5. Fetch updated transaction
    const { data: updatedTransaction } = await supabase
      .from("transactions")
      .select(`
        *,
        category:categories!category_id(id, name),
        parent_category:categories!parent_category_id(id, name),
        transaction_category_overrides(
          original_category_id,
          override_category_id,
          changed_by,
          changed_at,
          notes
        )
      `)
      .eq("id", transactionId)
      .maybeSingle();

    // 6. Get modern category display name
    const { data: categoryMapping } = await supabase
      .from("category_mappings")
      .select("new_parent_name, new_child_name, icon")
      .eq("up_category_id", category_id)
      .maybeSingle();

    return NextResponse.json({
      success: true,
      transaction: updatedTransaction,
      modern_category_name: categoryMapping?.new_parent_name || 'Miscellaneous',
      modern_subcategory_name: categoryMapping?.new_child_name,
      category_icon: categoryMapping?.icon || '?',
      override_created: overrideCreated,
      invalidated_expense_matches: true,
      merchant_rule_created: merchantRuleCreated,
      bulk_updated_count: bulkUpdatedCount,
    });

  } catch (error) {
    console.error("Recategorization error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/transactions/[id]/recategorize
 *
 * Reset transaction to original UP Bank categorization
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateCheck = generalApiLimiter.check(user.id);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rateCheck.retryAfterMs || 60000) / 1000)) } }
    );
  }

  const { id: transactionId } = await params;

  const idError = validateUuidParam(transactionId);
  if (idError) return idError;

  try {
    const { data: override, error: fetchError } = await supabase
      .from("transaction_category_overrides")
      .select("*")
      .eq("transaction_id", transactionId)
      .maybeSingle();

    if (fetchError || !override) {
      return NextResponse.json(
        { error: "No override found for this transaction" },
        { status: 404 }
      );
    }

    if (override.changed_by !== user.id) {
      return NextResponse.json(
        { error: "You can only reset your own category changes" },
        { status: 403 }
      );
    }

    const { error: restoreError } = await supabase
      .from("transactions")
      .update({
        category_id: override.original_category_id,
        parent_category_id: override.original_parent_category_id,
      })
      .eq("id", transactionId);

    if (restoreError) {
      console.error("Failed to restore categories:", restoreError);
      return NextResponse.json(
        { error: "Failed to restore original categories" },
        { status: 500 }
      );
    }

    const { error: deleteError } = await supabase
      .from("transaction_category_overrides")
      .delete()
      .eq("id", override.id);

    if (deleteError) {
      console.error("Failed to delete override:", deleteError);
      return NextResponse.json(
        { error: "Failed to delete override record" },
        { status: 500 }
      );
    }

    const { data: updatedTransaction } = await supabase
      .from("transactions")
      .select(`
        *,
        category:categories!category_id(id, name),
        parent_category:categories!parent_category_id(id, name)
      `)
      .eq("id", transactionId)
      .maybeSingle();

    return NextResponse.json({
      success: true,
      transaction: updatedTransaction,
      reset_to_original: true,
    });

  } catch (error) {
    console.error("Reset error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
