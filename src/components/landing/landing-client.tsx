"use client";

import { motion } from "framer-motion";
import {
  Zap,
  Brain,
  PiggyBank,
  Receipt,
  HeartHandshake,
  Sparkles,
  Database,
  Rocket,
  Terminal as TerminalIcon,
} from "lucide-react";
import { BrowserMockup } from "./browser-mockup";
import { Terminal } from "./terminal";
import { FeatureSection, type FeatureSectionProps } from "./feature-section";
import {
  DashboardOverviewPreview,
  WebhookSyncPreview,
  BudgetPreview,
  BillsPreview,
  CouplesPreview,
  AIAgentPreview,
  CategorizationPreview,
} from "./app-previews";
import { BentoGrid } from "./bento-grid";

// ============================================================================
// Feature data (kept in client component to avoid serialization issues)
// ============================================================================

const FEATURES: (Omit<FeatureSectionProps, "visual"> & { visual: string })[] = [
  {
    icon: PiggyBank,
    iconBg: "bg-pastel-blue-light",
    mascotScene: "mascot-scene-budget.png",
    mascotAlt: "Penny riding piggyback on Buck pointing at a bar chart made of stacked gold coins",
    tagline: "Budgeting Without the Busywork",
    accentColor: "text-pastel-blue-dark",
    title: "Set your budget in seconds. Never enter a transaction.",
    description:
      "Transactions sync from Up Bank automatically. You set spending limits, create your own categories, and choose your budget period. Everything stays up to date without you lifting a finger.",
    highlights: [
      "Transactions sync the moment they happen",
      "Custom categories and subcategories with emoji icons",
      "Weekly, fortnightly, or monthly budget periods",
      "Separate budget views for you and your partner",
    ],
    visual: "budget" as const,
    direction: "left" as const,
  },
  {
    icon: Sparkles,
    iconBg: "bg-pastel-lavender-light",
    mascotScene: "piggyback-celebrating.png",
    mascotAlt: "Superhero Penny with cape and star glasses surrounded by orbiting tool icons while Buck watches amazed",
    tagline: "25-Tool AI Agent",
    accentColor: "text-pastel-lavender-dark",
    title: "Not a chatbot. A financial analyst.",
    description:
      "Penny has 29 tools. She can check your spending velocity, forecast cash flow, analyse subscriptions, run custom queries, and create budgets, goals, and expenses on your behalf.",
    highlights: [
      "14 query tools plus a custom SQL-like power query",
      "Spending velocity, cash flow forecast, subscription analysis",
      "Creates budgets, goals, and expense definitions for you",
      "Works in-app and via OpenClaw bot integration",
    ],
    visual: "ai-agent" as const,
    direction: "right" as const,
  },
  {
    icon: Zap,
    iconBg: "bg-pastel-mint-light",
    mascotScene: "penny-searching.png",
    mascotAlt: "Penny and Buck catching raining gold coins with lightning sparkles",
    tagline: "Real-Time Webhook Sync",
    accentColor: "text-pastel-mint-dark",
    title: "Every transaction, instantly",
    description:
      "Up Bank sends a webhook the moment you tap your card. PiggyBack picks it up, matches it to your bills, detects income, and categorises it. No polling, no waiting.",
    highlights: [
      "Cryptographically verified (HMAC-SHA256) webhook events",
      "Auto-matches transactions to bills and income",
      "AI categorises every new transaction as it arrives",
      "Handles created, settled, and deleted events",
    ],
    visual: "webhook" as const,
    direction: "left" as const,
  },
  {
    icon: Brain,
    iconBg: "bg-accent-purple-light",
    mascotScene: "mascot-scene-categorization.png",
    mascotAlt: "Professor Penny with glasses examining coins sorted into color-coded piles while Buck watches impressed",
    tagline: "Smart Categorization",
    accentColor: "text-pastel-purple-dark",
    title: "Up Bank gets categories wrong. We fix them.",
    description:
      "A two-pass system recategorises transactions as they arrive. First it checks a cache of 340+ known merchants (instant, free). If there\u2019s no match, AI handles it.",
    highlights: [
      "340+ merchant cache for instant, free lookups",
      "AI fallback with confidence scoring",
      "Create your own category mappings with emoji icons",
      "Batch recategorise historical transactions",
    ],
    visual: "categorization" as const,
    direction: "right" as const,
  },
  {
    icon: HeartHandshake,
    iconBg: "bg-pastel-coral-light",
    mascotScene: "mascot-scene-splitting.png",
    mascotAlt: "Penny and Buck holding a gold coin together with hearts floating above",
    tagline: "Partner Expense Splitting",
    accentColor: "text-pastel-coral-dark",
    title: "Split expenses by income, not just 50/50",
    description:
      "If one of you earns more, you can split shared expenses proportionally. Override the split on any category or individual transaction. Each person gets their own budget view.",
    highlights: [
      "Preset splits: 50/50, 60/40, 70/30, 80/20, or custom",
      "Override at the category or transaction level",
      "Two independent budget views with separate assignments",
      "AI analysis shows who\u2019s paying what vs income share",
    ],
    visual: "couples" as const,
    direction: "left" as const,
  },
  {
    icon: Receipt,
    iconBg: "bg-pastel-yellow-light",
    mascotScene: "mascot-scene-bills.png",
    mascotAlt: "Detective Buck in a deerstalker hat with magnifying glass while Penny peeks over his shoulder",
    tagline: "Smart Bill Detection",
    accentColor: "text-pastel-yellow-dark",
    title: "AI finds your recurring expenses",
    description:
      "PiggyBack scans 6 months of transactions to find recurring payments. It scores them on pattern, amount, and timing, then links each bill directly to the transaction that paid it.",
    highlights: [
      "Scores by pattern, amount, and timing to find recurring bills",
      "Status tracking: Overdue, Due Today, Due Soon, Paid",
      "Links each bill to its actual Up Bank transaction",
      "Handles small amount variations and timing shifts",
    ],
    visual: "bills" as const,
    direction: "right" as const,
  },
];

