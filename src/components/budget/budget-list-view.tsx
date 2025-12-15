"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  Star,
  MoreHorizontal,
  Pencil,
  Copy,
  Trash2,
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import Link from "next/link";
import {
  deleteBudget,
  duplicateBudget,
  setDefaultBudget,
  type UserBudget,
} from "@/app/actions/budgets";
import { RecurringExpensesCard } from "./recurring-expenses-card";
import { ExpenseDefinitionModal } from "./expense-definition-modal";

// ============================================================================
// Types
// ============================================================================

interface BudgetListViewProps {
  budgets: UserBudget[];
  partnershipId: string;
  budgetStats?: Record<
    string,
    { totalAssigned: number; totalSpent: number; categoryCount: number }
  >;
  currentMonth?: string;
  expenses?: any[];
  categories?: string[];
}

// ============================================================================
// Helpers
// ============================================================================

const fmt = (cents: number) =>
  new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);

const methodologyLabels: Record<string, string> = {
  "zero-based": "Zero-Based",
  "50-30-20": "50/30/20",
  envelope: "Envelope",
  "pay-yourself-first": "Pay Yourself First",
  "80-20": "80/20",
};

const methodologyColors: Record<string, string> = {
  "zero-based": "var(--pastel-blue)",
  "50-30-20": "var(--pastel-coral)",
  envelope: "var(--pastel-yellow)",
  "pay-yourself-first": "var(--pastel-purple)",
  "80-20": "var(--pastel-mint)",
};

const methodologyColorsDark: Record<string, string> = {
  "zero-based": "var(--pastel-blue-dark)",
  "50-30-20": "var(--pastel-coral-dark)",
  envelope: "var(--pastel-yellow-dark)",
  "pay-yourself-first": "var(--pastel-purple-dark)",
  "80-20": "var(--pastel-mint-dark)",
};

const methodologyColorsLight: Record<string, string> = {
  "zero-based": "var(--pastel-blue-light)",
  "50-30-20": "var(--pastel-coral-light)",
  envelope: "var(--pastel-yellow-light)",
  "pay-yourself-first": "var(--pastel-purple-light)",
  "80-20": "var(--pastel-mint-light)",
};

const periodLabels: Record<string, string> = {
  weekly: "Weekly",
  fortnightly: "Fortnightly",
  monthly: "Monthly",
};

function getSpendStatus(spent: number, assigned: number) {
  if (assigned === 0) return { label: "No Budget", color: "var(--text-tertiary)", bg: "var(--surface-sunken)", icon: CheckCircle2 };
  const pct = (spent / assigned) * 100;
  if (pct > 100) return { label: "Over", color: "var(--pastel-coral-dark)", bg: "var(--pastel-coral-light)", icon: AlertTriangle };
  if (pct > 80) return { label: "Close", color: "var(--pastel-yellow-dark)", bg: "var(--pastel-yellow-light)", icon: AlertTriangle };
  return { label: "On Track", color: "var(--pastel-mint-dark)", bg: "var(--pastel-mint-light)", icon: TrendingUp };
}

// ============================================================================
// Component
// ============================================================================

