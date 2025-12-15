import Link from "next/link";
import {
  Cloud,
  Server,
  Webhook,
  Users,
  PieChart,
  Target,
  RefreshCw,
  TrendingUp,
  Eye,
  Sliders,
  Flame,
  Sparkles,
  BarChart3,
  Palette,
  ArrowRight,
} from "lucide-react";

export const metadata = {
  title: "Documentation - PiggyBack",
  description:
    "Everything you need to deploy, configure, and contribute to PiggyBack — your personal finance autopilot for Up Bank.",
};

const quickStartCards = [
  {
    title: "Cloud Hosting",
    description:
      "Deploy to Vercel + Supabase in 15 minutes. Free tier, zero maintenance.",
    href: "/docs/deploy-cloud",
    icon: Cloud,
  },
  {
    title: "Local Hosting",
    description:
      "Run on your own machine or VPS with Docker. Full data sovereignty.",
    href: "/docs/deploy-local",
    icon: Server,
  },
];

const features = [
  {
    title: "Up Bank Sync",
    description: "Auto-import accounts, transactions, categories via webhooks",
    icon: Webhook,
  },
  {
    title: "Couples Partnership",
    description: "Shared finances with income-weighted expense splitting",
    icon: Users,
  },
  {
    title: "Zero-Based Budgeting",
    description: "Category budgets with real-time spending tracking",
    icon: PieChart,
  },
  {
    title: "Savings Goals",
    description: "Visual progress linked to Up Bank saver accounts",
    icon: Target,
  },
  {
    title: "Recurring Expenses",
    description: "Auto-detection of subscriptions and bills",
    icon: RefreshCw,
  },
  {
    title: "Investment Portfolio",
    description: "Stocks, ETFs, crypto, property with live prices",
    icon: TrendingUp,
  },
  {
    title: "Watchlist",
    description: "Track investments you don't own yet",
    icon: Eye,
  },
  {
    title: "Target Allocations",
    description:
      "Portfolio allocation targets with rebalancing recommendations",
    icon: Sliders,
  },
  {
    title: "FIRE Planning",
    description:
      "Australian two-bucket calculator with lean/regular/fat/coast variants",
    icon: Flame,
  },
  {
    title: "AI Assistant",
    description:
      "Chat-based insights powered by Google, OpenAI, or Anthropic",
    icon: Sparkles,
  },
  {
    title: "Net Worth Tracking",
    description: "Real-time snapshots with historical charts",
    icon: BarChart3,
  },
  {
    title: "Customizable UI",
    description: "Multiple themes, accent colors, and layout configurations",
    icon: Palette,
  },
];

const techStack = [
  { layer: "Framework", technology: "Next.js 16 (App Router, Turbopack)" },
  { layer: "UI", technology: "React 19, Tailwind CSS 4, shadcn/ui" },
  {
    layer: "Database",
    technology: "Supabase (PostgreSQL with Row Level Security)",
  },
  { layer: "Banking API", technology: "Up Bank API" },
  {
    layer: "Price APIs",
    technology: "Yahoo Finance (stocks/ETFs), CoinGecko (crypto)",
  },
  {
    layer: "AI",
    technology: "Vercel AI SDK with multi-provider support",
  },
  {
    layer: "Testing",
    technology: "Vitest (722+ tests across 43 test files)",
  },
  { layer: "Charts", technology: "Recharts" },
  { layer: "Animations", technology: "Framer Motion" },
  { layer: "Deployment", technology: "Vercel" },
];

export default function DocsOverviewPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "3.5rem" }}>
      {/* ── Hero ── */}
      <section>
        <h1 className="font-[family-name:var(--font-nunito)] text-3xl font-extrabold text-text-primary mb-3">
          Documentation
        </h1>
        <p className="font-[family-name:var(--font-dm-sans)] text-text-secondary text-lg leading-relaxed max-w-2xl">
          Everything you need to deploy, configure, and contribute to PiggyBack
          — your personal finance autopilot for Up Bank.
        </p>
      </section>

      {/* ── Quick Start Cards ── */}
      <section>
        <h2 className="font-[family-name:var(--font-nunito)] text-xl font-bold text-text-primary mb-4">
          Quick Start
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {quickStartCards.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="group bg-surface-elevated border border-border-light rounded-xl p-6 hover:border-brand-coral/40 hover:shadow-lg transition-all duration-200"
            >
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-brand-coral/10 flex items-center justify-center shrink-0">
                  <card.icon className="w-5 h-5 text-brand-coral" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-[family-name:var(--font-nunito)] font-bold text-text-primary">
                      {card.title}
                    </span>
                    <ArrowRight className="w-4 h-4 text-text-tertiary group-hover:text-brand-coral group-hover:translate-x-0.5 transition-all duration-200" />
                  </div>
                  <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary leading-relaxed">
                    {card.description}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Features Grid ── */}
      <section>
        <h2 className="font-[family-name:var(--font-nunito)] text-xl font-bold text-text-primary mb-4">
          Features
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="bg-surface-elevated border border-border-light rounded-xl p-5"
            >
              <div className="w-9 h-9 rounded-lg bg-brand-coral/10 flex items-center justify-center mb-3">
                <feature.icon className="w-[18px] h-[18px] text-brand-coral" />
              </div>
              <h3 className="font-[family-name:var(--font-nunito)] font-bold text-text-primary text-sm mb-1">
                {feature.title}
              </h3>
              <p className="font-[family-name:var(--font-dm-sans)] text-text-secondary text-sm leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Tech Stack ── */}
      <section>
        <h2 className="font-[family-name:var(--font-nunito)] text-xl font-bold text-text-primary mb-4">
          Tech Stack
        </h2>
        <div className="bg-surface-elevated border border-border-light rounded-xl overflow-hidden">
          <table className="w-full font-[family-name:var(--font-dm-sans)] text-sm">
            <thead>
              <tr className="border-b border-border-medium">
                <th className="text-left px-5 py-3 font-[family-name:var(--font-nunito)] font-bold text-text-primary">
                  Layer
                </th>
                <th className="text-left px-5 py-3 font-[family-name:var(--font-nunito)] font-bold text-text-primary">
                  Technology
                </th>
              </tr>
            </thead>
            <tbody>
              {techStack.map((row, i) => (
                <tr
                  key={row.layer}
                  className={`border-b border-border-light last:border-b-0 ${
                    i % 2 === 1 ? "bg-surface-secondary/50" : ""
                  }`}
                >
                  <td className="px-5 py-3 text-text-secondary font-medium whitespace-nowrap">
                    {row.layer}
                  </td>
                  <td className="px-5 py-3 text-text-primary">
                    {row.technology}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
