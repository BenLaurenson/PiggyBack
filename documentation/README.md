# PiggyBack Documentation

Comprehensive documentation for the PiggyBack personal finance application - a self-hosted finance app for couples built on the UP Bank API.

**Last Updated:** 2026-02-26

---

## What is PiggyBack?

PiggyBack is a self-hosted personal finance application for Australian couples who bank with [UP](https://up.com.au). It syncs transaction data in real-time via the UP Bank API and provides:

- **Zero-based budgeting** with a pure-function budget engine and multiple methodology support (50/30/20, envelope, pay-yourself-first, 80/20)
- **Real-time transaction sync** via webhooks with automatic categorization
- **Recurring expense tracking** with automatic transaction matching
- **Income pattern detection** across weekly, fortnightly, monthly, and bi-monthly frequencies
- **Savings goals** linked to UP saver accounts with contribution tracking
- **Investment portfolio tracking** with Yahoo Finance (stocks/ETFs) and CoinGecko (crypto) price fetching
- **FIRE (Financial Independence, Retire Early) planning** with Australian two-bucket strategy (super + investments)
- **AI-powered financial assistant** with 35 tools and multi-provider support (Google, OpenAI, Anthropic)
- **Partnership model** for couples sharing finances via UP's 2Up joint accounts
- **Notifications system** with webhook-driven net worth snapshots
- **Spending analysis** page with anomaly detection and pattern analysis

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| UI | React 19, Tailwind CSS 4, shadcn/ui |
| Backend | Supabase (Postgres, Auth, RLS) |
| Bank Integration | UP Bank API v1 |
| AI | Vercel AI SDK (multi-provider) |
| Analytics | Vercel Analytics + Speed Insights |
| Testing | Vitest |

---

## Documentation Map

### Architecture
- [Architecture Overview](architecture/overview.md) - App structure, routing, auth, partnership model, state management, environment variables
- [Tech Stack](architecture/tech-stack.md) - Complete technology stack reference
- [Data Flow](architecture/data-flow.md) - Transaction lifecycle, budget calculations, AI chat, FIRE calculations
- [Deployment](architecture/deployment.md) - Two-project Vercel setup (personal + demo), env vars, webhook configuration

### Database
- [Database Schema](database/schema.md) - 40 tables, 76+ indexes, functions, triggers, migration history
- [RLS Policies](database/rls-policies.md) - Row Level Security strategy, 7 access patterns, helper functions, policy patterns

### API Reference
- [API Routes](api-routes/README.md) - All 34 REST API routes organized by domain
- [Server Actions](api-routes/server-actions.md) - All 13 server action files with 48+ exported functions

### Features
- [Budget System](features/budget-system.md) - Zero-based budgeting, methodologies, period support, couple splitting
- [Recurring Expenses](features/recurring-expenses.md) - Expense detection, matching algorithm, timeline generation
- [Income Tracking](features/income-tracking.md) - Income sources, pattern analysis, frequency conversion
- [AI System](features/ai-system.md) - Multi-provider AI chat, 35 financial tools, auto-categorization
- [FIRE System](features/fire-system.md) - Australian FIRE calculator, variants, two-bucket strategy
- [Investment Tracking](features/investment-tracking.md) - Portfolio management, Yahoo Finance + CoinGecko price APIs
- [UP Bank Integration](features/up-bank-integration.md) - API client, webhooks, initial sync, real-time updates
- [Library Reference](features/library-reference.md) - All 45 library files with function signatures

### Components
- [Component Architecture](components/README.md) - 125 React components organized by 18 feature domains

### Settings
- [Settings Pages](settings/README.md) - All 10 settings pages with data models and server actions

### Onboarding
- [Onboarding System](onboarding/README.md) - 7-step wizard, middleware enforcement, guided tour

### UP Bank API Reference
- [UP Bank API Overview](up-bank-api/README.md) - External API documentation
- [Accounts](up-bank-api/accounts.md)
- [Transactions](up-bank-api/transactions.md)
- [Categories](up-bank-api/categories.md)
- [Tags](up-bank-api/tags.md)
- [Webhooks](up-bank-api/webhooks.md)
- [Pagination & Errors](up-bank-api/pagination-and-errors.md)

### Changelog
- [Changelog](../CHANGELOG.md) - Version history following Keep a Changelog format (canonical copy at project root)

---

## Key Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| **Server Components by default** | Data fetching on the server avoids client-side waterfalls; Client Components only where interactivity is needed |
| **Partnership-scoped data** | Budget, expenses, and goals belong to partnerships (not users) to support couples sharing finances |
| **Pure-function budget engine** | `calculateBudgetSummary()` in `budget-engine.ts` is the single source of truth for all budget math; both server and client use it |
| **No global state library** | React Server Components + targeted context providers (Budget, BudgetLayout, BudgetSharing, Category, IncomeConfig, ConnectionStatus) keep state simple |
| **AES-256-GCM token encryption** | UP Bank API tokens encrypted at rest; graceful fallback for legacy plaintext tokens |
| **Webhook + batch matching** | Expenses matched in real-time via webhook and retroactively via batch, both using the same `AMOUNT_TOLERANCE_PERCENT = 10` |
| **RLS everywhere** | Every user-facing table has Row Level Security policies; private schema helpers prevent infinite recursion |

---

## Project Structure

```
src/
  app/
    (app)/          # Authenticated app routes (home, budget, activity, analysis, goals, invest, plan, notifications, settings, dev)
    (auth)/         # Auth routes (login, signup, forgot-password, update-password)
    (onboarding)/   # Onboarding wizard
    actions/        # 13 server action files (48+ functions)
    api/            # 34 REST API routes
  components/       # 125 React components organized by 18 feature domains
  contexts/         # 6 React context providers (budget, budget-layout, budget-sharing, category, income-config, connection-status)
  lib/              # 45 library files (core business logic, budget engine, AI tools)
  hooks/            # Custom React hooks
  types/            # TypeScript type definitions
  utils/
    supabase/       # 4 Supabase client variants (browser, server, service-role, middleware)
supabase/
  migrations/       # Single consolidated initial schema migration
documentation/      # This documentation directory
```

---

## Quick Stats

| Metric | Count |
|--------|-------|
| App Routes (pages) | 38 (33 app + 4 auth + 1 onboarding) |
| API Routes | 34 |
| Server Actions | 13 files, 48+ functions |
| React Components | 125 across 18 domains |
| Library Files | 45 |
| Database Tables | 40 |
| Database Migrations | 1 (consolidated) |
| RLS-Protected Tables | 30+ |
| Test Files | 50 (1090+ tests) |
| AI Tools | 35 |
