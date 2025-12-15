"use client";

import { useState } from "react";
import { Nunito, DM_Sans } from "next/font/google";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ExternalLink,
  CreditCard,
  ChevronRight,
  Store,
  Edit,
  Repeat,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { useCategoryMapping } from "@/contexts/category-context";
import { SimpleCategoryPicker } from "@/components/budget/simple-category-picker";
import { CreateExpenseFromTransactionDialog } from "@/components/budget/create-expense-dialog";

const nunito = Nunito({
  subsets: ["latin"],
  variable: "--font-nunito",
  weight: ["600", "700", "800", "900"]
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  weight: ["400", "500"]
});

interface TransactionDetailModalProps {
  transaction: any;
  open: boolean;
  onClose: () => void;
  hideTransactionHistory?: boolean;
  hideCategoryHistory?: boolean;
}

export function TransactionDetailModal({
  transaction,
  open,
  onClose,
  hideTransactionHistory = false,
  hideCategoryHistory = false,
}: TransactionDetailModalProps) {
  const [error, setError] = useState<string | null>(null);
  const [isEditingCategory, setIsEditingCategory] = useState(false);
  const [recategorizing, setRecategorizing] = useState(false);
  const [showCreateExpense, setShowCreateExpense] = useState(false);
  const { getModernDisplayName, getIcon } = useCategoryMapping();
  const pathname = usePathname();
  const fromSection = pathname?.split('/')[1] || 'activity';

  if (!transaction) return null;

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
    }).format(cents / 100);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-AU", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };


  const isExpense = transaction.amount_cents < 0;
  const absAmount = Math.abs(transaction.amount_cents);

  // Get UP Bank category IDs
  const upCategoryId = transaction.category?.id || transaction.category_id;
  const upParentId = transaction.parent_category?.id || transaction.parent_category_id;

  // Get MODERN mapped category name
  const modernCategoryPath = getModernDisplayName(upCategoryId, upParentId);

  // Fallback to UP Bank name if no mapping
  const parentCat = transaction.parent_category?.name;
  const subCat = transaction.category?.name;
  const fallbackPath = parentCat && subCat && parentCat !== subCat
    ? `${parentCat} › ${subCat}`
    : (subCat || parentCat || null);

  const categoryPath = modernCategoryPath || fallbackPath;

  // Helper to generate category slug for URLs
  const getCategorySlug = (categoryName: string) => {
    return categoryName
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/&/g, 'and')
      .replace(/›/g, '')
      .replace(/[^a-z0-9-]/g, '');
  };

  // Parse category path to determine if it has subcategory
  const parseCategoryPath = (path: string) => {
    if (path.includes(' › ')) {
      const [parent, sub] = path.split(' › ').map(s => s.trim());
      return {
        hasSubcategory: true,
        parent,
        subcategory: sub,
        url: `/budget/${getCategorySlug(parent)}/${getCategorySlug(sub)}?from=${fromSection}`
      };
    }
    return {
      hasSubcategory: false,
      parent: path,
      subcategory: null,
      url: `/budget/${getCategorySlug(path)}?from=${fromSection}`
    };
  };

  const categoryInfo = categoryPath ? parseCategoryPath(categoryPath) : null;

  // Get category icon from mapping using UP Bank category ID
  const categoryIcon = getIcon(upCategoryId) || "📂";

  const handleRecategorize = async (categoryId: string | null, parentId: string | null, applyToMerchant: boolean) => {
    setRecategorizing(true);
    setError(null);

    try {
      const response = await fetch(`/api/transactions/${transaction.id}/recategorize`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category_id: categoryId,
          apply_to_merchant: applyToMerchant,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to recategorize');
      }

      // Close edit mode and refresh
      setIsEditingCategory(false);

      // Reload page to refresh all data
      window.location.reload();
    } catch (err: any) {
      setError(err.message || 'Failed to recategorize transaction');
    } finally {
      setRecategorizing(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={onClose}>
      <DrawerContent className={`${nunito.variable} ${dmSans.variable} max-h-[90vh]`}>
        {/* Drag Handle */}
        <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-gray-300 mb-3 sm:mb-4 mt-2" />

        <div className="px-4 sm:px-6 pb-4 sm:pb-6 overflow-y-auto">
          {/* Hero Section - Minimalist */}
          <DrawerHeader className="p-0 mb-4 sm:mb-6">
            <div className="text-center space-y-2">
              {/* Merchant Icon */}
              <div
                className="w-14 h-14 sm:w-16 sm:h-16 mx-auto rounded-2xl flex items-center justify-center text-2xl sm:text-3xl mb-2 sm:mb-3"
                style={{
                  backgroundColor: isExpense
                    ? 'var(--pastel-coral-light)'
                    : 'var(--pastel-mint-light)'
                }}
              >
                {isExpense ? "🛒" : "💰"}
              </div>

              {/* Merchant Name */}
              <DrawerTitle className="font-[family-name:var(--font-nunito)] text-xl sm:text-2xl font-black px-2" style={{ color: 'var(--text-primary)' }}>
                {transaction.description}
              </DrawerTitle>

              {/* Amount - Hero Size */}
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.1 }}
                className="font-[family-name:var(--font-nunito)] text-3xl sm:text-4xl font-black"
                style={{ color: isExpense ? 'var(--pastel-coral-dark)' : 'var(--pastel-mint-dark)' }}
              >
                {isExpense ? "-" : "+"}{formatCurrency(absAmount)}
              </motion.div>

              {/* Timestamp & Account */}
              <p className="font-[family-name:var(--font-dm-sans)] text-xs sm:text-sm px-2" style={{ color: 'var(--text-tertiary)' }}>
                {formatDate(transaction.created_at)} • {transaction.accounts?.display_name || "Spending Account"}
              </p>
            </div>
          </DrawerHeader>

          {error && (
            <div className="p-3 rounded-xl mb-4" style={{ backgroundColor: 'var(--error-light)', border: '1px solid var(--error-border)' }}>
              <p className="font-[family-name:var(--font-dm-sans)] text-sm" style={{ color: 'var(--error)' }}>{error}</p>
            </div>
          )}

          {/* Primary Action - Transaction History (only show if not already on that page) */}
          {!hideTransactionHistory && (
            <Link href={`/activity/merchant/${encodeURIComponent(transaction.description)}?from=${fromSection}`} className="block mb-4">
              <motion.div
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                className="p-4 rounded-2xl flex items-center justify-between transition-all cursor-pointer"
                style={{
                  backgroundColor: 'var(--pastel-blue-light)',
                }}
              >
                <div className="flex items-center gap-3">
                  <Store className="h-5 w-5" style={{ color: 'var(--pastel-blue-dark)' }} />
                  <span className="font-[family-name:var(--font-nunito)] font-bold" style={{ color: 'var(--pastel-blue-dark)' }}>
                    View Transaction History
                  </span>
                </div>
                <ChevronRight className="h-5 w-5" style={{ color: 'var(--pastel-blue-dark)' }} />
              </motion.div>
            </Link>
          )}

          {/* Category History - Clickable (hide if already on category page) */}
          {categoryInfo && !hideCategoryHistory && (
            <Link href={categoryInfo.url} className="block mb-4">
              <motion.div
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                className="p-4 rounded-2xl flex items-center justify-between transition-all cursor-pointer"
                style={{
                  backgroundColor: 'var(--pastel-mint-light)',
                }}
              >
                <div className="flex items-center gap-3">
                  <div className="text-xl">{categoryIcon}</div>
                  <span className="font-[family-name:var(--font-nunito)] font-bold" style={{ color: 'var(--pastel-mint-dark)' }}>
                    View Category History
                  </span>
                </div>
                <ChevronRight className="h-5 w-5" style={{ color: 'var(--pastel-mint-dark)' }} />
              </motion.div>
            </Link>
          )}

          {/* Category Display & Editing */}
          <div className="mb-4">
            <p className="font-[family-name:var(--font-nunito)] font-bold text-xs uppercase tracking-wider mb-3" style={{ color: 'var(--text-tertiary)' }}>
              CATEGORY
            </p>

            {/* Current Category Display */}
            <div className="flex items-center gap-2 mb-3 p-3 rounded-lg" style={{ backgroundColor: 'var(--surface-secondary)' }}>
              {categoryPath ? (
                <>
                  <div className="text-xl">{categoryIcon}</div>
                  <span className="font-[family-name:var(--font-dm-sans)] text-sm" style={{ color: 'var(--text-primary)' }}>
                    {categoryPath}
                  </span>
                </>
              ) : (
                <span className="font-[family-name:var(--font-dm-sans)] text-sm italic" style={{ color: 'var(--text-tertiary)' }}>
                  Uncategorized
                </span>
              )}
            </div>

            {/* Change Category Button */}
            <div className="flex flex-col gap-2">
              <Button
                onClick={() => setIsEditingCategory(true)}
                variant="outline"
                size="default"
                className="w-full"
                style={{
                  borderColor: 'var(--pastel-blue)',
                  color: 'var(--pastel-blue-dark)'
                }}
              >
                <Edit className="h-4 w-4 mr-2" />
                Change Category
              </Button>

              {isExpense && (
                <Button
                  onClick={() => setShowCreateExpense(true)}
                  variant="outline"
                  size="default"
                  className="w-full"
                  style={{
                    borderColor: 'var(--pastel-yellow)',
                    color: 'var(--pastel-yellow-dark)'
                  }}
                >
                  <Repeat className="h-4 w-4 mr-2" />
                  Recurring Expense
                </Button>
              )}
            </div>

            {/* Category Picker Drawer */}
            <SimpleCategoryPicker
              open={isEditingCategory}
              transactionId={transaction.id}
              currentCategoryId={upCategoryId}
              currentParentId={upParentId}
              merchantDescription={transaction.description}
              onCategoryChange={handleRecategorize}
              onCancel={() => setIsEditingCategory(false)}
            />
          </div>

          {/* Transaction Details */}
          <div className="mb-4">
            <p className="font-[family-name:var(--font-nunito)] font-bold text-xs uppercase tracking-wider mb-3" style={{ color: 'var(--text-tertiary)' }}>
              DETAILS
            </p>
            <div className="space-y-2.5">
              {/* Transaction Type */}
              {transaction.transaction_type && (
                <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  <span className="font-[family-name:var(--font-dm-sans)]">
                    Type: {transaction.transaction_type}
                  </span>
                </div>
              )}

              {/* Status */}
              <div className="flex items-center gap-2 text-sm">
                <Badge
                  className="text-xs rounded-full"
                  style={{
                    backgroundColor: transaction.status === "SETTLED" ? 'var(--pastel-mint-light)' : 'var(--pastel-yellow-light)',
                    color: transaction.status === "SETTLED" ? 'var(--pastel-mint-dark)' : 'var(--pastel-yellow-dark)'
                  }}
                >
                  {transaction.status}
                </Badge>
              </div>

              {/* Card Purchase Method */}
              {transaction.card_purchase_method && (
                <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  <CreditCard className="h-4 w-4" />
                  <span className="font-[family-name:var(--font-dm-sans)]">
                    {transaction.card_purchase_method.replace(/_/g, " ")}
                    {transaction.card_number_suffix && ` • Card ••${transaction.card_number_suffix}`}
                  </span>
                </div>
              )}

              {/* Transfer Message */}
              {transaction.message && (
                <div className="p-2 rounded-lg" style={{ backgroundColor: 'var(--pastel-blue-light)' }}>
                  <p className="font-[family-name:var(--font-dm-sans)] text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    Transfer message:
                  </p>
                  <p className="font-[family-name:var(--font-dm-sans)] text-sm" style={{ color: 'var(--pastel-blue-dark)' }}>
                    &quot;{transaction.message}&quot;
                  </p>
                </div>
              )}

              {/* Round-up */}
              {transaction.round_up_amount_cents > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-sm">🪙</span>
                  <span className="font-[family-name:var(--font-dm-sans)] text-sm" style={{ color: 'var(--pastel-mint-dark)' }}>
                    Round-up: {formatCurrency(Math.abs(transaction.round_up_amount_cents))} saved
                  </span>
                </div>
              )}

              {/* Cashback */}
              {transaction.cashback_amount_cents > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-sm">🎁</span>
                  <span className="font-[family-name:var(--font-dm-sans)] text-sm" style={{ color: 'var(--pastel-coral-dark)' }}>
                    Cashback: {formatCurrency(transaction.cashback_amount_cents)}
                    {transaction.cashback_description && ` • ${transaction.cashback_description}`}
                  </span>
                </div>
              )}

              {/* Foreign Currency */}
              {transaction.foreign_amount_cents && transaction.foreign_currency_code && (
                <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  <span className="font-[family-name:var(--font-dm-sans)]">
                    Original: {transaction.foreign_currency_code} {(Math.abs(transaction.foreign_amount_cents) / 100).toFixed(2)}
                  </span>
                </div>
              )}

              {/* Raw Text */}
              {transaction.raw_text && transaction.raw_text !== transaction.description && (
                <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  <span className="font-[family-name:var(--font-dm-sans)]">
                    Receipt: {transaction.raw_text}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Tags Section */}
          <div className="mb-4">
            <p className="font-[family-name:var(--font-nunito)] font-bold text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>
              TAGS
            </p>
            {transaction.transaction_tags && transaction.transaction_tags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {transaction.transaction_tags.map((tag: any, idx: number) => (
                  <Badge
                    key={idx}
                    className="rounded-full text-xs font-[family-name:var(--font-dm-sans)]"
                    style={{ backgroundColor: 'var(--pastel-lavender-light)', color: 'var(--pastel-lavender-dark)' }}
                  >
                    {tag.tag_name}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="font-[family-name:var(--font-dm-sans)] text-sm italic" style={{ color: 'var(--text-tertiary)' }}>
                No tags
              </p>
            )}
          </div>

          {/* Notes from UP Bank */}
          {transaction.note && (
            <div className="mb-4 p-3 rounded-xl" style={{ backgroundColor: 'var(--pastel-yellow-light)' }}>
              <p className="font-[family-name:var(--font-nunito)] font-bold text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--pastel-yellow-dark)' }}>
                NOTE
              </p>
              <p className="font-[family-name:var(--font-dm-sans)] text-sm" style={{ color: 'var(--text-primary)' }}>
                {transaction.note}
              </p>
            </div>
          )}

          {/* Open in App Link - Only Action */}
          {transaction.deep_link_url && (
            <a
              href={transaction.deep_link_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 mt-4 py-3 font-[family-name:var(--font-dm-sans)] text-sm"
              style={{ color: 'var(--pastel-blue-dark)' }}
            >
              <ExternalLink className="h-4 w-4" />
              Open in UP App
            </a>
          )}
        </div>

        {/* Create Expense Dialog */}
        <CreateExpenseFromTransactionDialog
          transaction={transaction}
          open={showCreateExpense}
          onOpenChange={(open) => {
            setShowCreateExpense(open);
            if (!open) onClose();
          }}
        />
      </DrawerContent>
    </Drawer>
  );
}
