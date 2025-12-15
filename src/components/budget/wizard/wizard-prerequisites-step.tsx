"use client";

import { Button } from "@/components/ui/button";
import {
  Check,
  AlertTriangle,
  Minus,
  DollarSign,
  Users,
  CreditCard,
  Receipt,
  Target,
  TrendingUp,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import type { WizardState } from "../budget-create-wizard";
import type { WizardPrerequisites } from "../budget-create-wizard";

interface WizardPrerequisitesStepProps {
  state: WizardState;
  prerequisites: WizardPrerequisites;
  onNext: () => void;
  onBack: () => void;
}

type ItemStatus = "done" | "required" | "recommended" | "optional";

interface PrerequisiteItem {
  label: string;
  description: string;
  status: ItemStatus;
  href: string;
  Icon: LucideIcon;
  show: boolean;
  /** Whether this item counts toward the progress bar */
  essential: boolean;
}

export function WizardPrerequisitesStep({
  state,
  prerequisites,
  onNext,
}: WizardPrerequisitesStepProps) {
  const items: PrerequisiteItem[] = [
    {
      label: "Your Salary",
      description: prerequisites.hasSalary
        ? "Salary configured"
        : state.budgetType === "custom"
          ? "Optional — custom budgets use a manual total amount"
          : "Add your recurring salary so we can calculate your budget",
      status: prerequisites.hasSalary
        ? "done"
        : state.budgetType === "custom"
          ? "optional"
          : "required",
      href: "/settings/income",
      Icon: DollarSign,
      show: true,
      essential: state.budgetType !== "custom",
    },
    {
      label: "Partner\u2019s Income",
      description: prerequisites.hasPartnerIncome
        ? "Partner income configured"
        : "Add your partner\u2019s income for accurate household budgeting",
      status: prerequisites.hasPartnerIncome
        ? "done"
        : state.budgetType === "household"
          ? "required"
          : "optional",
      href: "/settings/income",
      Icon: Users,
      show: state.budgetType === "household",
      essential: state.budgetType === "household",
    },
    {
      label: "Bank Connected",
      description: prerequisites.hasBankConnection
        ? "UP Bank connected"
        : "Connect your UP Bank account for automatic transaction tracking",
      status: prerequisites.hasBankConnection ? "done" : "recommended",
      href: "/settings",
      Icon: CreditCard,
      show: true,
      essential: true,
    },
    {
      label: "Recurring Expenses",
      description:
        prerequisites.expenseCount > 0
          ? `${prerequisites.expenseCount} expense${prerequisites.expenseCount !== 1 ? "s" : ""} configured`
          : "You can add recurring bills after creating your budget",
      status: prerequisites.expenseCount > 0 ? "done" : "optional",
      href: "/budget",
      Icon: Receipt,
      show: true,
      essential: false,
    },
    {
      label: "Savings Goals",
      description:
        prerequisites.goalCount > 0
          ? `${prerequisites.goalCount} goal${prerequisites.goalCount !== 1 ? "s" : ""} set up`
          : "You can set savings goals after creating your budget",
      status: prerequisites.goalCount > 0 ? "done" : "optional",
      href: "/goals",
      Icon: Target,
      show: true,
      essential: false,
    },
    {
      label: "Investments",
      description:
        prerequisites.investmentCount > 0
          ? `${prerequisites.investmentCount} investment${prerequisites.investmentCount !== 1 ? "s" : ""} tracked`
          : "You can link investments after creating your budget",
      status: prerequisites.investmentCount > 0 ? "done" : "optional",
      href: "/invest",
      Icon: TrendingUp,
      show: true,
      essential: false,
    },
  ];

  const visibleItems = items.filter((item) => item.show);
  const essentialItems = visibleItems.filter((item) => item.essential);
  const optionalItems = visibleItems.filter((item) => !item.essential);
  const hasBlockers = visibleItems.some(
    (item) => item.status === "required"
  );
  const essentialDoneCount = essentialItems.filter(
    (item) => item.status === "done"
  ).length;

  return (
    <div>
      <h2
        className="font-[family-name:var(--font-nunito)] text-2xl md:text-3xl font-bold mb-2"
        style={{ color: "var(--text-primary)" }}
      >
        Before You Start
      </h2>
      <p
        className="text-base mb-8"
        style={{ color: "var(--text-secondary)" }}
      >
        {hasBlockers
          ? "A few things need to be set up before creating your budget."
          : "Looking good! You can continue or set up optional items first."}
      </p>

      {/* Progress summary — only counts essential items */}
      <div
        className="rounded-2xl p-4 mb-6 flex items-center gap-3"
        style={{ backgroundColor: "var(--surface-elevated)" }}
      >
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{
            backgroundColor: hasBlockers
              ? "var(--pastel-coral-light, rgba(248,113,113,0.15))"
              : "var(--pastel-mint-light, rgba(52,211,153,0.15))",
          }}
        >
          {hasBlockers ? (
            <AlertTriangle
              className="w-5 h-5"
              style={{ color: "var(--pastel-coral-dark)" }}
              aria-hidden="true"
            />
          ) : (
            <Check
              className="w-5 h-5"
              style={{ color: "var(--pastel-mint-dark)" }}
              aria-hidden="true"
            />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <span
            className="text-sm font-[family-name:var(--font-nunito)] font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            {essentialDoneCount === essentialItems.length
              ? "All set"
              : `${essentialDoneCount} of ${essentialItems.length} complete`}
          </span>
          <div
            className="h-1.5 rounded-full mt-1.5 w-full overflow-hidden"
            style={{ backgroundColor: "var(--border)" }}
          >
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${essentialItems.length > 0 ? (essentialDoneCount / essentialItems.length) * 100 : 100}%`,
                backgroundColor: hasBlockers
                  ? "var(--pastel-coral-dark)"
                  : "var(--pastel-mint-dark)",
              }}
            />
          </div>
        </div>
      </div>

      {/* Essential checklist */}
      <div
        className="rounded-2xl border overflow-hidden mb-6"
        style={{
          backgroundColor: "var(--surface-elevated)",
          borderColor: "var(--border)",
        }}
      >
        {essentialItems.map((item, i) => (
          <PrerequisiteRow
            key={item.label}
            item={item}
            isLast={i === essentialItems.length - 1}
          />
        ))}
      </div>

      {/* Optional items */}
      {optionalItems.length > 0 && (
        <>
          <p
            className="text-xs font-medium uppercase tracking-wider mb-3"
            style={{ color: "var(--text-tertiary)" }}
          >
            Optional — can be set up later
          </p>
          <div
            className="rounded-2xl border overflow-hidden mb-8"
            style={{
              backgroundColor: "var(--surface-elevated)",
              borderColor: "var(--border)",
            }}
          >
            {optionalItems.map((item, i) => (
              <PrerequisiteRow
                key={item.label}
                item={item}
                isLast={i === optionalItems.length - 1}
              />
            ))}
          </div>
        </>
      )}

      {/* Continue */}
      <Button
        onClick={onNext}
        disabled={hasBlockers}
        size="lg"
        className="w-full rounded-xl h-12 text-base font-[family-name:var(--font-nunito)] font-bold cursor-pointer"
        style={{
          backgroundColor: hasBlockers
            ? "var(--muted)"
            : "var(--brand-coral)",
          color: hasBlockers ? "var(--text-tertiary)" : "white",
        }}
      >
        {hasBlockers ? "Complete Required Items to Continue" : "Continue"}
      </Button>
    </div>
  );
}

function PrerequisiteRow({
  item,
  isLast,
}: {
  item: PrerequisiteItem;
  isLast: boolean;
}) {
  const { Icon } = item;
  return (
    <div
      className="flex items-center gap-4 px-5 py-4"
      style={{
        borderBottom: isLast ? undefined : "1px solid var(--border)",
      }}
    >
      {/* Status icon */}
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
        style={{
          backgroundColor:
            item.status === "done"
              ? "var(--pastel-mint-light, rgba(52,211,153,0.15))"
              : item.status === "required"
                ? "var(--pastel-coral-light, rgba(248,113,113,0.15))"
                : item.status === "recommended"
                  ? "var(--pastel-yellow-light, rgba(251,191,36,0.15))"
                  : "var(--muted)",
        }}
      >
        {item.status === "done" ? (
          <Check
            className="w-4 h-4"
            style={{ color: "var(--pastel-mint-dark)" }}
            aria-hidden="true"
          />
        ) : item.status === "required" ? (
          <AlertTriangle
            className="w-4 h-4"
            style={{ color: "var(--pastel-coral-dark)" }}
            aria-hidden="true"
          />
        ) : item.status === "recommended" ? (
          <AlertTriangle
            className="w-4 h-4"
            style={{ color: "var(--pastel-yellow-dark)" }}
            aria-hidden="true"
          />
        ) : (
          <Minus
            className="w-4 h-4"
            style={{ color: "var(--text-tertiary)" }}
            aria-hidden="true"
          />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Icon
            className="w-4 h-4 shrink-0"
            style={{ color: "var(--text-secondary)" }}
            aria-hidden="true"
          />
          <span
            className="text-sm font-[family-name:var(--font-nunito)] font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            {item.label}
          </span>
          {item.status !== "done" && item.status !== "optional" && (
            <span
              className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded"
              style={{
                color:
                  item.status === "required"
                    ? "var(--pastel-coral-dark)"
                    : "var(--pastel-yellow-dark)",
                backgroundColor:
                  item.status === "required"
                    ? "var(--pastel-coral-light, rgba(248,113,113,0.15))"
                    : "var(--pastel-yellow-light, rgba(251,191,36,0.15))",
              }}
            >
              {item.status}
            </span>
          )}
        </div>
        <p
          className="text-xs mt-0.5"
          style={{ color: "var(--text-tertiary)" }}
        >
          {item.description}
        </p>
      </div>

      {/* Action link */}
      {item.status !== "done" && (
        <Link
          href={item.href}
          target="_blank"
          className="shrink-0"
        >
          <Button
            variant="ghost"
            size="sm"
            className="h-8 cursor-pointer"
            style={{ color: "var(--brand-coral)" }}
          >
            Set Up
            <ExternalLink className="w-3 h-3 ml-1" aria-hidden="true" />
          </Button>
        </Link>
      )}
    </div>
  );
}
