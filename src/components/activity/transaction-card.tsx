"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { useCategoryMapping } from "@/contexts/category-context";
import { History } from "lucide-react";

interface TransactionCardProps {
  transaction: any;
  index: number;
  onClick: () => void;
  showCategory?: boolean;
}

// Simplified: Icons now come from category mapping context

export function TransactionCard({ transaction, index, onClick, showCategory = true }: TransactionCardProps) {
  const isIncome = transaction.amount_cents >= 0;
  const { getModernDisplayName, getIcon } = useCategoryMapping();
  const pathname = usePathname();
  const fromSection = pathname?.split('/')[1] || 'activity';

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
      minimumFractionDigits: 2,
    }).format(Math.abs(cents) / 100);
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString("en-AU", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
  };

  // Detect if this is a transfer
  const isTransfer = transaction.transfer_account_id !== null && transaction.transfer_account_id !== undefined;

  // Get display name (merchant or transfer recipient/sender)
  const displayName = transaction.description;

  // Get UP Bank category IDs
  const upCategoryId = transaction.category?.id || transaction.category_id;
  const upParentId = transaction.parent_category?.id || transaction.parent_category_id;

  // Get MODERN mapped category name
  const modernCategoryPath = getModernDisplayName(upCategoryId, upParentId);

  // Fallback to original UP Bank name if no mapping
  const parentCat = transaction.parent_category?.name;
  const subCat = transaction.category?.name;
  const fallbackPath = parentCat && subCat && parentCat !== subCat
    ? `${parentCat} › ${subCat}`
    : (subCat || parentCat || "");

  const categoryPath = modernCategoryPath || fallbackPath;

  // Get tags
  const tags = Array.isArray(transaction.transaction_tags) ? transaction.transaction_tags : [];

  // Check for special badges
  const hasRoundUp = transaction.round_up_amount_cents > 0;
  const hasRecurring = transaction.is_recurring;

  // Get icon from mapping (or fallback for transfers/income)
  const categoryIcon = isTransfer
    ? (isIncome ? "💰" : "💸")
    : isIncome
    ? "💰"
    : getIcon(upCategoryId);

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.015, duration: 0.2 }}
      onClick={onClick}
      className="cursor-pointer group"
    >
      {/* Main Row Container - Improved spacing */}
      <div
        className="flex items-center gap-2 sm:gap-4 py-3 px-2 sm:px-3 rounded-xl transition-all duration-200 group-hover:bg-[var(--pastel-blue-light)]"
      >
        {/* Time Column - Responsive width */}
        <span
          className="font-[family-name:var(--font-dm-sans)] text-xs sm:text-sm font-medium w-12 sm:w-16 flex-shrink-0"
          style={{ color: 'var(--text-tertiary)' }}
        >
          {formatTime(transaction.settled_at || transaction.created_at)}
        </span>

        {/* Icon - Category based */}
        <span className="text-lg sm:text-xl flex-shrink-0">
          {categoryIcon}
        </span>

        {/* Content */}
        <div className="flex-1 min-w-0 overflow-hidden">
          {/* Display Name - No link for transfers/income */}
          <div
            className="font-[family-name:var(--font-nunito)] font-bold text-sm sm:text-[15px] truncate"
            style={{ color: 'var(--text-primary)' }}
          >
            {isTransfer ? (
              isIncome ? `From ${displayName}` : `To ${displayName}`
            ) : (
              displayName
            )}
          </div>

          {/* Metadata Row - Better mobile handling */}
          <div className="flex items-center gap-1 sm:gap-1.5 mt-0.5 sm:mt-1 flex-wrap">
            {/* Category Path */}
            {categoryPath && (
              <span
                className="font-[family-name:var(--font-dm-sans)] text-xs"
                style={{ color: 'var(--text-tertiary)' }}
              >
                [{categoryPath}]
              </span>
            )}

            {/* Tags */}
            {tags.slice(0, 2).map((tag: any, idx: number) => (
              <span
                key={idx}
                className="font-[family-name:var(--font-dm-sans)] text-xs"
                style={{ color: 'var(--text-tertiary)' }}
              >
                [{tag.tag_name}]
              </span>
            ))}

            {/* Special indicators */}
            {hasRoundUp && (
              <span
                className="font-[family-name:var(--font-dm-sans)] text-xs px-1.5 py-0.5 rounded-full"
                style={{
                  backgroundColor: 'var(--pastel-mint-light)',
                  color: 'var(--pastel-mint-dark)'
                }}
              >
                🪙 Round-up
              </span>
            )}

            {hasRecurring && (
              <span
                className="font-[family-name:var(--font-dm-sans)] text-xs px-1.5 py-0.5 rounded-full"
                style={{
                  backgroundColor: 'var(--pastel-lavender-light)',
                  color: 'var(--pastel-lavender-dark)'
                }}
              >
                💳 Recurring
              </span>
            )}

            {transaction.performing_customer && (
              <span
                className="font-[family-name:var(--font-dm-sans)] text-xs"
                style={{ color: 'var(--text-tertiary)' }}
              >
                by {transaction.performing_customer}
              </span>
            )}
          </div>
        </div>

        {/* Actions - View merchant history */}
        {!isTransfer && displayName && (
          <Link
            href={`/activity/merchant/${encodeURIComponent(displayName)}?from=${fromSection}`}
            onClick={(e) => e.stopPropagation()}
            className="flex-shrink-0 p-1.5 rounded-lg hover:bg-[var(--pastel-blue)]"
            title="View merchant history"
          >
            <History className="h-4 w-4" style={{ color: 'var(--pastel-blue-dark)' }} />
          </Link>
        )}

        {/* Amount - Right aligned, responsive width */}
        <span
          className="font-[family-name:var(--font-nunito)] font-black text-sm sm:text-base whitespace-nowrap flex-shrink-0 text-right min-w-[70px] sm:min-w-[100px]"
          style={{
            color: isIncome ? 'var(--pastel-mint-dark)' : 'var(--text-primary)'
          }}
        >
          {isIncome ? "+" : "-"}{formatCurrency(transaction.amount_cents)}
        </span>
      </div>
    </motion.div>
  );
}
