"use client";

import { useState } from "react";
import { useModernCategories, useCategoryMapping } from "@/contexts/category-context";
import { useIncomeConfig } from "@/contexts/income-config-context";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search, X, ChevronDown, Settings2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface EnhancedFiltersProps {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  selectedAccount: string;
  setSelectedAccount: (account: string) => void;
  selectedCategory: string;
  setSelectedCategory: (category: string) => void;
  selectedCategories?: string[];
  setSelectedCategories?: (categories: string[]) => void;
  selectedAccounts?: string[];
  setSelectedAccounts?: (accounts: string[]) => void;
  selectedYears?: string[];
  setSelectedYears?: (years: string[]) => void;
  selectedStatus: string;
  setSelectedStatus: (status: string) => void;
  dateRange: string;
  setDateRange: (range: string) => void;
  minAmount: string;
  setMinAmount: (amount: string) => void;
  maxAmount: string;
  setMaxAmount: (amount: string) => void;
  selectedYear: string;
  setSelectedYear: (year: string) => void;
  startDate: string;
  setStartDate: (date: string) => void;
  endDate: string;
  setEndDate: (date: string) => void;
  includeTransfers: boolean;
  setIncludeTransfers: (include: boolean) => void;
  accounts: Array<{ id: string; display_name: string }>;
  categories: Array<{ id: string; name: string; parent_category_id?: string | null }>;
  availableYears: number[];
  onClearFilters: () => void;
  activeFilterCount: number;
}

