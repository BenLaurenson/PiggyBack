"use client";

import { motion } from "framer-motion";
import {
  GoalsBentoPreview,
  MerchantDeepDiveMini,
  ThemesMini,
  SankeyBentoPreview,
  InvestingMini,
  OpenClawMini,
  ActivityMini,
  MITLicenseMini,
} from "./app-previews";

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.4 },
};

export function BentoGrid() {
  return (
    <section className="py-16 md:py-24 px-4">
      <div className="max-w-6xl mx-auto">
        <motion.div {...fadeUp} className="text-center mb-12">
          <p
            className="font-[family-name:var(--font-nunito)] font-bold text-sm uppercase tracking-wider mb-2"
            style={{ color: "var(--pastel-purple-dark)" }}
          >
            And there&apos;s more
          </p>
          <h2
            className="font-[family-name:var(--font-nunito)] text-3xl md:text-4xl font-black"
            style={{ color: "var(--text-primary)" }}
          >
            Everything you need, nothing you don&apos;t
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Goals — 2×1 */}
          <motion.div
            {...fadeUp}
            transition={{ duration: 0.4, delay: 0.05 }}
            className="sm:col-span-2 rounded-xl border overflow-hidden"
            style={{ backgroundColor: "var(--surface-elevated)", borderColor: "var(--border)" }}
          >
            <GoalsBentoPreview />
          </motion.div>

          {/* Merchant Deep-Dive — 1×1 */}
          <motion.div
            {...fadeUp}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="rounded-xl border p-5"
            style={{ backgroundColor: "var(--surface-elevated)", borderColor: "var(--border)" }}
          >
            <MerchantDeepDiveMini />
          </motion.div>

          {/* 4 Themes — 1×1 */}
          <motion.div
            {...fadeUp}
            transition={{ duration: 0.4, delay: 0.15 }}
            className="rounded-xl border p-5"
            style={{ backgroundColor: "var(--surface-elevated)", borderColor: "var(--border)" }}
          >
            <ThemesMini />
          </motion.div>

          {/* Sankey Diagrams — 2×1 */}
          <motion.div
            {...fadeUp}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="sm:col-span-2 rounded-xl border p-5"
            style={{ backgroundColor: "var(--surface-elevated)", borderColor: "var(--border)" }}
          >
            <SankeyBentoPreview />
          </motion.div>

          {/* Investing — 1×1 */}
          <motion.div
            {...fadeUp}
            transition={{ duration: 0.4, delay: 0.25 }}
            className="rounded-xl border p-5"
            style={{ backgroundColor: "var(--surface-elevated)", borderColor: "var(--border)" }}
          >
            <InvestingMini />
          </motion.div>

          {/* OpenClaw Skill — 1×1 */}
          <motion.div
            {...fadeUp}
            transition={{ duration: 0.4, delay: 0.3 }}
            className="rounded-xl border p-5"
            style={{ backgroundColor: "var(--surface-elevated)", borderColor: "var(--border)" }}
          >
            <OpenClawMini />
          </motion.div>

          {/* Activity — 1×1 */}
          <motion.div
            {...fadeUp}
            transition={{ duration: 0.4, delay: 0.35 }}
            className="rounded-xl border p-5"
            style={{ backgroundColor: "var(--surface-elevated)", borderColor: "var(--border)" }}
          >
            <ActivityMini />
          </motion.div>

          {/* MIT Licensed — 1×1 */}
          <motion.div
            {...fadeUp}
            transition={{ duration: 0.4, delay: 0.4 }}
            className="rounded-xl border p-5"
            style={{ backgroundColor: "var(--surface-elevated)", borderColor: "var(--border)" }}
          >
            <MITLicenseMini />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
