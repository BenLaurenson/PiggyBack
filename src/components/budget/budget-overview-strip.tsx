"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/budget-zero-calculations";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getPeriodStartDate, getPeriodEndDate } from "@/lib/budget-period-helpers";
import { getDateComponentsInTimezone, DEFAULT_BUDGET_TIMEZONE } from "@/lib/budget-engine";

type PeriodType = "weekly" | "fortnightly" | "monthly";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_LABELS_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function getBudgetStatus(toBeBudgeted: number) {
  if (toBeBudgeted > 0) {
    return { label: "left to budget", shortLabel: "left", color: "var(--pastel-mint-dark)" };
  }
  if (toBeBudgeted === 0) {
    return { label: "fully budgeted", shortLabel: "budgeted", color: "var(--pastel-blue-dark)" };
  }
  return { label: "over budget", shortLabel: "over", color: "var(--pastel-coral-dark)" };
}

function formatPeriodDisplay(currentPeriod: Date | undefined, periodType: PeriodType, compact: boolean) {
  if (!currentPeriod) return "";
  const start = getPeriodStartDate(currentPeriod, periodType);
  const end = getPeriodEndDate(currentPeriod, periodType);

  if (periodType === "monthly") {
    // Use start date (which has correct UTC year/month) for display
    return compact
      ? start.toLocaleDateString("en-AU", { month: "short", timeZone: "UTC" })
      : start.toLocaleDateString("en-AU", { month: "long", year: "numeric", timeZone: "UTC" });
  }

  const month = start.toLocaleDateString("en-AU", { month: "short", timeZone: "UTC" });
  return `${start.getUTCDate()}-${end.getUTCDate()} ${month}`;
}

/** Get the last day of a month */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** Generate week periods for a given month (month-aligned) */
function getWeekPeriods(year: number, month: number) {
  const lastDay = daysInMonth(year, month);
  return [
    { start: 1, end: 7, label: `1-7` },
    { start: 8, end: 14, label: `8-14` },
    { start: 15, end: 21, label: `15-21` },
    { start: 22, end: lastDay, label: `22-${lastDay}` },
  ];
}

/** Generate fortnight periods for a given month (month-aligned) */
function getFortnightPeriods(year: number, month: number) {
  const lastDay = daysInMonth(year, month);
  return [
    { start: 1, end: 14, label: `1-14` },
    { start: 15, end: lastDay, label: `15-${lastDay}` },
  ];
}

interface BudgetOverviewStripProps {
  toBeBudgeted: number;
  income?: number;
  budgeted?: number;
  spent?: number;
  currentPeriod?: Date;
  periodType: PeriodType;
  onPrevious?: () => void;
  onNext?: () => void;
  onDateSelect?: (date: Date) => void;
}

