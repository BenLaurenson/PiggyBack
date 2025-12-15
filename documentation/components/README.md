# Component Architecture

## Overview
PiggyBack uses 125 React components organized by 18 feature domains. Components follow Next.js App Router patterns: Server Components for data fetching, Client Components for interactivity.

## Directory Structure

### Root (`src/components/`)
- `theme-provider.tsx` - Client-side theme loader (mint/light/dark/ocean), reads from localStorage

### Navigation (`src/components/navigation/`)
- `sidebar.tsx` - Desktop sidebar (64px width, fixed left)
- `bottom-nav.tsx` - Mobile bottom navigation bar
- `app-header.tsx` - Mobile top header with hamburger menu
- `user-profile-menu.tsx` - User avatar dropdown with settings/logout
- `more-menu.tsx` - Overflow menu for additional navigation items
- `theme-toggle.tsx` - Quick theme toggle component
- `index.ts` - Barrel export

### UI (`src/components/ui/`)
29 shadcn/ui and custom components: alert-dialog, avatar, badge, button, card, checkbox, collapsible, dialog, drawer, dropdown-menu, empty-state, empty-state-skeleton, error-display, input, label, multi-select, number-ticker, popover, progress, scroll-area, select, separator, sheet, skeleton, slider, sonner (toast), switch, tabs, textarea

### Activity (`src/components/activity/`)
Transaction browsing and management:
- `activity-client.tsx` - Main transaction list with infinite scroll
- `transaction-card.tsx` - Individual transaction display
- `transaction-detail-modal.tsx` - Full transaction details
- `enhanced-filters.tsx` - Advanced filtering (date, amount, category, account)
- `swipeable-card.tsx` - Mobile swipe actions
- `income-history-client.tsx` - Income transaction history
- `merchant-history-client.tsx` - Per-merchant transaction list
- `vendor-chart.tsx` - Merchant spending visualization
- `transaction-skeleton.tsx` - Loading skeleton placeholder for transaction cards

### Shared (`src/components/shared/`)
- `export-dialog.tsx` - Reusable export dialog component

### Budget (`src/components/budget/`)
~28 components for budget management:

**Core orchestration:**
- `budget-page-shell.tsx` - Main budget page shell (orchestrator)
- `unified-budget-table.tsx` - Primary budget table with categories
- `budget-overview-strip.tsx` - Budget overview summary strip
- `budget-overview-tab.tsx` - Budget overview tab content
- `budget-settings-tab.tsx` - Budget settings tab content
- `budget-list-view.tsx` - Budget list/selection view
- `budget-empty-state.tsx` - Empty state when no budget exists

**Budget creation wizard:**
- `budget-create-wizard.tsx` - Multi-step budget creation wizard
- `wizard/wizard-welcome-step.tsx` - Wizard welcome step
- `wizard/wizard-template-step.tsx` - Template selection step
- `wizard/wizard-finetune-step.tsx` - Category fine-tuning step
- `wizard/wizard-prerequisites-step.tsx` - Prerequisites step
- `wizard/wizard-review-step.tsx` - Review and create step

**Budget editing:**
- `budget-edit-dialog.tsx` - Edit budget properties dialog
- `budget-category-layout-editor.tsx` - Category layout editor
- `budget-detail-panel.tsx` - Category detail slide-out
- `category-budget-detail.tsx` - Expanded category detail view
- `simple-category-picker.tsx` - Simplified category selection
- `assignment-distribution-modal.tsx` - Distribute assignments across categories

**Recurring expenses:**
- `budget-expenses-sidebar.tsx` - Recurring expenses sidebar (desktop)
- `budget-expenses-sheet.tsx` - Recurring expenses sheet (mobile)
- `expense-timeline-section.tsx` - Future expense timeline
- `expense-definition-modal.tsx` - Create/edit expense
- `expense-paid-section.tsx` - Paid expenses section
- `expense-cash-flow-summary.tsx` - Cash flow summary for expenses
- `expense-from-transaction.tsx` - Create expense from a matched transaction
- `expected-expense-indicator.tsx` - Visual indicator for expected expenses
- `auto-detect-expenses-dialog.tsx` - Auto-detect recurring expenses from transactions
- `create-expense-dialog.tsx` - Create new expense dialog
- `pay-day-divider.tsx` - Pay-day divider in expense timeline
- `recurring-expenses-card.tsx` - Recurring expenses summary card

**Analysis:**
- `budget-analysis-dashboard.tsx` - Budget analysis dashboard

### Dashboard (`src/components/dashboard/`)
- `dashboard-client.tsx` - Home dashboard with summary cards

### Goals (`src/components/goals/`)
- `goals-client.tsx` - Goals dashboard (savings area chart, active goals table with status badges, sidebar with summary, health overview, budget allocations, FIRE link)
- `goal-detail-client.tsx` - Goal detail page (contribution chart with period filters, activity log, projections with suggested savings, quick actions for add funds / mark complete)
- `goal-actions-menu.tsx` - Goal CRUD actions (edit, delete, mark complete)

### Investing (`src/components/invest/`)
- `invest-client.tsx` - Investment portfolio list
- `invest-detail-client.tsx` - Individual investment detail
- `invest-edit-client.tsx` - Investment editor form

### Transactions (`src/components/transactions/`)
Shared, reusable transaction display components used across feature domains:
- `transaction-link.tsx` - Displays a linked Up Bank transaction inline (used in expense editing, income editing, goal details)
- `transaction-history.tsx` - Shows matched/paid transaction history for an entity (expenses, income, merchants) with optional "View All" navigation

