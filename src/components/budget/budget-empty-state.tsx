"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Plus, Wallet, TrendingUp, PiggyBank } from "lucide-react";
import Link from "next/link";

interface BudgetEmptyStateProps {
  hasExistingData?: boolean;
}

export function BudgetEmptyState({
  hasExistingData = false,
}: BudgetEmptyStateProps) {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="max-w-2xl w-full text-center">
        {/* Animated illustration */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="mb-8"
        >
          <div className="relative mx-auto w-28 h-28">
            {/* Background glow */}
            <div
              className="absolute inset-0 rounded-3xl blur-2xl opacity-30"
              style={{ backgroundColor: "var(--pastel-mint)" }}
            />
            {/* Icon container */}
            <div
              className="relative w-28 h-28 rounded-3xl flex items-center justify-center"
              style={{ backgroundColor: "var(--pastel-mint-light, var(--surface-elevated))" }}
            >
              <Wallet
                className="w-12 h-12"
                style={{ color: "var(--pastel-mint-dark)" }}
                aria-hidden="true"
              />
            </div>
            {/* Floating accent icons */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.4 }}
              className="absolute -top-2 -right-3 w-9 h-9 rounded-xl flex items-center justify-center shadow-sm"
              style={{ backgroundColor: "var(--pastel-coral-light, var(--surface-elevated))" }}
            >
              <TrendingUp
                className="w-4 h-4"
                style={{ color: "var(--pastel-coral-dark)" }}
                aria-hidden="true"
              />
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45, duration: 0.4 }}
              className="absolute -bottom-2 -left-3 w-9 h-9 rounded-xl flex items-center justify-center shadow-sm"
              style={{ backgroundColor: "var(--pastel-yellow-light, var(--surface-elevated))" }}
            >
              <PiggyBank
                className="w-4 h-4"
                style={{ color: "var(--pastel-yellow-dark)" }}
                aria-hidden="true"
              />
            </motion.div>
          </div>
        </motion.div>

        {/* Copy */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.4 }}
        >
          {hasExistingData ? (
            <>
              <h2
                className="font-[family-name:var(--font-nunito)] text-2xl md:text-3xl font-bold mb-3"
                style={{ color: "var(--text-primary)" }}
              >
                Welcome to the New Budget
              </h2>
              <p
                className="text-base md:text-lg max-w-md mx-auto mb-2"
                style={{ color: "var(--text-secondary)" }}
              >
                We&rsquo;ve redesigned budgeting from the ground up. Create
                multiple budgets, pick from templates, and customise everything.
              </p>
              <p
                className="text-sm max-w-sm mx-auto mb-8"
                style={{ color: "var(--text-tertiary)" }}
              >
                Your existing budget data is safe &mdash; you can import it
                during setup.
              </p>
            </>
          ) : (
            <>
              <h2
                className="font-[family-name:var(--font-nunito)] text-2xl md:text-3xl font-bold mb-3"
                style={{ color: "var(--text-primary)" }}
              >
                Track Your Money with Purpose
              </h2>
              <p
                className="text-base md:text-lg max-w-md mx-auto mb-8"
                style={{ color: "var(--text-secondary)" }}
              >
                Create budgets to control spending, plan for goals, and see
                where every dollar goes.
              </p>
            </>
          )}
        </motion.div>

        {/* Primary CTA */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.4 }}
        >
          <Link href="/budget/create">
            <Button
              size="lg"
              className="rounded-xl px-8 h-12 text-base font-[family-name:var(--font-nunito)] font-bold cursor-pointer"
              style={{
                backgroundColor: "var(--brand-coral)",
                color: "white",
              }}
            >
              <Plus className="w-5 h-5 mr-2" aria-hidden="true" />
              Create Your First Budget
            </Button>
          </Link>
        </motion.div>
      </div>
    </div>
  );
}
