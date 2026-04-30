import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { generalReadLimiter } from "@/lib/rate-limiter";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateCheck = generalReadLimiter.check(user.id);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rateCheck.retryAfterMs || 60000) / 1000)) } }
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const offset = parseInt(searchParams.get("offset") || "0");
  const limit = Math.min(parseInt(searchParams.get("limit") || "25", 10) || 25, 200);
  // Cursor pagination: pass `?cursor=<created_at_iso>` to get the next page
  // without OFFSET (which gets slow at depth on large activity feeds).
  // The caller should pass the `created_at` of the last row from the previous
  // page; we return rows with `created_at < cursor`. When cursor is set,
  // `offset` is ignored.
  const cursor = searchParams.get("cursor");
  const search = searchParams.get("search") || "";
  const accountId = searchParams.get("accountId");
  const categoryId = searchParams.get("categoryId");
  const years = searchParams.get("years");
  const status = searchParams.get("status");
  const minAmount = searchParams.get("minAmount");
  const maxAmount = searchParams.get("maxAmount");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const year = searchParams.get("year");
  const dateRange = searchParams.get("dateRange");
  const includeTransfers = searchParams.get("includeTransfers") === "true";
  const incomeMode = searchParams.get("incomeMode") || "all_positive";

  // Validate UUID format for comma-separated ID parameters
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const MAX_IDS = 50;

  if (accountId && accountId !== "all") {
    if (accountId.includes(',')) {
      const ids = accountId.split(',').filter(Boolean);
      if (ids.length > MAX_IDS) {
        return NextResponse.json(
          { error: `Too many account IDs. Maximum ${MAX_IDS} allowed.` },
          { status: 400 }
        );
      }
      const invalidIds = ids.filter(id => !UUID_REGEX.test(id));
      if (invalidIds.length > 0) {
        return NextResponse.json(
          { error: `Invalid UUID format in accountId: ${invalidIds[0]}` },
          { status: 400 }
        );
      }
    } else if (!UUID_REGEX.test(accountId)) {
      return NextResponse.json(
        { error: `Invalid UUID format in accountId: ${accountId}` },
        { status: 400 }
      );
    }
  }

  if (categoryId && categoryId !== "all") {
    if (categoryId.includes(',')) {
      const ids = categoryId.split(',').filter(Boolean);
      if (ids.length > MAX_IDS) {
        return NextResponse.json(
          { error: `Too many category IDs. Maximum ${MAX_IDS} allowed.` },
          { status: 400 }
        );
      }
      const invalidIds = ids.filter(id => !UUID_REGEX.test(id));
      if (invalidIds.length > 0) {
        return NextResponse.json(
          { error: `Invalid UUID format in categoryId: ${invalidIds[0]}` },
          { status: 400 }
        );
      }
    } else if (!UUID_REGEX.test(categoryId)) {
      return NextResponse.json(
        { error: `Invalid UUID format in categoryId: ${categoryId}` },
        { status: 400 }
      );
    }
  }

  // Get user's accounts
  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, display_name")
    .eq("user_id", user.id)
    .eq("is_active", true);

  const accountIds = accounts?.map(a => a.id) || [];

  // Build query — exclude soft-deleted rows by default (TRANSACTION_DELETED
  // events from Up Bank set deleted_at; we still keep the rows for budget
  // history but they should not show up in the activity list).
  let query = supabase
    .from("transactions")
    .select(`
      *,
      category:categories!category_id(id, name),
      parent_category:categories!parent_category_id(id, name),
      transaction_tags(tag_name),
      transaction_notes(id, note, is_partner_visible, user_id)
    `, { count: "exact" })
    .in("account_id", accountIds)
    .is("deleted_at", null);

  // Apply filters
  if (search) {
    const escapedSearch = search.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
    query = query.ilike("description", `%${escapedSearch}%`);
  }

  if (accountId && accountId !== "all") {
    // Handle comma-separated account IDs (multi-select)
    if (accountId.includes(',')) {
      const ids = accountId.split(',').filter(Boolean);
      query = query.in('account_id', ids);
    } else {
      query = query.eq("account_id", accountId);
    }
  }

  if (categoryId && categoryId !== "all") {
    // Handle comma-separated IDs (modern category parent selected)
    if (categoryId.includes(',')) {
      const ids = categoryId.split(',').filter(Boolean);
      query = query.in('category_id', ids);
    } else {
      // Single category ID (backward compat)
      query = query.or(`category_id.eq.${categoryId},parent_category_id.eq.${categoryId}`);
    }
  }

  if (status && status !== "all") {
    query = query.eq("status", status);
  }

  if (minAmount) {
    const minCents = Math.round(parseFloat(minAmount) * 100);
    query = query.gte("amount_cents", -Math.abs(minCents));
  }

  if (maxAmount) {
    const maxCents = Math.round(parseFloat(maxAmount) * 100);
    query = query.lte("amount_cents", -Math.abs(maxCents));
  }

  // Handle date filtering (priority: custom range > years multi-select > year > dateRange preset)
  if (startDate && endDate) {
    query = query.gte("created_at", startDate).lte("created_at", endDate);
  } else if (years) {
    // Handle comma-separated years (multi-select)
    const yearList = years.split(',').filter(Boolean).map(y => parseInt(y)).filter(y => !isNaN(y) && y > 1900 && y < 2200);
    if (yearList.length > 0) {
      const yearFilters = yearList.map(y => {
        const yearStart = new Date(y, 0, 1).toISOString();
        const yearEnd = new Date(y + 1, 0, 1).toISOString();
        return `created_at.gte.${yearStart},created_at.lt.${yearEnd}`;
      });
      // Use OR logic for multiple years
      query = query.or(yearFilters.join(','));
    }
  } else if (year && year !== "all") {
    const yearInt = parseInt(year);
    const yearStart = new Date(yearInt, 0, 1).toISOString();
    const yearEnd = new Date(yearInt + 1, 0, 1).toISOString();
    query = query.gte("created_at", yearStart).lt("created_at", yearEnd);
  } else if (dateRange && dateRange !== "all") {
    const now = new Date();
    let filterStart: Date;

    switch (dateRange) {
      case "7d":
        filterStart = new Date(now);
        filterStart.setDate(now.getDate() - 7);
        break;
      case "30d":
        filterStart = new Date(now);
        filterStart.setDate(now.getDate() - 30);
        break;
      case "90d":
        filterStart = new Date(now);
        filterStart.setDate(now.getDate() - 90);
        break;
      case "6m":
        filterStart = new Date(now);
        filterStart.setMonth(now.getMonth() - 6);
        break;
      case "1y":
        filterStart = new Date(now);
        filterStart.setFullYear(now.getFullYear() - 1);
        break;
      case "this-month":
        filterStart = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case "last-month":
        filterStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const filterEnd = new Date(now.getFullYear(), now.getMonth(), 1);
        query = query.gte("created_at", filterStart.toISOString()).lt("created_at", filterEnd.toISOString());
        filterStart = null as any;
        break;
      default:
        filterStart = null as any;
    }

    if (filterStart) {
      query = query.gte("created_at", filterStart.toISOString());
    }
  }

  // Smart default filter: exclude transfers by default
  if (!includeTransfers) {
    // Exclude account transfers (internal transfers between own accounts)
    query = query.is("transfer_account_id", null);
  }

  // Note: Round-ups are not separate transactions in UP Bank
  // They're just a field (round_up_amount_cents) on regular transactions
  // So there's no "Include Round-ups" filter - round-ups always show as badges

  // Execute query with pagination.
  // Prefer cursor-based pagination when a cursor is supplied — it stays fast
  // at depth because PG can use the (account_id, created_at DESC) index to
  // seek directly past the previous page, instead of scanning OFFSET rows.
  if (cursor) {
    // Validate cursor: must be a parseable ISO timestamp.
    const cursorDate = new Date(cursor);
    if (Number.isNaN(cursorDate.getTime())) {
      return NextResponse.json(
        { error: "Invalid cursor — must be an ISO timestamp" },
        { status: 400 }
      );
    }
    query = query.lt("created_at", cursorDate.toISOString());
  }

  const { data: transactions, error, count } = await (cursor
    ? query.order("created_at", { ascending: false }).limit(limit)
    : query.order("created_at", { ascending: false }).range(offset, offset + limit - 1));

  if (error) {
    console.error("Failed to fetch transactions:", error);
    return NextResponse.json({ error: "Failed to fetch transactions" }, { status: 500 });
  }

  // Manually join account display names
  const transactionsWithAccounts = transactions?.map(txn => {
    const account = accounts?.find(a => a.id === txn.account_id);
    return {
      ...txn,
      accounts: account ? { display_name: account.display_name || "Unknown" } : null,
    };
  }) || [];

  // Build base query for summary totals
  // Must fetch in batches since Supabase has 1000 row default limit
  const buildSummaryQuery = () => {
    let query = supabase
      .from("transactions")
      .select("amount_cents, is_income")
      .in("account_id", accountIds)
      .is("deleted_at", null);

    // Re-apply all the same filters
    if (search) {
      const escapedSearch = search.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
      query = query.ilike("description", `%${escapedSearch}%`);
    }

    if (accountId && accountId !== "all") {
      if (accountId.includes(',')) {
        const ids = accountId.split(',').filter(Boolean);
        query = query.in('account_id', ids);
      } else {
        query = query.eq("account_id", accountId);
      }
    }
    if (categoryId && categoryId !== "all") {
      if (categoryId.includes(',')) {
        const ids = categoryId.split(',').filter(Boolean);
        query = query.in('category_id', ids);
      } else {
        query = query.or(`category_id.eq.${categoryId},parent_category_id.eq.${categoryId}`);
      }
    }
    if (status && status !== "all") query = query.eq("status", status);
    if (minAmount) query = query.gte("amount_cents", -Math.abs(Math.round(parseFloat(minAmount) * 100)));
    if (maxAmount) query = query.lte("amount_cents", -Math.abs(Math.round(parseFloat(maxAmount) * 100)));

    // Date filtering (must match the main query logic exactly)
    if (startDate && endDate) {
      query = query.gte("created_at", startDate).lte("created_at", endDate);
    } else if (years) {
      const yearList = years.split(',').filter(Boolean).map(y => parseInt(y)).filter(y => !isNaN(y) && y > 1900 && y < 2200);
      if (yearList.length > 0) {
        const yearFilters = yearList.map(y => {
          const yearStart = new Date(y, 0, 1).toISOString();
          const yearEnd = new Date(y + 1, 0, 1).toISOString();
          return `created_at.gte.${yearStart},created_at.lt.${yearEnd}`;
        });
        query = query.or(yearFilters.join(','));
      }
    } else if (year && year !== "all") {
      const yearInt = parseInt(year);
      const yearStart = new Date(yearInt, 0, 1).toISOString();
      const yearEnd = new Date(yearInt + 1, 0, 1).toISOString();
      query = query.gte("created_at", yearStart).lt("created_at", yearEnd);
    } else if (dateRange && dateRange !== "all") {
      const now = new Date();
      let filterStart: Date | null = null;

      switch (dateRange) {
        case "7d":
          filterStart = new Date(now);
          filterStart.setDate(now.getDate() - 7);
          break;
        case "30d":
          filterStart = new Date(now);
          filterStart.setDate(now.getDate() - 30);
          break;
        case "90d":
          filterStart = new Date(now);
          filterStart.setDate(now.getDate() - 90);
          break;
        case "1y":
          filterStart = new Date(now);
          filterStart.setFullYear(now.getFullYear() - 1);
          break;
        case "this-month":
          filterStart = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case "last-month":
          const monthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          const monthEnd = new Date(now.getFullYear(), now.getMonth(), 1);
          query = query.gte("created_at", monthStart.toISOString()).lt("created_at", monthEnd.toISOString());
          filterStart = null;
          break;
      }

      if (filterStart) {
        query = query.gte("created_at", filterStart.toISOString());
      }
    }

    if (!includeTransfers) {
      query = query.is("transfer_account_id", null);
    }

    return query;
  };

  // Fetch all matching transactions in batches
  // Supabase has a default limit of 1000 rows per query
  const allMatchingTransactions: any[] = [];
  let summaryOffset = 0;
  const batchSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const summaryQuery = buildSummaryQuery();
    const { data, error } = await summaryQuery
      .order("created_at", { ascending: false })
      .range(summaryOffset, summaryOffset + batchSize - 1);

    if (error) {
      console.error('[API] Error fetching summary batch:', error.message);
      hasMore = false;
      break;
    }

    if (!data || data.length === 0) {
      hasMore = false;
      break;
    }

    allMatchingTransactions.push(...data);

    if (data.length < batchSize) {
      hasMore = false;
    } else {
      summaryOffset += batchSize;
    }
  }

  const totalSpending = allMatchingTransactions
    ?.filter(t => t.amount_cents < 0)
    .reduce((sum, t) => sum + Math.abs(t.amount_cents), 0) || 0;

  // Calculate income based on mode
  const totalIncome = allMatchingTransactions
    ?.filter(t => {
      if (incomeMode === "marked_sources") {
        // Only include transactions marked as income
        return t.is_income === true;
      }
      // Default: all positive transactions
      return t.amount_cents > 0;
    })
    .reduce((sum, t) => {
      // For marked income, use absolute value since amount could be negative
      // For positive transactions, use as-is
      return sum + Math.abs(t.amount_cents);
    }, 0) || 0;

  const spendingCount = allMatchingTransactions?.filter(t => t.amount_cents < 0).length || 0;

  // Compute the cursor for the next page (created_at of the last row).
  // Callers can pass this back via `?cursor=` to fetch the next page.
  const lastRow = transactionsWithAccounts.length > 0
    ? transactionsWithAccounts[transactionsWithAccounts.length - 1]
    : null;
  const nextCursor = lastRow?.created_at ?? null;

  // hasMorePages semantics:
  //   - With OFFSET: based on the exact `count` from the query.
  //   - With cursor: we don't have an exact count for the remaining slice;
  //     `hasMorePages` is true iff we filled the page (heuristic — caller can
  //     keep paging until the response is shorter than `limit`).
  const hasMorePages = cursor
    ? transactionsWithAccounts.length === limit
    : (count || 0) > offset + limit;

  return NextResponse.json({
    transactions: transactionsWithAccounts,
    total: count || 0,
    hasMore: hasMorePages,
    nextCursor,
    summary: {
      spending: totalSpending,
      income: totalIncome,
      spendingCount
    }
  });
}