### AI (`src/components/ai/`)
- `piggy-chat.tsx` - AI chat interface with tool-use display (Piggy assistant)
- `piggy-chat-wrapper.tsx` - Wrapper that fetches financial context and API key status before rendering chat

### Plan/FIRE (`src/components/plan/`)
11 components for FIRE (Financial Independence, Retire Early) planning:
- `plan-client.tsx` - FIRE planning dashboard (main orchestrator)
- `plan-health-ring.tsx` - Financial health indicator ring
- `fire-setup-prompt.tsx` - First-time FIRE profile setup prompt
- `fire-projection-chart.tsx` - Year-by-year net worth projection
- `fire-what-if.tsx` - What-if scenario exploration (savings rate, return, etc.)
- `fire-gameplan.tsx` - FIRE gameplan/strategy display
- `two-bucket-chart.tsx` - Two-bucket strategy visualization (outside super vs. inside super for Australian retirement)
- `goals-timeline.tsx` - Goals timeline visualization
- `financial-health-snapshot.tsx` - Financial health snapshot summary
- `priority-recommendations.tsx` - Prioritized financial recommendations
- `annual-checkup/checkup-wizard.tsx` - Annual financial checkup wizard

### Notifications (`src/components/notifications/`)
- `notification-bell.tsx` - Notification bell icon with unread count badge

### Settings (`src/components/settings/`)
- `ai-settings.tsx` - AI provider/model/key configuration
- `add-income-manual.tsx` - Manual income entry form
- `add-income-oneoff.tsx` - One-off income form
- `income-from-transaction.tsx` - Create income from transaction

### Landing (`src/components/landing/`)
- `landing-client.tsx` - Client-side landing page sections
- `landing-header.tsx` - Landing page header/nav
- `landing-footer.tsx` - Landing page footer
- `app-previews.tsx` - Interactive app preview carousel
- `bento-grid.tsx` - Feature bento grid layout
- `feature-section.tsx` - Feature showcase cards
- `browser-mockup.tsx` - Browser frame component
- `terminal.tsx` - Terminal animation for deploy steps
- `up-bank-logo.tsx` - Up Bank SVG logo (color/muted/white variants)

### Tour (`src/components/tour/`)
- `tour-provider.tsx` - Tour state context provider
- `tour-overlay.tsx` - Full-screen overlay with spotlight
- `tour-tooltip.tsx` - Positioned tooltip with step content
- `tour-trigger.tsx` - Button to start/restart tour
- `tour-steps.ts` - Step definitions (targets, content, positioning)

### Onboarding (`src/components/onboarding/`)
- `onboarding-wizard.tsx` - Multi-step wizard container
- Steps: `welcome-step.tsx`, `profile-step.tsx`, `bank-step.tsx`, `income-step.tsx`, `methodology-step.tsx`, `ai-step.tsx`, `complete-step.tsx`

### Branding (`src/components/branding/`)
- `piggyback-logo.tsx` - SVG logo component

### Demo (`src/components/demo/`)
- `demo-banner.tsx` - Banner shown in demo mode

### Dev Tools (`src/components/dev/`)
- `floating-dev-tools.tsx` - Floating dev panel (dev only)
- `settings-dev-tools.tsx` - Settings debug panel

## Data Flow Pattern
1. **Server Component** (`page.tsx`) fetches data from Supabase via server-side queries
2. Data passed as props to **Client Component** (`*-client.tsx`)
3. Client Component manages local state, UI interactions, and client-side filtering
4. **Mutations** via Server Actions (`src/app/actions/*.ts`) or API route handlers (`src/app/api/*/route.ts`)
5. `revalidatePath()` triggers Server Component re-render with fresh data

### Component Hierarchy Example (Budget)
```
budget/page.tsx (Server Component)
  -> Fetches budgets, expense_definitions, income_sources from Supabase
  -> Passes data as props to:
     budget-page-shell.tsx (Client Component - orchestrator)
       -> budget-list-view.tsx (budget selection)
       -> budget-overview-strip.tsx (summary bar)
       -> unified-budget-table.tsx (main table)
            -> category-budget-detail.tsx (expanded detail)
       -> budget-expenses-sidebar.tsx (desktop) / budget-expenses-sheet.tsx (mobile)
            -> expense-timeline-section.tsx
            -> expense-paid-section.tsx
       -> budget-detail-panel.tsx (slide-out on row click)
```

### Component Hierarchy Example (Activity)
```
activity/page.tsx (Server Component)
  -> Fetches transactions, categories, accounts from Supabase
  -> Passes data as props to:
     activity-client.tsx (Client Component - orchestrator)
       -> enhanced-filters.tsx (filter bar)
       -> transaction-card.tsx (per transaction, repeated)
            -> swipeable-card.tsx (mobile wrapper)
       -> transaction-detail-modal.tsx (on card click)
```

### Component Hierarchy Example (Plan/FIRE)
```
plan/page.tsx (Server Component)
  -> Fetches FIRE profile, net worth snapshots, income/expenses from Supabase
  -> Passes data as props to:
     plan-client.tsx (Client Component - orchestrator)
       -> fire-setup-prompt.tsx (shown if no FIRE profile exists)
       -> plan-health-ring.tsx (financial health score)
       -> financial-health-snapshot.tsx (health overview)
       -> fire-gameplan.tsx (FIRE strategy)
       -> goals-timeline.tsx (goals timeline)
       -> two-bucket-chart.tsx (outside super vs inside super)
       -> fire-projection-chart.tsx (year-by-year projection)
       -> fire-what-if.tsx (scenario exploration)
       -> priority-recommendations.tsx (actionable tips)
       -> annual-checkup/checkup-wizard.tsx (annual review)
```
