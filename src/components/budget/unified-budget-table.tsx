"use client";

import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Sparkles, ChevronRight, Users } from "lucide-react";
import { formatCurrency, calculatePercentage, getCategoryStatus } from "@/lib/budget-zero-calculations";
import { ExpectedExpenseIndicator } from "./expected-expense-indicator";
import { BudgetEditDialog } from "./budget-edit-dialog";
import { LayoutConfig, Section, generateItemId, getDensitySpacing } from "@/lib/layout-persistence";
import type { BudgetRow, ExpenseData } from "@/lib/budget-row-types";
import { isGoalRow, isAssetRow, isSubcategoryRow, isCategoryRow } from "@/lib/budget-row-types";

const LUCIDE_TO_EMOJI: Record<string, string> = {
  "piggy-bank": "🐷", "home": "🏠", "car": "🚗", "plane": "✈️",
  "gift": "🎁", "heart": "❤️", "star": "⭐", "money": "💰",
  "ring": "💍", "baby": "👶", "shield": "🛡️", "book": "📚",
  "graduation-cap": "🎓", "briefcase": "💼", "umbrella": "☂️",
};

function resolveIcon(icon: string): string {
  return LUCIDE_TO_EMOJI[icon] || icon;
}

interface UnifiedBudgetTableProps {
  items: BudgetRow[];
  expenses?: ExpenseData[];
  onAssignCategory: (name: string, amount: number, subcategoryName?: string) => Promise<void>;
  onAssignGoal: (id: string, amount: number) => Promise<void>;
  onAssignAsset: (id: string, amount: number) => Promise<void>;
  partnershipId: string;
  periodStart: string;
  periodEnd: string;
  onEditExpense?: (expenseId: string) => void;
  onMethodologyAssignmentRequest?: (categoryName: string, amount: number, underlyingCategories: string[]) => void;
  layoutConfig?: LayoutConfig | null;
  income?: number; // Total income for percentage-based target calculations
  budgetPeriod?: 'weekly' | 'fortnightly' | 'monthly';
  onItemClick?: (item: BudgetRow) => void; // For detail panel
  onShareChange?: (categoryName: string, isShared: boolean, percentage: number) => void; // For quick share actions
  searchQuery?: string; // External search filter
}