const VISUAL_MAP: Record<string, React.ReactNode> = {
  webhook: (
    <BrowserMockup url="piggyback.app/home">
      <WebhookSyncPreview />
    </BrowserMockup>
  ),
  categorization: (
    <BrowserMockup url="piggyback.app/activity">
      <CategorizationPreview />
    </BrowserMockup>
  ),
  budget: (
    <BrowserMockup url="piggyback.app/budget">
      <BudgetPreview />
    </BrowserMockup>
  ),
  bills: (
    <BrowserMockup url="piggyback.app/plan">
      <BillsPreview />
    </BrowserMockup>
  ),
  couples: (
    <BrowserMockup url="piggyback.app/budget">
      <CouplesPreview />
    </BrowserMockup>
  ),
  "ai-agent": (
    <BrowserMockup url="piggyback.app/home">
      <AIAgentPreview />
    </BrowserMockup>
  ),
};

// ============================================================================
// Main Client Component
// ============================================================================

interface LandingClientProps {
  feature: string;
}

export function LandingClient({ feature }: LandingClientProps) {
  if (feature === "hero") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="relative"
      >
        <div className="absolute inset-0 bg-brand-coral/10 rounded-[2rem] blur-3xl scale-90" />
        <div className="relative">
          <BrowserMockup url="piggyback.app/home">
            <DashboardOverviewPreview />
          </BrowserMockup>
        </div>
      </motion.div>
    );
  }

  if (feature === "features") {
    return (
      <div id="features">
        {FEATURES.map((f) => (
          <FeatureSection
            key={f.tagline}
            icon={f.icon}
            iconBg={f.iconBg}
            mascotScene={f.mascotScene}
            mascotAlt={f.mascotAlt}
            tagline={f.tagline}
            accentColor={f.accentColor}
            title={f.title}
            description={f.description}
            highlights={f.highlights}
            visual={VISUAL_MAP[f.visual]}
            direction={f.direction}
          />
        ))}
      </div>
    );
  }

  if (feature === "bento") {
    return <BentoGrid />;
  }

  if (feature === "how-it-works") {
    return (
      <div className="grid md:grid-cols-3 gap-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.4 }}
          className="text-center"
        >
          <div className="w-16 h-16 bg-brand-coral-light rounded-full flex items-center justify-center mx-auto mb-5">
            <TerminalIcon className="w-7 h-7 text-white" />
          </div>
          <h3 className="font-[family-name:var(--font-nunito)] text-lg font-bold text-text-primary mb-3">
            1. Fork &amp; Clone
          </h3>
          <Terminal
            lines={[
              "$ git clone <your-fork>",
              "$ cd PiggyBack",
              "$ cp .env.local.example .env.local",
            ]}
            title="terminal"
            className="mb-3 max-w-xs mx-auto"
          />
          <p className="font-[family-name:var(--font-dm-sans)] text-text-secondary text-sm">
            Fork the repo and configure environment variables
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="text-center"
        >
          <div className="w-16 h-16 bg-brand-coral rounded-full flex items-center justify-center mx-auto mb-5">
            <Database className="w-7 h-7 text-white" />
          </div>
          <h3 className="font-[family-name:var(--font-nunito)] text-lg font-bold text-text-primary mb-3">
            2. Set Up Supabase
          </h3>
          <Terminal
            lines={[
              "# Create project at supabase.com",
              "# Run migrations in SQL Editor",
              "# Copy URL + anon key to .env.local",
            ]}
            title="terminal"
            className="mb-3 max-w-xs mx-auto"
          />
          <p className="font-[family-name:var(--font-dm-sans)] text-text-secondary text-sm">
            Create a Supabase project and run the SQL migrations
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="text-center"
        >
          <div className="w-16 h-16 bg-brand-coral rounded-full flex items-center justify-center mx-auto mb-5">
            <Rocket className="w-7 h-7 text-white" />
          </div>
          <h3 className="font-[family-name:var(--font-nunito)] text-lg font-bold text-text-primary mb-3">
            3. Deploy to Vercel
          </h3>
          <Terminal
            lines={[
              "# Import repo on vercel.com",
              "# Add environment variables",
              "# Deploy — done!",
            ]}
            title="terminal"
            className="mb-3 max-w-xs mx-auto"
          />
          <p className="font-[family-name:var(--font-dm-sans)] text-text-secondary text-sm">
            Import your fork on Vercel and deploy
          </p>
        </motion.div>
      </div>
    );
  }

  return null;
}