// Multi-Select Account Component
function AccountMultiSelect({
  selectedAccounts,
  onChange,
  accounts
}: {
  selectedAccounts: string[];
  onChange: (accounts: string[]) => void;
  accounts: Array<{ id: string; display_name: string }>;
}) {
  const [isOpen, setIsOpen] = useState(false);

  const handleToggle = (accId: string) => {
    if (selectedAccounts.includes(accId)) {
      onChange(selectedAccounts.filter(id => id !== accId));
    } else {
      onChange([...selectedAccounts, accId]);
    }
  };

  const displayText = selectedAccounts.length === 0
    ? "All Accounts"
    : `${selectedAccounts.length} selected`;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full h-10 px-3 rounded-lg border bg-white flex items-center justify-between font-[family-name:var(--font-dm-sans)] text-sm"
        style={{ borderColor: 'var(--border)' }}
      >
        <span>{displayText}</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg max-h-[300px] overflow-y-auto z-50" style={{ borderColor: 'var(--border)' }}>
            <div className="p-2 space-y-1">
              {accounts.map((account) => (
                <div key={account.id} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer" onClick={() => handleToggle(account.id)}>
                  <Checkbox
                    id={`account-${account.id}`}
                    checked={selectedAccounts.includes(account.id)}
                    onCheckedChange={() => handleToggle(account.id)}
                  />
                  <label htmlFor={`account-${account.id}`} className="font-[family-name:var(--font-dm-sans)] text-sm cursor-pointer">
                    {account.display_name}
                  </label>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Multi-Select Year Component
function YearMultiSelect({
  selectedYears,
  onChange,
  availableYears
}: {
  selectedYears: string[];
  onChange: (years: string[]) => void;
  availableYears: number[];
}) {
  const [isOpen, setIsOpen] = useState(false);

  const handleToggle = (year: string) => {
    if (selectedYears.includes(year)) {
      onChange(selectedYears.filter(y => y !== year));
    } else {
      onChange([...selectedYears, year]);
    }
  };

  const displayText = selectedYears.length === 0
    ? "All Years"
    : `${selectedYears.length} selected`;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full h-10 px-3 rounded-lg border bg-white flex items-center justify-between font-[family-name:var(--font-dm-sans)] text-sm"
        style={{ borderColor: 'var(--border)' }}
      >
        <span>{displayText}</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg max-h-[300px] overflow-y-auto z-50" style={{ borderColor: 'var(--border)' }}>
            <div className="p-2 space-y-1">
              {availableYears.map((year) => (
                <div key={year} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer" onClick={() => handleToggle(year.toString())}>
                  <Checkbox
                    id={`year-${year}`}
                    checked={selectedYears.includes(year.toString())}
                    onCheckedChange={() => handleToggle(year.toString())}
                  />
                  <label htmlFor={`year-${year}`} className="font-[family-name:var(--font-dm-sans)] text-sm cursor-pointer">
                    {year}
                  </label>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Modern Category Multi-Select Component
function ModernCategorySelect({
  selectedCategories,
  onChange
}: {
  selectedCategories: string[];
  onChange: (categories: string[]) => void;
}) {
  const modernCategories = useModernCategories();
  const { getUpIdsForModernParent } = useCategoryMapping();
  const [isOpen, setIsOpen] = useState(false);

  const handleToggleCategory = (catId: string) => {
    if (selectedCategories.includes(catId)) {
      // Remove from selection
      onChange(selectedCategories.filter(id => id !== catId));
    } else {
      // Add to selection
      onChange([...selectedCategories, catId]);
    }
  };

  const handleToggleParent = (parentName: string) => {
    const parentUpIds = getUpIdsForModernParent(parentName);
    const allSelected = parentUpIds.every(id => selectedCategories.includes(id));

    if (allSelected) {
      // Deselect all children
      onChange(selectedCategories.filter(id => !parentUpIds.includes(id)));
    } else {
      // Select all children
      const newSelection = [...new Set([...selectedCategories, ...parentUpIds])];
      onChange(newSelection);
    }
  };

  const displayText = selectedCategories.length === 0
    ? "All Categories"
    : `${selectedCategories.length} selected`;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full h-10 px-3 rounded-lg border bg-white flex items-center justify-between font-[family-name:var(--font-dm-sans)] text-sm"
        style={{ borderColor: 'var(--border)' }}
      >
        <span>{displayText}</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div
            className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg max-h-[400px] overflow-y-auto z-50"
            style={{ borderColor: 'var(--border)' }}
          >
            <div className="p-2">
              {modernCategories.map(([parentName, children]) => {
                const parentUpIds = getUpIdsForModernParent(parentName);
                const allSelected = parentUpIds.every(id => selectedCategories.includes(id));
                const someSelected = parentUpIds.some(id => selectedCategories.includes(id));

                return (
                  <div key={parentName} className="mb-2">
                    {/* Parent checkbox */}
                    <div className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer" onClick={() => handleToggleParent(parentName)}>
                      <Checkbox
                        id={`parent-${parentName}`}
                        checked={someSelected && !allSelected ? "indeterminate" : allSelected}
                        onCheckedChange={() => handleToggleParent(parentName)}
                      />
                      <label htmlFor={`parent-${parentName}`} className="font-[family-name:var(--font-nunito)] font-bold text-sm cursor-pointer" style={{ color: 'var(--text-primary)' }}>
                        {parentName}
                      </label>
                    </div>

                    {/* Children checkboxes */}
                    <div className="pl-6 space-y-1">
                      {children.map((child) => (
                        <div
                          key={child.upCategoryId}
                          className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer"
                          onClick={() => handleToggleCategory(child.upCategoryId)}
                        >
                          <Checkbox
                            id={`category-${child.upCategoryId}`}
                            checked={selectedCategories.includes(child.upCategoryId)}
                            onCheckedChange={() => handleToggleCategory(child.upCategoryId)}
                          />
                          <label htmlFor={`category-${child.upCategoryId}`} className="font-[family-name:var(--font-dm-sans)] text-sm cursor-pointer">
                            {child.icon} {child.newChildName}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function EnhancedFilters({
  searchTerm,
  setSearchTerm,
  selectedAccount,
  setSelectedAccount,
  selectedCategory,
  setSelectedCategory,
  selectedCategories,
  setSelectedCategories,
  selectedAccounts,
  setSelectedAccounts,
  selectedYears,
  setSelectedYears,
  selectedStatus,
  setSelectedStatus,
  dateRange,
  setDateRange,
  minAmount,
  setMinAmount,
  maxAmount,
  setMaxAmount,
  selectedYear,
  setSelectedYear,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  includeTransfers,
  setIncludeTransfers,
  accounts,
  categories,
  availableYears,
  onClearFilters,
  activeFilterCount,
}: EnhancedFiltersProps) {
  const [showAllFilters, setShowAllFilters] = useState(false);
  const [showIncomeSettings, setShowIncomeSettings] = useState(false);
  const { incomeMode, setIncomeMode } = useIncomeConfig();

  // Quick filter chips
  const quickFilters = [
    { label: "This Week", value: "7d" },
    { label: "This Month", value: "this-month" },
    { label: "Last 30 Days", value: "30d" },
    { label: "Last 3 Months", value: "90d" },
    { label: "This Year", value: "1y" },
    { label: "All Time", value: "all" },
  ];

  const handleQuickFilter = (value: string) => {
    setDateRange(value);
    setSelectedYear("all");
    setStartDate("");
    setEndDate("");
  };

  return (
    <Card
      className="border-0 shadow-lg overflow-hidden"
      style={{ backgroundColor: 'var(--surface-elevated)' }}
    >
      <CardContent className="pt-3 md:pt-4 space-y-2 md:space-y-3">
        {/* Search Bar - Always Visible */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5" style={{ color: 'var(--text-tertiary)' }} />
          <Input
            placeholder="Search transactions..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-11 h-10 md:h-11 rounded-xl border-2 font-[family-name:var(--font-dm-sans)] text-sm md:text-base"
            style={{
              borderColor: searchTerm ? 'var(--pastel-blue)' : 'var(--border)',
              backgroundColor: 'var(--background)'
            }}
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-gray-100 transition-colors"
            >
              <X className="h-4 w-4" style={{ color: 'var(--text-tertiary)' }} />
            </button>
          )}
        </div>

        {/* Quick Date Chips - Wrap on Mobile */}
        <div className="flex gap-2 flex-wrap">
          {quickFilters.map((filter) => (
            <Button
              key={filter.value}
              variant="ghost"
              size="sm"
              onClick={() => handleQuickFilter(filter.value)}
              className="rounded-full font-[family-name:var(--font-nunito)] font-bold text-xs whitespace-nowrap h-8 px-3 md:px-4 transition-all"
              style={dateRange === filter.value ? {
                backgroundColor: 'var(--pastel-blue)',
                color: 'white'
              } : {
                backgroundColor: 'var(--muted)',
                color: 'var(--text-secondary)'
              }}
            >
              {filter.label}
            </Button>
          ))}
        </div>

        {/* Single Filters Button + Clear All */}
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            onClick={() => setShowAllFilters(!showAllFilters)}
            className="h-10 rounded-xl font-[family-name:var(--font-nunito)] font-bold text-sm px-4 relative"
            style={{
              backgroundColor: showAllFilters ? 'var(--pastel-blue-light)' : 'var(--muted)',
              color: 'var(--text-primary)'
            }}
          >
            <Settings2 className="h-4 w-4 mr-2" />
            Filters
            <ChevronDown
              className={`h-4 w-4 ml-2 transition-transform duration-200 ${showAllFilters ? 'rotate-180' : ''}`}
            />
          </Button>

          {activeFilterCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearFilters}
              className="font-[family-name:var(--font-dm-sans)] text-sm h-8 px-3"
              style={{ color: 'var(--text-tertiary)' }}
            >
              Clear All
            </Button>
          )}
        </div>

        {/* Dropdown Panel - All Filters */}
        <AnimatePresence>
          {showAllFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <div className="p-4 rounded-xl space-y-4" style={{ backgroundColor: 'var(--background)' }}>
                {/* 1-Column on Mobile, 2-Column on Desktop */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Account - Multi-select */}
                  <div className="space-y-1.5">
                    <Label className="font-[family-name:var(--font-dm-sans)] text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                      Account
                    </Label>
                    <AccountMultiSelect
                      selectedAccounts={selectedAccounts || []}
                      onChange={setSelectedAccounts || (() => {})}
                      accounts={accounts}
                    />
                  </div>

                  {/* Category - Multi-select */}
                  <div className="space-y-1.5">
                    <Label className="font-[family-name:var(--font-dm-sans)] text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                      Category
                    </Label>
                    <ModernCategorySelect
                      selectedCategories={selectedCategories || []}
                      onChange={setSelectedCategories || (() => {})}
                    />
                  </div>

                  {/* Status */}
                  <div className="space-y-1.5">
                    <Label className="font-[family-name:var(--font-dm-sans)] text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                      Status
                    </Label>
                    <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                      <SelectTrigger className="h-10 rounded-lg border font-[family-name:var(--font-dm-sans)]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="SETTLED">Settled</SelectItem>
                        <SelectItem value="HELD">Pending</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Year - Multi-select */}
                  <div className="space-y-1.5">
                    <Label className="font-[family-name:var(--font-dm-sans)] text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                      Year
                    </Label>
                    <YearMultiSelect
                      selectedYears={selectedYears || []}
                      onChange={setSelectedYears || (() => {})}
                      availableYears={availableYears}
                    />
                  </div>
                </div>

                {/* Amount Range - Full Width */}
                <div className="space-y-1.5">
                  <Label className="font-[family-name:var(--font-dm-sans)] text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                    Amount Range
                  </Label>
                  <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                    <Input
                      type="number"
                      placeholder="Min"
                      value={minAmount}
                      onChange={(e) => setMinAmount(e.target.value)}
                      className="h-10 rounded-lg border font-[family-name:var(--font-dm-sans)]"
                    />
                    <span className="text-sm text-center sm:text-left" style={{ color: 'var(--text-tertiary)' }}>to</span>
                    <Input
                      type="number"
                      placeholder="Max"
                      value={maxAmount}
                      onChange={(e) => setMaxAmount(e.target.value)}
                      className="h-10 rounded-lg border font-[family-name:var(--font-dm-sans)]"
                    />
                  </div>
                  {/* Quick amount filters */}
                  <div className="flex gap-2 pt-1">
                    {[">$100", "<$10", ">$1000"].map((quick) => (
                      <Button
                        key={quick}
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (quick === ">$100") { setMinAmount("100"); setMaxAmount(""); }
                          else if (quick === "<$10") { setMinAmount(""); setMaxAmount("10"); }
                          else { setMinAmount("1000"); setMaxAmount(""); }
                        }}
                        className="rounded-full text-[11px] h-7 px-3"
                        style={{ backgroundColor: 'var(--muted)', color: 'var(--text-secondary)' }}
                      >
                        {quick}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Custom Date Range - Full Width */}
                <div className="space-y-1.5">
                  <Label className="font-[family-name:var(--font-dm-sans)] text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                    Custom Date Range
                  </Label>
                  <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                    <Input
                      type="date"
                      value={startDate}
                      onChange={(e) => { setStartDate(e.target.value); setSelectedYear("all"); setDateRange("all"); }}
                      className="h-10 rounded-lg border font-[family-name:var(--font-dm-sans)] text-sm"
                    />
                    <span className="text-sm text-center sm:text-left" style={{ color: 'var(--text-tertiary)' }}>→</span>
                    <Input
                      type="date"
                      value={endDate}
                      onChange={(e) => { setEndDate(e.target.value); setSelectedYear("all"); setDateRange("all"); }}
                      className="h-10 rounded-lg border font-[family-name:var(--font-dm-sans)] text-sm"
                    />
                  </div>
                </div>

                {/* Advanced Options - Checkboxes */}
                <div className="space-y-2 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
                  <p className="font-[family-name:var(--font-dm-sans)] text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                    Advanced
                  </p>
                  <div
                    className="flex items-center gap-3 p-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => setIncludeTransfers(!includeTransfers)}
                  >
                    <Checkbox
                      id="include-transfers"
                      checked={includeTransfers}
                      onCheckedChange={(checked) => setIncludeTransfers(checked === true)}
                      className="h-5 w-5"
                    />
                    <div className="flex-1">
                      <label htmlFor="include-transfers" className="font-[family-name:var(--font-dm-sans)] text-sm block cursor-pointer" style={{ color: 'var(--text-primary)' }}>
                        Include Transfers
                      </label>
                      <span className="font-[family-name:var(--font-dm-sans)] text-xs" style={{ color: 'var(--text-tertiary)' }}>
                        Show P2P transfers between UP accounts
                      </span>
                    </div>
                  </div>

                  {/* Income Mode Toggle */}
                  <div
                    className="flex items-center gap-3 p-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => setIncomeMode(incomeMode === "marked_sources" ? "all_positive" : "marked_sources")}
                  >
                    <Checkbox
                      id="marked-income-only"
                      checked={incomeMode === "marked_sources"}
                      onCheckedChange={(checked) => setIncomeMode(checked ? "marked_sources" : "all_positive")}
                      className="h-5 w-5"
                    />
                    <div className="flex-1">
                      <label htmlFor="marked-income-only" className="font-[family-name:var(--font-dm-sans)] text-sm block cursor-pointer" style={{ color: 'var(--text-primary)' }}>
                        Marked Income Only
                      </label>
                      <span className="font-[family-name:var(--font-dm-sans)] text-xs" style={{ color: 'var(--text-tertiary)' }}>
                        {incomeMode === "marked_sources" ? "Showing only configured income sources" : "Showing all positive transactions as income"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