export function BudgetListView({
  budgets,
  partnershipId,
  budgetStats = {},
  currentMonth = new Date().toISOString().slice(0, 7) + "-01",
  expenses = [],
  categories = [],
}: BudgetListViewProps) {
  const router = useRouter();
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<any | null>(null);

  // Handlers
  const handleSelect = (budgetSlug: string) => {
    router.push(`/budget?id=${budgetSlug}`);
  };

  const handleSetDefault = async (budgetId: string) => {
    await setDefaultBudget(budgetId, partnershipId);
    router.refresh();
  };

  const handleDuplicate = async (budgetId: string) => {
    const original = budgets.find((b) => b.id === budgetId);
    if (!original) return;
    await duplicateBudget(budgetId, `${original.name} (Copy)`);
    router.refresh();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    await deleteBudget(deleteTarget);
    setDeleteTarget(null);
    setIsDeleting(false);
    router.refresh();
  };

  const handleEdit = (budgetSlug: string) => {
    router.push(`/budget?id=${budgetSlug}&tab=settings`);
  };

  const deletingBudget = budgets.find((b) => b.id === deleteTarget);

  // Derived data
  const defaultBudget = budgets.find((b) => b.is_default) || budgets[0];
  const defaultStats = budgetStats[defaultBudget.id] || { totalAssigned: 0, totalSpent: 0, categoryCount: 0 };
  const defaultPct = defaultStats.totalAssigned > 0 ? Math.round((defaultStats.totalSpent / defaultStats.totalAssigned) * 100) : 0;
  const defaultStatus = getSpendStatus(defaultStats.totalSpent, defaultStats.totalAssigned);
  const defaultRemaining = defaultStats.totalAssigned - defaultStats.totalSpent;


  // Format month for display
  const monthDate = new Date(currentMonth);
  const monthDisplay = monthDate.toLocaleDateString("en-AU", { month: "long", year: "numeric" });

  return (
    <div className="p-4 md:p-6 lg:p-8 min-h-screen pb-24" style={{ backgroundColor: "var(--background)" }}>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-6"
      >
        <div>
          <h1
            className="font-[family-name:var(--font-nunito)] text-3xl font-black"
            style={{ color: "var(--text-primary)", textWrap: "balance" } as React.CSSProperties}
          >
            Your Budgets
          </h1>
          <p
            className="font-[family-name:var(--font-dm-sans)]"
            style={{ color: "var(--text-secondary)" }}
          >
            {budgets.length} budget{budgets.length !== 1 ? "s" : ""} &middot; {monthDisplay}
          </p>
        </div>
        <Link href="/budget/create">
          <Button
            className="rounded-xl font-[family-name:var(--font-nunito)] font-bold border-0 shadow-lg hover:shadow-xl text-sm hover:scale-105 transition-all cursor-pointer"
            style={{ backgroundColor: "var(--pastel-blue)", color: "white" }}
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
            New Budget
          </Button>
        </Link>
      </motion.div>

      {/* Main 3-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        {/* LEFT COLUMN */}
        <div className="lg:col-span-2 space-y-4 md:space-y-6">
          {/* Hero Card — Default Budget */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.02 }}
          >
            <div
              role="button"
              tabIndex={0}
              onClick={() => handleSelect(defaultBudget.slug)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleSelect(defaultBudget.slug);
                }
              }}
              className="border-0 shadow-sm rounded-2xl overflow-hidden cursor-pointer transition-shadow duration-200 hover:shadow-md focus-visible:ring-2 focus-visible:ring-[var(--pastel-blue)] focus-visible:ring-offset-2 outline-none"
              style={{ backgroundColor: "var(--surface-elevated)" }}
              aria-label={`Open ${defaultBudget.name} budget`}
            >
              <div className="p-5 pb-0">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
                      style={{ backgroundColor: `${methodologyColors[defaultBudget.methodology] || "var(--surface-sunken)"}20` }}
                    >
                      {defaultBudget.emoji}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2
                          className="font-[family-name:var(--font-nunito)] text-xl font-bold"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {defaultBudget.name}
                        </h2>
                        {defaultBudget.is_default && (
                          <Star
                            className="w-4 h-4 shrink-0 fill-current"
                            style={{ color: "var(--brand-coral)" }}
                            aria-label="Default budget"
                          />
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span
                          className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                          style={{
                            backgroundColor: methodologyColorsLight[defaultBudget.methodology],
                            color: methodologyColorsDark[defaultBudget.methodology],
                          }}
                        >
                          {methodologyLabels[defaultBudget.methodology] ?? defaultBudget.methodology}
                        </span>
                        <span
                          className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                          style={{
                            backgroundColor: "var(--surface-sunken)",
                            color: "var(--text-tertiary)",
                          }}
                        >
                          {periodLabels[defaultBudget.period_type] ?? defaultBudget.period_type}
                        </span>
                        {defaultBudget.budget_view === "individual" && (
                          <span
                            className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                            style={{
                              backgroundColor: "var(--pastel-lavender)",
                              color: "var(--pastel-purple-dark)",
                            }}
                          >
                            Mine
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {/* Actions dropdown */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 shrink-0 cursor-pointer"
                        aria-label={`${defaultBudget.name} actions`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem className="cursor-pointer" onClick={(e) => { e.stopPropagation(); handleEdit(defaultBudget.slug); }}>
                        <Pencil className="w-4 h-4 mr-2" aria-hidden="true" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem className="cursor-pointer" onClick={(e) => { e.stopPropagation(); handleDuplicate(defaultBudget.id); }}>
                        <Copy className="w-4 h-4 mr-2" aria-hidden="true" />
                        Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="cursor-pointer text-red-500 focus:text-red-500" onClick={(e) => { e.stopPropagation(); setDeleteTarget(defaultBudget.id); }}>
                        <Trash2 className="w-4 h-4 mr-2" aria-hidden="true" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Big assigned number */}
                <div className="mt-4">
                  <p
                    className="text-[10px] font-medium uppercase tracking-wider mb-1"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    Total Assigned
                  </p>
                  <div className="flex items-baseline gap-2">
                    <span
                      className="text-3xl md:text-4xl font-bold tabular-nums font-[family-name:var(--font-nunito)]"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {fmt(defaultStats.totalAssigned)}
                    </span>
                    {defaultStats.totalAssigned > 0 && (
                      <span
                        className="text-sm font-medium"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        this period
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Progress bar */}
              {defaultStats.totalAssigned > 0 && (
                <div className="px-5 py-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span
                      className="text-xs font-medium tabular-nums"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      {defaultPct}% spent
                    </span>
                    <span
                      className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: defaultStatus.bg, color: defaultStatus.color }}
                    >
                      <defaultStatus.icon className="h-2.5 w-2.5" aria-hidden="true" />
                      {defaultStatus.label}
                    </span>
                  </div>
                  <Progress
                    value={Math.min(defaultPct, 100)}
                    className="h-2"
                    indicatorColor={defaultStatus.color}
                  />
                </div>
              )}

              {/* Bottom stats row */}
              <div
                className="px-5 py-3 border-t grid grid-cols-3 gap-3"
                style={{ borderColor: "var(--border)" }}
              >
                <div>
                  <span className="text-[10px] block mb-0.5" style={{ color: "var(--text-tertiary)" }}>
                    Assigned
                  </span>
                  <span
                    className="text-sm font-[family-name:var(--font-nunito)] font-bold tabular-nums"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {fmt(defaultStats.totalAssigned)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] block mb-0.5" style={{ color: "var(--text-tertiary)" }}>
                    Spent
                  </span>
                  <span
                    className="text-sm font-[family-name:var(--font-nunito)] font-bold tabular-nums"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {fmt(defaultStats.totalSpent)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] block mb-0.5" style={{ color: "var(--text-tertiary)" }}>
                    Remaining
                  </span>
                  <span
                    className="text-sm font-[family-name:var(--font-nunito)] font-bold tabular-nums"
                    style={{ color: defaultRemaining >= 0 ? "var(--pastel-mint-dark)" : "var(--pastel-coral-dark)" }}
                  >
                    {fmt(defaultRemaining)}
                  </span>
                </div>
              </div>
            </div>
          </motion.div>

          {/* All Budgets Table */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
          >
            <div
              className="border-0 shadow-sm rounded-2xl overflow-hidden"
              style={{ backgroundColor: "var(--surface-elevated)" }}
            >
              <div
                className="px-5 py-3.5 flex items-center justify-between border-b"
                style={{ borderColor: "var(--border)" }}
              >
                <span
                  className="font-[family-name:var(--font-nunito)] text-base font-bold"
                  style={{ color: "var(--text-primary)" }}
                >
                  All Budgets
                </span>
                <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                  {budgets.length} {budgets.length === 1 ? "budget" : "budgets"}
                </span>
              </div>

              {/* Table header (desktop) */}
              <div
                className="hidden md:grid grid-cols-[1fr_90px_100px_80px_32px] gap-3 px-5 py-2 text-[10px] font-medium uppercase tracking-wider"
                style={{
                  color: "var(--text-tertiary)",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <span>Budget</span>
                <span className="text-right">Progress</span>
                <span className="text-right">Assigned</span>
                <span className="text-right">Status</span>
                <span />
              </div>

              {/* Rows */}
              <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                {budgets.map((budget) => {
                  const stats = budgetStats[budget.id] || { totalAssigned: 0, totalSpent: 0, categoryCount: 0 };
                  const pct = stats.totalAssigned > 0 ? Math.round((stats.totalSpent / stats.totalAssigned) * 100) : 0;
                  const status = getSpendStatus(stats.totalSpent, stats.totalAssigned);
                  const StatusIcon = status.icon;
                  const mColor = methodologyColors[budget.methodology] || "var(--surface-sunken)";

                  return (
                    <Link key={budget.id} href={`/budget?id=${budget.slug}`} className="group">
                      <div className="grid grid-cols-[1fr_auto] md:grid-cols-[1fr_90px_100px_80px_32px] gap-3 items-center px-5 py-3 hover:bg-[var(--surface-sunken)] transition-colors cursor-pointer">
                        {/* Budget name + metadata */}
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                            style={{ backgroundColor: `${mColor}20` }}
                          >
                            {budget.emoji}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p
                                className="text-sm font-medium truncate"
                                style={{ color: "var(--text-primary)" }}
                              >
                                {budget.name}
                              </p>
                              {budget.is_default && (
                                <Star
                                  className="w-3 h-3 shrink-0 fill-current"
                                  style={{ color: "var(--brand-coral)" }}
                                  aria-label="Default budget"
                                />
                              )}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span
                                className="text-[10px]"
                                style={{ color: "var(--text-tertiary)" }}
                              >
                                {methodologyLabels[budget.methodology] ?? budget.methodology}
                                {" \u00B7 "}
                                {periodLabels[budget.period_type] ?? budget.period_type}
                              </span>
                              {budget.budget_view === "individual" && (
                                <span
                                  className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                                  style={{
                                    backgroundColor: "var(--pastel-lavender)",
                                    color: "var(--pastel-purple-dark)",
                                  }}
                                >
                                  Mine
                                </span>
                              )}
                              {/* Mobile: progress inline */}
                              <div className="md:hidden flex items-center gap-1">
                                {stats.totalAssigned > 0 && (
                                  <>
                                    <Progress
                                      value={Math.min(pct, 100)}
                                      indicatorColor={status.color}
                                      className="h-1 w-12"
                                    />
                                    <span
                                      className="text-[10px] font-medium tabular-nums"
                                      style={{ color: status.color }}
                                    >
                                      {pct}%
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Mobile: value + status */}
                        <div className="md:hidden text-right">
                          <p
                            className="text-sm font-semibold tabular-nums"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {fmt(stats.totalAssigned)}
                          </p>
                          {stats.totalAssigned > 0 && (
                            <span
                              className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                              style={{ backgroundColor: status.bg, color: status.color }}
                            >
                              <StatusIcon className="h-2.5 w-2.5" aria-hidden="true" />
                              {status.label}
                            </span>
                          )}
                        </div>

                        {/* Desktop: Progress column */}
                        <div className="hidden md:flex items-center justify-end gap-2">
                          {stats.totalAssigned > 0 ? (
                            <>
                              <Progress
                                value={Math.min(pct, 100)}
                                indicatorColor={status.color}
                                className="h-1.5 w-14"
                              />
                              <span
                                className="text-xs font-semibold tabular-nums"
                                style={{ color: status.color }}
                              >
                                {pct}%
                              </span>
                            </>
                          ) : (
                            <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>&mdash;</span>
                          )}
                        </div>

                        {/* Desktop: Assigned column */}
                        <div className="hidden md:block text-right">
                          <span
                            className="text-sm font-semibold tabular-nums"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {stats.totalAssigned > 0 ? fmt(stats.totalAssigned) : "\u2014"}
                          </span>
                        </div>

                        {/* Desktop: Status column */}
                        <div className="hidden md:flex justify-end">
                          {stats.totalAssigned > 0 ? (
                            <span
                              className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                              style={{ backgroundColor: status.bg, color: status.color }}
                            >
                              <StatusIcon className="h-2.5 w-2.5" aria-hidden="true" />
                              {status.label}
                            </span>
                          ) : (
                            <span className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>&mdash;</span>
                          )}
                        </div>

                        {/* Desktop: Actions */}
                        <div className="hidden md:flex justify-end" onClick={(e) => e.preventDefault()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 shrink-0 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                                aria-label={`${budget.name} actions`}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MoreHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem className="cursor-pointer" onClick={(e) => { e.stopPropagation(); handleEdit(budget.slug); }}>
                                <Pencil className="w-4 h-4 mr-2" aria-hidden="true" />
                                Edit
                              </DropdownMenuItem>
                              {!budget.is_default && (
                                <DropdownMenuItem className="cursor-pointer" onClick={(e) => { e.stopPropagation(); handleSetDefault(budget.id); }}>
                                  <Star className="w-4 h-4 mr-2" aria-hidden="true" />
                                  Set as Default
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem className="cursor-pointer" onClick={(e) => { e.stopPropagation(); handleDuplicate(budget.id); }}>
                                <Copy className="w-4 h-4 mr-2" aria-hidden="true" />
                                Duplicate
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="cursor-pointer text-red-500 focus:text-red-500" onClick={(e) => { e.stopPropagation(); setDeleteTarget(budget.id); }}>
                                <Trash2 className="w-4 h-4 mr-2" aria-hidden="true" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </motion.div>

        </div>

        {/* RIGHT COLUMN (Sidebar) */}
        <div className="space-y-4 md:space-y-6">
          {/* Recurring Expenses Card */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.03 }}
          >
            <RecurringExpensesCard
              expenses={expenses}
              onEditExpense={(expense) => { setSelectedExpense(expense); setShowExpenseModal(true); }}
              onAddExpense={() => { setSelectedExpense(null); setShowExpenseModal(true); }}
            />
          </motion.div>
        </div>
      </div>

      {/* Expense Modal */}
      <ExpenseDefinitionModal
        open={showExpenseModal}
        onClose={() => { setShowExpenseModal(false); setSelectedExpense(null); }}
        partnershipId={partnershipId}
        categories={categories}
        expense={selectedExpense}
        initialSplit={selectedExpense?.split_percentage ? { isShared: true, splitPercentage: selectedExpense.split_percentage } : null}
      />

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Budget</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{deletingBudget?.name}
              &rdquo;? This will remove all budget assignments and settings.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-red-500 hover:bg-red-600 cursor-pointer"
            >
              {isDeleting ? "Deleting\u2026" : "Delete Budget"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