export function BudgetOverviewStrip({
  toBeBudgeted,
  income,
  budgeted,
  spent,
  currentPeriod,
  periodType,
  onPrevious,
  onNext,
  onDateSelect,
}: BudgetOverviewStripProps) {
  const status = getBudgetStatus(toBeBudgeted);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(() => {
    if (currentPeriod) {
      const { year } = getDateComponentsInTimezone(currentPeriod, DEFAULT_BUDGET_TIMEZONE);
      return year;
    }
    return new Date().getFullYear();
  });
  const [pickerMonth, setPickerMonth] = useState(() => {
    if (currentPeriod) {
      const { month } = getDateComponentsInTimezone(currentPeriod, DEFAULT_BUDGET_TIMEZONE);
      return month;
    }
    return new Date().getMonth();
  });

  const handlePickerPrevMonth = () => {
    if (pickerMonth === 0) {
      setPickerMonth(11);
      setPickerYear(y => y - 1);
    } else {
      setPickerMonth(m => m - 1);
    }
  };

  const handlePickerNextMonth = () => {
    if (pickerMonth === 11) {
      setPickerMonth(0);
      setPickerYear(y => y + 1);
    } else {
      setPickerMonth(m => m + 1);
    }
  };

  /** Check if a period (by start day) within pickerYear/pickerMonth is the currently selected one */
  const isPeriodSelected = (startDay: number) => {
    if (!currentPeriod) return false;
    const selectedStart = getPeriodStartDate(currentPeriod, periodType);
    return (
      selectedStart.getUTCFullYear() === pickerYear &&
      selectedStart.getUTCMonth() === pickerMonth &&
      selectedStart.getUTCDate() === startDay
    );
  };

  /** Check if a period is the current real-time period */
  const isCurrentPeriod = (startDay: number) => {
    const now = new Date();
    const nowStart = getPeriodStartDate(now, periodType);
    return (
      nowStart.getUTCFullYear() === pickerYear &&
      nowStart.getUTCMonth() === pickerMonth &&
      nowStart.getUTCDate() === startDay
    );
  };

  return (
    <div
      className="flex items-center justify-between gap-3 px-4 py-3 md:px-5 md:py-4 rounded-2xl shadow-sm"
      style={{ backgroundColor: "var(--surface-elevated)" }}
    >
      {/* TBB + Income */}
      <div className="flex items-center gap-3 md:gap-4 min-w-0">
        {/* Income / Pay Amount */}
        {income != null && income > 0 && (
          <div className="hidden md:flex flex-col items-start">
            <span
              className="font-[family-name:var(--font-dm-sans)] font-medium text-[10px] uppercase tracking-wider leading-none mb-0.5"
              style={{ color: "var(--text-tertiary)" }}
            >
              {periodType === 'monthly' ? 'Income' : 'Pay'}
            </span>
            <span
              className="font-[family-name:var(--font-nunito)] font-bold text-sm leading-none"
              style={{ color: "var(--text-secondary)" }}
            >
              {formatCurrency(income)}
            </span>
          </div>
        )}
        {income != null && income > 0 && (
          <div
            className="hidden md:block w-px h-7 flex-shrink-0"
            style={{ backgroundColor: "var(--border)" }}
          />
        )}
        {/* Budgeted */}
        {budgeted != null && (
          <div className="hidden md:flex flex-col items-start">
            <span
              className="font-[family-name:var(--font-dm-sans)] font-medium text-[10px] uppercase tracking-wider leading-none mb-0.5"
              style={{ color: "var(--text-tertiary)" }}
            >
              Budgeted
            </span>
            <span
              className="font-[family-name:var(--font-nunito)] font-bold text-sm leading-none"
              style={{ color: "var(--text-secondary)" }}
            >
              {formatCurrency(budgeted)}
            </span>
          </div>
        )}
        {budgeted != null && (
          <div
            className="hidden md:block w-px h-7 flex-shrink-0"
            style={{ backgroundColor: "var(--border)" }}
          />
        )}
        {/* Spent */}
        {spent != null && (
          <div className="hidden md:flex flex-col items-start">
            <span
              className="font-[family-name:var(--font-dm-sans)] font-medium text-[10px] uppercase tracking-wider leading-none mb-0.5"
              style={{ color: "var(--text-tertiary)" }}
            >
              Spent
            </span>
            <span
              className="font-[family-name:var(--font-nunito)] font-bold text-sm leading-none"
              style={{
                color: budgeted != null && spent > budgeted
                  ? "var(--pastel-coral-dark)"
                  : "var(--text-secondary)",
              }}
            >
              {formatCurrency(spent)}
            </span>
          </div>
        )}
        {spent != null && (
          <div
            className="hidden md:block w-px h-7 flex-shrink-0"
            style={{ backgroundColor: "var(--border)" }}
          />
        )}
        {/* TBB */}
        <div className="flex items-baseline gap-1.5 md:gap-2 min-w-0">
          <motion.span
            key={`tbb-${toBeBudgeted}`}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2 }}
            className="font-[family-name:var(--font-nunito)] font-black tracking-tight leading-none text-xl md:text-[28px]"
            style={{ color: status.color }}
          >
            {formatCurrency(Math.abs(toBeBudgeted))}
          </motion.span>
          <span className="font-[family-name:var(--font-dm-sans)] font-medium text-xs md:text-sm whitespace-nowrap"
            style={{ color: "var(--text-tertiary)" }}
          >
            <span className="hidden md:inline">{status.label}</span>
            <span className="md:hidden">{status.shortLabel}</span>
          </span>
        </div>
      </div>

      {/* Period Navigation */}
      <div className="flex items-center flex-shrink-0">
        <button
          onClick={onPrevious}
          className="flex items-center justify-center h-9 w-9 md:h-11 md:w-11 rounded-xl hover:bg-[var(--surface-secondary)] active:bg-[var(--muted)] transition-colors cursor-pointer"
          aria-label="Previous period"
        >
          <ChevronLeft className="h-4 w-4 md:h-5 md:w-5" style={{ color: "var(--text-tertiary)" }} />
        </button>

        <Popover open={calendarOpen} onOpenChange={(open) => {
            setCalendarOpen(open);
            if (open && currentPeriod) {
              const { year, month } = getDateComponentsInTimezone(currentPeriod, DEFAULT_BUDGET_TIMEZONE);
              setPickerYear(year);
              setPickerMonth(month);
            }
          }}>
          <PopoverTrigger asChild>
            <button
              className={cn(
                "text-center font-[family-name:var(--font-nunito)] font-bold select-none cursor-pointer",
                "text-sm md:text-[15px] min-w-[60px] md:min-w-[160px]",
                "rounded-lg px-2 py-1 hover:bg-[var(--surface-secondary)] transition-colors"
              )}
              style={{ color: "var(--text-primary)" }}
              aria-label="Pick a date"
            >
              <AnimatePresence mode="wait">
                <motion.span
                  key={`${currentPeriod?.toISOString()}-${periodType}`}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.15 }}
                >
                  <span className="hidden md:inline">{formatPeriodDisplay(currentPeriod, periodType, false)}</span>
                  <span className="md:hidden">{formatPeriodDisplay(currentPeriod, periodType, true)}</span>
                </motion.span>
              </AnimatePresence>
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[260px] p-3" align="center">
            {periodType === "monthly" ? (
              <>
                {/* Monthly: Year nav + 3x4 month grid */}
                <div className="flex items-center justify-between mb-3">
                  <button
                    onClick={() => setPickerYear(y => y - 1)}
                    className="flex items-center justify-center h-8 w-8 rounded-lg hover:bg-[var(--muted)] transition-colors cursor-pointer"
                    aria-label="Previous year"
                  >
                    <ChevronLeft className="h-4 w-4" style={{ color: "var(--text-tertiary)" }} />
                  </button>
                  <span
                    className="font-[family-name:var(--font-nunito)] font-bold text-sm"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {pickerYear}
                  </span>
                  <button
                    onClick={() => setPickerYear(y => y + 1)}
                    className="flex items-center justify-center h-8 w-8 rounded-lg hover:bg-[var(--muted)] transition-colors cursor-pointer"
                    aria-label="Next year"
                  >
                    <ChevronRight className="h-4 w-4" style={{ color: "var(--text-tertiary)" }} />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {MONTH_LABELS.map((label, i) => {
                    const cpComponents = currentPeriod ? getDateComponentsInTimezone(currentPeriod, DEFAULT_BUDGET_TIMEZONE) : null;
                    const isSelected =
                      cpComponents?.year === pickerYear &&
                      cpComponents?.month === i;
                    const nowComponents = getDateComponentsInTimezone(new Date(), DEFAULT_BUDGET_TIMEZONE);
                    const isCurrentMonth =
                      nowComponents.year === pickerYear &&
                      nowComponents.month === i;

                    return (
                      <button
                        key={label}
                        onClick={() => {
                          onDateSelect?.(new Date(Date.UTC(pickerYear, i, 1)));
                          setCalendarOpen(false);
                        }}
                        className={cn(
                          "h-9 rounded-lg text-sm font-medium transition-colors cursor-pointer",
                          "hover:bg-[var(--muted)]",
                          isSelected && "font-bold",
                        )}
                        style={{
                          backgroundColor: isSelected ? "var(--brand-coral)" : undefined,
                          color: isSelected
                            ? "white"
                            : isCurrentMonth
                              ? "var(--brand-coral)"
                              : "var(--text-primary)",
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                {/* Weekly / Fortnightly: Month+Year nav + period buttons */}
                <div className="flex items-center justify-between mb-3">
                  <button
                    onClick={handlePickerPrevMonth}
                    className="flex items-center justify-center h-8 w-8 rounded-lg hover:bg-[var(--muted)] transition-colors cursor-pointer"
                    aria-label="Previous month"
                  >
                    <ChevronLeft className="h-4 w-4" style={{ color: "var(--text-tertiary)" }} />
                  </button>
                  <span
                    className="font-[family-name:var(--font-nunito)] font-bold text-sm"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {MONTH_LABELS_FULL[pickerMonth]} {pickerYear}
                  </span>
                  <button
                    onClick={handlePickerNextMonth}
                    className="flex items-center justify-center h-8 w-8 rounded-lg hover:bg-[var(--muted)] transition-colors cursor-pointer"
                    aria-label="Next month"
                  >
                    <ChevronRight className="h-4 w-4" style={{ color: "var(--text-tertiary)" }} />
                  </button>
                </div>
                <div className={cn(
                  "grid gap-1.5",
                  periodType === "weekly" ? "grid-cols-2" : "grid-cols-1"
                )}>
                  {(periodType === "weekly"
                    ? getWeekPeriods(pickerYear, pickerMonth)
                    : getFortnightPeriods(pickerYear, pickerMonth)
                  ).map((period) => {
                    const isSelected = isPeriodSelected(period.start);
                    const isCurrent = isCurrentPeriod(period.start);
                    const monthLabel = MONTH_LABELS[pickerMonth];

                    return (
                      <button
                        key={period.start}
                        onClick={() => {
                          onDateSelect?.(new Date(Date.UTC(pickerYear, pickerMonth, period.start)));
                          setCalendarOpen(false);
                        }}
                        className={cn(
                          "h-10 rounded-lg text-sm font-medium transition-colors cursor-pointer",
                          "hover:bg-[var(--muted)]",
                          isSelected && "font-bold",
                        )}
                        style={{
                          backgroundColor: isSelected ? "var(--brand-coral)" : undefined,
                          color: isSelected
                            ? "white"
                            : isCurrent
                              ? "var(--brand-coral)"
                              : "var(--text-primary)",
                        }}
                      >
                        {period.label} {monthLabel}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </PopoverContent>
        </Popover>

        <button
          onClick={onNext}
          className="flex items-center justify-center h-9 w-9 md:h-11 md:w-11 rounded-xl hover:bg-[var(--surface-secondary)] active:bg-[var(--muted)] transition-colors cursor-pointer"
          aria-label="Next period"
        >
          <ChevronRight className="h-4 w-4 md:h-5 md:w-5" style={{ color: "var(--text-tertiary)" }} />
        </button>
      </div>
    </div>
  );
}