export function UnifiedBudgetTable({
  items,
  expenses = [],
  onAssignCategory,
  onAssignGoal,
  onAssignAsset,
  partnershipId,
  periodStart,
  periodEnd,
  onEditExpense,
  onMethodologyAssignmentRequest,
  layoutConfig,
  income = 0,
  budgetPeriod = 'monthly',
  onItemClick,
  onShareChange,
  searchQuery = "",
}: UnifiedBudgetTableProps) {
  const [editDialogItem, setEditDialogItem] = useState<BudgetRow | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  // Get density spacing from layout config
  const density = layoutConfig?.density || 'comfortable';
  const densitySpacing = getDensitySpacing(density);


  // Helper to generate item ID for layout matching
  const getItemDragId = (item: BudgetRow) => {
    if (isSubcategoryRow(item)) {
      return generateItemId(item.type, item.name, item.parentCategory);
    }
    return generateItemId(item.type, item.type === 'category' ? item.name : item.id);
  };

  // Organize items by sections if layout config is provided
  const organizedItems = useMemo(() => {
    // Get hidden item IDs set for fast lookup
    const hiddenItemIds = new Set(layoutConfig?.hiddenItemIds || []);

    // Filter out hidden items, but allow hidden subcategories to appear when they have
    // actual spending or expense defaults (AUTO assignments from recurring expenses).
    // Parent categories stay fully hidden — only subcategories get the override.
    const HIDDEN_CATEGORIES = new Set(['Internal Transfers', 'External Transfers']);

    let visibleItems = items
      .filter(item => {
        if (HIDDEN_CATEGORIES.has(item.name)) return false;
        const isHidden = hiddenItemIds.has(getItemDragId(item));
        if (!isHidden) return true;
        // Auto-show hidden subcategories that have spending or expense defaults
        const isExpenseDefault = (isCategoryRow(item) || isSubcategoryRow(item)) && 'isExpenseDefault' in item && item.isExpenseDefault;
        return item.type !== 'category' && (item.spent > 0 || isExpenseDefault);
      })
      .map(item => {
        const isExpenseDefault = (isCategoryRow(item) || isSubcategoryRow(item)) && 'isExpenseDefault' in item && item.isExpenseDefault;
        if (hiddenItemIds.has(getItemDragId(item)) && (item.spent > 0 || isExpenseDefault)) {
          return { ...item, isTemporarilyVisible: true };
        }
        return item;
      });

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      visibleItems = visibleItems.filter(item => {
        if (item.name.toLowerCase().includes(query)) return true;
        if (isSubcategoryRow(item) && item.parentCategory?.toLowerCase().includes(query)) return true;
        return false;
      });
    }

    if (!layoutConfig?.sections?.length) {
      // No sections - return all visible items in original order
      return {
        sections: [] as Array<{ section: Section; items: BudgetRow[] }>,
        unsectioned: visibleItems,
      };
    }

    // Build a map of item drag IDs to items (only visible items)
    const itemMap = new Map<string, BudgetRow>();
    visibleItems.forEach(item => {
      itemMap.set(getItemDragId(item), item);
    });

    // Track which items are in sections
    const sectionedIds = new Set<string>();

    // Build sections with their items
    const sections = layoutConfig.sections.map(section => {
      const sectionItems = section.itemIds
        .map(id => {
          sectionedIds.add(id);
          return itemMap.get(id);
        })
        .filter((item): item is BudgetRow => item !== undefined);

      return { section, items: sectionItems };
    });

    // Get unsectioned items (from visible items only)
    // When sections use subcategory-level items, parent category rows are redundant
    // (sections replace the grouping role that parent categories would normally serve)
    const unsectioned = visibleItems.filter(item => {
      if (sectionedIds.has(getItemDragId(item))) return false;
      if (item.type === 'category') return false;
      return true;
    });

    return { sections, unsectioned };
  }, [items, layoutConfig?.sections, layoutConfig?.hiddenItemIds, searchQuery]);

  // Toggle section collapse
  const toggleSectionCollapse = (sectionId: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  };

  // Save handler for the edit dialog
  const handleDialogSave = async (item: BudgetRow, amountCents: number) => {
    if (isCategoryRow(item)) {
      await onAssignCategory(item.name, amountCents);
    } else if (isSubcategoryRow(item)) {
      await onAssignCategory(item.parentCategory, amountCents, item.name);
    } else if (isGoalRow(item)) {
      await onAssignGoal(item.id, amountCents);
    } else if (isAssetRow(item)) {
      await onAssignAsset(item.id, amountCents);
    }
  };

  const getProgressColor = (item: BudgetRow) => {
    if (isGoalRow(item) || isAssetRow(item)) {
      return 'var(--pastel-blue)';
    }

    const status = getCategoryStatus(item.spent, item.assigned);
    const statusColors = {
      under: 'var(--pastel-mint)',
      at: 'var(--pastel-yellow)',
      over: 'var(--pastel-coral)',
      none: 'var(--border)',
    };

    return statusColors[status];
  };

  return (
    <Card
      className="border shadow-lg overflow-hidden rounded-2xl"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}
    >
      <CardContent className="p-0">
        {/* Table Header */}
        <div className="grid grid-cols-12 gap-2 px-3 sm:px-4 py-2 sm:py-3 border-b"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--muted)' }}>
          <div className="col-span-5 font-[family-name:var(--font-dm-sans)] text-[10px] sm:text-xs font-semibold uppercase tracking-wider"
            style={{ color: 'var(--text-tertiary)' }}>
            Item
          </div>
          <div className="col-span-3 sm:col-span-2 font-[family-name:var(--font-dm-sans)] text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-right sm:text-center"
            style={{ color: 'var(--text-tertiary)' }}>
            Budgeted
          </div>
          <div className="col-span-4 sm:col-span-2 font-[family-name:var(--font-dm-sans)] text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-right sm:text-center"
            style={{ color: 'var(--text-tertiary)' }}>
            Spent
          </div>
          <div className="col-span-3 font-[family-name:var(--font-dm-sans)] text-xs font-semibold uppercase tracking-wider hidden sm:block"
            style={{ color: 'var(--text-tertiary)' }}>
            Progress
          </div>
        </div>

        {/* Item Rows - Render helper */}
        {(() => {
          // Helper function to render a single item row
          // showTreeConnector: whether to show the tree connector line for subcategories
          const renderItemRow = (item: BudgetRow, index: number, showTreeConnector: boolean = false) => {
            const percentage = calculatePercentage(item.spent, item.assigned);
            const isSubcategory = isSubcategoryRow(item);

            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: index * 0.02 }}
              >
                <div
                  className={`grid grid-cols-12 gap-1 sm:gap-2 ${densitySpacing.rowPadding} hover:bg-[var(--pastel-blue-light)] transition-all cursor-pointer`}
                  style={{
                    backgroundColor: 'transparent',
                    ...(isSubcategory && showTreeConnector && {
                      marginLeft: '8px',
                      borderLeft: '2px solid var(--pastel-blue)',
                      paddingLeft: '8px',
                    }),
                    ...(isSubcategory && !showTreeConnector && {
                      marginLeft: '8px',
                      paddingLeft: '10px',
                    }),
                  }}
                  onClick={() => {
                    if (onItemClick) {
                      onItemClick(item);
                    }
                  }}
                >
                  {/* Item Name + Icon */}
                  <div className="col-span-5 flex items-center gap-1.5 sm:gap-2 min-w-0">
                    <span className={`flex-shrink-0 ${density === 'compact' ? 'text-lg' : 'text-xl'}`}>{resolveIcon(item.icon)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={`font-[family-name:var(--font-nunito)] ${densitySpacing.fontSize} font-bold truncate`}
                          style={{ color: 'var(--text-primary)' }}>
                          {item.name}
                        </p>

                        {/* Shared Badge */}
                        {item.shareConfig?.isShared && item.shareConfig.sharePercentage !== 100 && (
                          <Badge
                            variant="outline"
                            className="text-xs flex items-center gap-1 px-1.5 py-0"
                            style={{
                              backgroundColor: 'var(--pastel-blue-light)',
                              borderColor: 'var(--pastel-blue)',
                              color: 'var(--pastel-blue-dark)',
                            }}
                          >
                            <Users className="h-3 w-3" />
                            {item.shareConfig.sharePercentage}%
                          </Badge>
                        )}

                        {/* Customization Badge */}
                        {isCategoryRow(item) && item.isCustomized && (
                          <Badge variant="outline" className="text-xs flex items-center gap-1 px-1.5 py-0">
                            <Sparkles className="h-3 w-3" />
                            Custom
                          </Badge>
                        )}

                        {/* Temporarily Visible Badge - shown for hidden categories with transactions */}
                        {item.isTemporarilyVisible && (
                          <Badge
                            variant="outline"
                            className="text-xs px-1.5 py-0"
                            style={{
                              backgroundColor: 'var(--muted)',
                              borderColor: 'var(--border)',
                              color: 'var(--text-tertiary)',
                            }}
                            title="This category is normally hidden but has transactions this period"
                          >
                            Hidden
                          </Badge>
                        )}

                        {/* Percentage Target */}
                        {isCategoryRow(item) && item.targetPercentage && (
                          <span className="text-xs font-[family-name:var(--font-dm-sans)]" style={{ color: 'var(--text-tertiary)' }}>
                            Target: {item.targetPercentage}%
                          </span>
                        )}
                      </div>

                      {/* Expected Expense Indicator */}
                      {isCategoryRow(item) && item.expectedExpenses && item.expectedExpenses.length > 0 && (
                        <ExpectedExpenseIndicator
                          expenses={item.expectedExpenses}
                          onExpenseClick={onEditExpense}
                        />
                      )}

                      {isGoalRow(item) && item.target && (
                        <div className="space-y-0.5">
                          <p className="font-[family-name:var(--font-dm-sans)] text-xs"
                            style={{ color: 'var(--text-tertiary)' }}>
                            Progress: {formatCurrency(item.currentAmount)} / {formatCurrency(item.target)}
                          </p>
                          {item.suggestedSavings?.hasDeadline && (item.target - item.currentAmount) > 0 && (
                            <p className="font-[family-name:var(--font-dm-sans)] text-[10px]"
                              style={{ color: 'var(--text-tertiary)' }}>
                              Suggested: <span style={{ color: 'var(--accent-teal)' }}>
                                {formatCurrency(item.suggestedSavings.weekly)}/w
                              </span>
                              {' · '}
                              <span style={{ color: 'var(--accent-teal)' }}>
                                {formatCurrency(item.suggestedSavings.fortnightly)}/f
                              </span>
                              {' · '}
                              <span style={{ color: 'var(--accent-teal)' }}>
                                {formatCurrency(item.suggestedSavings.monthly)}/m
                              </span>
                            </p>
                          )}
                        </div>
                      )}
                      {isAssetRow(item) && item.currentValue && (
                        <p className="font-[family-name:var(--font-dm-sans)] text-xs"
                          style={{ color: 'var(--text-tertiary)' }}>
                          Value: {formatCurrency(item.currentValue)}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Assigned (Click to Edit) */}
                  <div className="col-span-3 sm:col-span-2 flex items-center justify-end sm:justify-center" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditDialogItem(item);
                      }}
                      className={`font-[family-name:var(--font-dm-sans)] text-sm sm:${density === 'compact' ? 'text-base' : 'text-lg'} font-bold hover:underline inline-flex items-center gap-1`}
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {formatCurrency(item.assigned)}
                      {(isCategoryRow(item) || isSubcategoryRow(item)) && 'isExpenseDefault' in item && item.isExpenseDefault && (
                        <span
                          className="text-[10px] font-semibold uppercase tracking-wider"
                          style={{ color: 'var(--text-tertiary)' }}
                        >
                          auto
                        </span>
                      )}
                    </button>
                  </div>

                  {/* Spent */}
                  <div className="col-span-4 sm:col-span-2 flex items-center justify-end sm:justify-center">
                    <span className={`font-[family-name:var(--font-dm-sans)] ${densitySpacing.fontSize}`}
                      style={{ color: 'var(--text-secondary)' }}>
                      {formatCurrency(item.spent)}
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="col-span-3 items-center hidden sm:flex">
                    {item.assigned > 0 || (isGoalRow(item) && item.target) ? (
                      <div className="flex items-center gap-2 w-full">
                        <Progress
                          value={Math.min(percentage, 100)}
                          className="h-1.5 flex-1"
                          indicatorColor={isGoalRow(item) ? item.color : getProgressColor(item)}
                        />
                        <span className="font-[family-name:var(--font-nunito)] text-xs font-bold w-10 text-right"
                          style={{ color: isGoalRow(item) ? item.color : getProgressColor(item) }}>
                          {percentage.toFixed(0)}%
                        </span>
                      </div>
                    ) : (
                      <span className="font-[family-name:var(--font-dm-sans)] text-xs italic"
                        style={{ color: 'var(--text-tertiary)' }}>
                        No budget
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          };

          // Render items grouped by sections or flat
          return (
            <div className={densitySpacing.rowGap} style={{ borderColor: 'var(--border)' }}>
              {/* Render sections if available */}
              {organizedItems.sections.map(({ section, items: sectionItems }) => {
                const isCollapsed = collapsedSections.has(section.id);
                const sectionTotal = sectionItems.reduce((sum, item) => sum + item.assigned, 0);
                const sectionSpent = sectionItems.reduce((sum, item) => sum + item.spent, 0);

                // Calculate target from percentage if available
                const sectionTarget = section.percentage && income > 0
                  ? Math.round(income * (section.percentage / 100))
                  : null;

                return (
                  <div key={section.id} className="mb-3">
                    {/* Section Header - Compact */}
                    <button
                      onClick={() => toggleSectionCollapse(section.id)}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-all hover:shadow-sm"
                      style={{
                        backgroundColor: section.color + '15',
                        borderLeft: `3px solid ${section.color}`,
                      }}
                    >
                      {isCollapsed ? (
                        <ChevronRight className="h-4 w-4" style={{ color: section.color }} />
                      ) : (
                        <ChevronDown className="h-4 w-4" style={{ color: section.color }} />
                      )}
                      <div className="flex items-center gap-2 flex-1 text-left">
                        <span className="font-[family-name:var(--font-nunito)] font-bold text-sm"
                          style={{ color: section.color }}>
                          {section.name}
                        </span>
                        {section.percentage && (
                          <Badge className="text-xs px-2 py-0 rounded-full font-semibold"
                            style={{ backgroundColor: section.color, color: 'white' }}>
                            {section.percentage}%
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        {sectionTarget && (
                          <div className="text-right">
                            <span className="font-[family-name:var(--font-dm-sans)] text-[9px] uppercase tracking-wider block"
                              style={{ color: 'var(--text-tertiary)' }}>
                              Target
                            </span>
                            <span className="font-[family-name:var(--font-nunito)] text-xs font-bold"
                              style={{ color: section.color }}>
                              {formatCurrency(sectionTarget)}
                            </span>
                          </div>
                        )}
                        <div className="text-right">
                          <span className="font-[family-name:var(--font-dm-sans)] text-[9px] uppercase tracking-wider block"
                            style={{ color: 'var(--text-tertiary)' }}>
                            Spent
                          </span>
                          <span className="font-[family-name:var(--font-nunito)] text-xs font-bold"
                            style={{ color: 'var(--text-primary)' }}>
                            {formatCurrency(sectionSpent)}
                          </span>
                        </div>
                        <Badge className="text-xs px-1.5 py-0 rounded-full font-semibold"
                          style={{ backgroundColor: section.color + '30', color: section.color }}>
                          {sectionItems.length}
                        </Badge>
                      </div>
                    </button>

                    {/* Section Items */}
                    {!isCollapsed && (
                      <div className="mt-1 ml-4 border-l-2 pl-3" style={{ borderColor: section.color + '40' }}>
                        {sectionItems.map((item, idx) => renderItemRow(item, idx, false))}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Unsectioned items */}
              {organizedItems.unsectioned.length > 0 && (
                <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                  {organizedItems.sections.length > 0 && (
                    <div className="p-2 text-xs font-[family-name:var(--font-dm-sans)] uppercase"
                      style={{ color: 'var(--text-tertiary)' }}>
                      Other Items
                    </div>
                  )}
                  {organizedItems.unsectioned.map((item, idx) => renderItemRow(item, idx, false))}
                </div>
              )}
            </div>
          );
        })()}
      </CardContent>

      {/* Budget Edit Dialog */}
      <BudgetEditDialog
        open={!!editDialogItem}
        onOpenChange={(open) => !open && setEditDialogItem(null)}
        item={editDialogItem}
        expenses={expenses}
        budgetPeriod={budgetPeriod}
        onSave={handleDialogSave}
        onMethodologyAssignmentRequest={onMethodologyAssignmentRequest}
      />
    </Card>
  );
}
