# Architecture Overview

PiggyBack is a self-hosted personal finance application for couples, built on Next.js and Supabase. It syncs with UP Bank (an Australian neobank) for real-time transaction data and provides budgeting, savings goals, investment tracking, and AI-powered financial insights.

---

## App Architecture

- **Framework**: Next.js 16 with App Router
- **UI Library**: React 19, Server Components by default, Client Components where interactivity is required
- **Styling**: Tailwind CSS 4 with custom design tokens (mint theme, brand-coral accent, and additional theme variants)
- **Component Library**: shadcn/ui for base UI components (built on Radix UI primitives)
- **Fonts**:
  - Root layout: Geist Sans (`--font-geist-sans`) and Geist Mono (`--font-geist-mono`)
  - App layout: Nunito (`--font-nunito`, weights 600/700/800) for headings, DM Sans (`--font-dm-sans`, weights 400/500) for body text
- **Route Groups**: `(auth)`, `(app)`, `(onboarding)`, plus public routes at the root level

---

## Route Structure

### Public Routes

| Path | Description |
|------|-------------|
| `/` | Landing page |
| `/about` | About page |
| `/features` | Feature showcase |
| `/privacy` | Privacy policy |
| `/terms` | Terms of service |
| `/deploy` | Self-hosting deployment guide |

### Auth Group `(auth)`

| Path | Description |
|------|-------------|
| `/login` | Email/password login |
| `/signup` | Account registration |
| `/forgot-password` | Password reset request |
| `/update-password` | Set new password (from email link) |

### Auth API Routes

| Path | Description |
|------|-------------|
| `/auth/callback` | OAuth callback handler |
| `/auth/confirm` | Email confirmation handler |
| `/auth/forgot-password` | Password reset (server-side handler, separate from the (auth) group page) |
| `/auth/signout` | Sign out handler |
| `/auth/auth-code-error` | Auth code error display page |

### App Group `(app)`

| Path | Description |
|------|-------------|
| `/home` | Dashboard with account balances, spending overview, upcoming bills, goals |
| `/activity` | Transaction feed with search and filters |
| `/activity/[category]` | Transactions filtered by category |
| `/activity/[category]/[subcategory]` | Transactions filtered by subcategory |
| `/activity/income` | Income transactions view |
| `/activity/merchant/[merchant]` | Transactions for a specific merchant |
| `/analysis` | Budget analysis dashboard (spending breakdowns, trends) |
| `/budget` | Budget dashboard (zero-based budgeting) |
| `/budget/create` | Create a new budget |
| `/budget/[category]` | Category-level budget detail |
| `/budget/[category]/[subcategory]` | Subcategory-level budget detail |
| `/goals` | Savings goals dashboard (3-column layout with savings chart, active/completed goals, sidebar with health, budget allocations, FIRE link) |
| `/goals/new` | Create a new savings goal |
| `/goals/[id]` | Goal detail view (contribution chart, activity log, projections with W/F/M suggested savings, quick actions) |
| `/goals/[id]/edit` | Edit an existing goal |
| `/invest` | Investment portfolio tracker |
| `/invest/add` | Add a new investment |
| `/invest/[id]` | Investment detail view |
| `/invest/[id]/edit` | Edit an investment |
| `/notifications` | In-app notification centre |
| `/plan` | Financial planning view |
| `/settings` | Settings hub |
| `/settings/profile` | User profile settings |
| `/settings/appearance` | Theme and appearance settings |
| `/settings/security` | Password and security settings |
| `/settings/notifications` | Notification preferences |
| `/settings/income` | Income source configuration |
| `/settings/partner` | Partnership/couple settings |
| `/settings/up-connection` | UP Bank API connection management |
| `/settings/ai` | AI assistant provider and API key configuration |
| `/settings/fire` | FIRE (Financial Independence) profile settings |

### Onboarding Group `(onboarding)`

| Path | Description |
|------|-------------|
| `/onboarding` | Multi-step onboarding wizard |

### Dev Routes (development only)

| Path | Description |
|------|-------------|
| `/dev/accent-picker` | Theme accent color picker |
| `/dev/components` | Component showcase / playground |

### API Routes

The application exposes 30+ API routes under `/api/`:

**AI**
- `/api/ai/chat` - Streaming AI chat with financial tools
- `/api/ai/context` - Build financial context for AI assistant
- `/api/ai/settings` - AI provider configuration

**Budget**
- `/api/budget/available-transactions` - Available transactions for budget matching
- `/api/budget/columns` - Budget column settings
- `/api/budget/expenses` - CRUD for recurring expense definitions
- `/api/budget/expenses/[id]` - Individual expense operations
- `/api/budget/expenses/auto-detect` - Auto-detect recurring expenses
- `/api/budget/expenses/match` - Match transactions to expenses
- `/api/budget/historical-spending` - Historical spending data
- `/api/budget/layout` - Budget layout configuration
- `/api/budget/methodology` - Budget methodology settings
- `/api/budget/methodology/customize` - Custom methodology configuration
- `/api/budget/reset` - Reset budget
- `/api/budget/row-transactions` - Transactions for budget rows
- `/api/budget/shares/categories` - Category sharing between partners
- `/api/budget/splits` - Partner split configuration
- `/api/budget/summary` - Budget summary (single endpoint replaces many parallel queries)
- `/api/budget/templates` - Budget templates
- `/api/budget/transaction-overrides` - Transaction-level budget overrides
- `/api/budget/zero/assign` - Zero-based budget assignments

**Transactions**
- `/api/transactions` - Transaction listing
- `/api/transactions/[id]/recategorize` - Recategorize a transaction
- `/api/transactions/tags` - Transaction tags

**Expenses**
- `/api/expenses/backfill-all` - Backfill expense matches
- `/api/expenses/recalculate-periods` - Recalculate expense periods
- `/api/expenses/rematch-all` - Rematch all transactions to expenses

**Notifications**
- `/api/notifications` - List/manage notifications
- `/api/notifications/[id]/action` - Execute notification actions

**Cron**
- `/api/cron/notifications` - Scheduled notification generation

**Settings**
- `/api/settings/income-config` - Income configuration settings

**Export**
- `/api/export/transactions` - Export transactions (CSV)

**UP Bank**
- `/api/upbank/webhook` - Webhook endpoint for real-time transaction events

**Debug**
- `/api/debug/expenses` - Debug expense matching

---

## Authentication and Authorization

### Supabase Auth with SSR

Authentication is handled by Supabase Auth via the `@supabase/ssr` package, which manages auth tokens in HTTP-only cookies for secure server-side rendering.

### Middleware (`src/utils/supabase/middleware.ts`)

The middleware runs on every request and handles:

1. **Cookie management**: Creates a Supabase client that reads/writes auth cookies on the request/response.
2. **Session refresh**: Calls `supabase.auth.getUser()` on every request to refresh the auth token before it expires.
3. **Demo mode handling**:
   - Auto-signs in with demo credentials when no session exists (using `DEMO_USER_EMAIL` / `DEMO_USER_PASSWORD`).
   - Blocks all non-GET API requests with a 200 response containing `{ demo: true }`, preventing any data mutations.
4. **Route protection**: Redirects unauthenticated users to `/login` when accessing protected paths.
5. **Login redirect**: Redirects authenticated users from `/login` or `/signup` to `/home`. When `NEXT_PUBLIC_SKIP_LANDING` is `"true"`, also redirects authenticated users from `/` to `/home`.
6. **Onboarding enforcement**: Checks `profiles.has_onboarded` and redirects to `/onboarding` if `false` (skipped in demo mode).

### Protected Paths

The following path prefixes require authentication:
- `/home`
- `/settings`
- `/goals`
- `/plan`
- `/activity`
- `/budget`
- `/invest`
- `/onboarding`

---

## Supabase Clients

The application uses four distinct Supabase client types, each suited to a different execution context:

### 1. Browser Client (`src/utils/supabase/client.ts`)

- Created with `createBrowserClient()` from `@supabase/ssr`
- Used in Client Components (hooks, event handlers, real-time subscriptions)
- Automatically reads auth cookies from the browser
- Respects Row Level Security (RLS) policies

### 2. Server Client (`src/utils/supabase/server.ts`)

- Created with `createServerClient()` from `@supabase/ssr`
- Used in Server Components, Server Actions, and Route Handlers
- Reads auth cookies via `next/headers` (`cookies()`)
- Respects RLS policies (queries run as the authenticated user)

### 3. Service Role Client (`src/utils/supabase/service-role.ts`)

- Created with `createClient()` from `@supabase/supabase-js` using `SUPABASE_SERVICE_ROLE_KEY`
- Bypasses RLS entirely -- used for operations without user context
- Use cases: webhook handlers (UP Bank events arrive without a user session), admin operations
- Singleton pattern: client is cached and reused across requests
- Auth settings: `autoRefreshToken: false`, `persistSession: false`

### 4. Middleware Client

- Created inline within the middleware function using `createServerClient()`
- Uses request/response cookie manipulation (not `next/headers`)
- Used exclusively for session refresh and route protection logic

---

## Partnership Model (Couples)

PiggyBack is designed for couples who share finances. The partnership model works as follows:

### Data Model

- **`partnerships`**: A partnership record is created for every user on signup (via the `handle_new_profile()` database trigger). Initially, each user is in their own solo partnership.
- **`partnership_members`**: Junction table linking users to partnerships. A user can only be in one partnership at a time.
- **`partner_link_requests`**: Manages the partner linking flow (pending, accepted, declined).

### Partner Detection & Linking

1. **Automatic detection**: When both partners have synced their UP Bank accounts, the system detects shared JOINT (2Up) accounts by matching `up_account_id` across different users.
2. **Link request**: A `partner_link_request` is created with the shared account as reference.
3. **Acceptance**: The target user accepts the request, triggering `merge_partnerships()` RPC which atomically:
   - Moves the joining user to the primary partnership (earlier `created_at` wins)
   - Migrates all data (expense_definitions, budget_assignments, etc.) to the primary partnership
   - Deletes the now-empty joining partnership
4. **Decline**: The request is marked as declined.

### Partnership-Scoped Data

Most financial data is scoped to partnerships, not individual users:
- `expense_definitions`, `expense_matches` - Shared recurring expenses
- `budget_assignments`, `budget_months` - Shared budget
- `goals`, `goal_contributions` - Shared savings goals and contribution history
- `net_worth_snapshots` - Combined net worth history

Individual data (scoped to user):
- `accounts`, `transactions` - Each user's bank data
- `up_api_configs` - Each user's UP Bank API token
- `profiles` - Individual user settings

### Budget Views

Partners can view budgets in two modes:
- **Individual ("My Budget")**: Shows only the user's share of shared expenses, based on split percentages
- **Shared ("Our Budget")**: Shows the full combined view of all shared expenses

### Joint Account Deduplication

When both partners sync the same 2Up JOINT account, each has their own copy in the `accounts` table. The `getEffectiveAccountIds()` function deduplicates these for budget calculations by matching `up_account_id` and selecting one copy, preventing double-counting.

### Key Files
- `src/app/actions/partner.ts` - Partner detection, link request CRUD
- `src/lib/get-user-partnership.ts` - Partnership ID lookup
- `src/lib/get-effective-account-ids.ts` - Joint account deduplication
- `src/lib/apply-split.ts` - Split calculation (expense → category → default → 50/50)
- `src/lib/shared-budget-calculations.ts` - Individual vs shared budget views

---

## State Management

PiggyBack uses no global state library. Data flows through React Server Components and targeted context providers:

- **Server Components**: Fetch data directly from Supabase and pass it as props to Client Components. This is the primary data-fetching pattern.
- **ThemeProvider** (React Context): Manages the active theme/accent color (e.g., mint, coral, lavender). Initialized from `profiles.theme_preference`.
- **TourProvider** (React Context): Manages the onboarding tour state (whether the user has completed the guided tour). Initialized from `profiles.tour_completed`.
- **ConnectionStatusProvider** (React Context): Tracks feature gate flags (has accounts, has goals, has completed goals, has payday, FIRE onboarded, has investments, has net worth data). Used by navigation and feature gates to conditionally show/hide UI elements.
- **Component-level state**: Individual Client Components use React hooks (`useState`, `useEffect`, `useMemo`, `useCallback`) for local interactivity (form state, modals, chart interactions, drag-and-drop).
- **Server Actions**: Mutations (creating goals, updating budgets, syncing data) are handled by Next.js Server Actions defined in `src/app/actions/`, which call Supabase and use `revalidatePath()` to refresh server-rendered data.

---

## Environment Variables

### Public (browser-accessible, prefixed with `NEXT_PUBLIC_`)

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (e.g., `https://xxx.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous/public key for RLS-protected queries |
| `NEXT_PUBLIC_APP_URL` | Application URL used for auth redirects and links |
| `NEXT_PUBLIC_DEMO_MODE` | Enable demo mode (`"true"` or `"false"`). Blocks mutations and auto-signs in with demo credentials. |
| `NEXT_PUBLIC_SKIP_LANDING` | Skip the landing page (`"true"` or `"false"`). When enabled, authenticated users are redirected from `/` to `/home`. |

### Private (server-only)

| Variable | Description |
|----------|-------------|
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key for admin database access (bypasses RLS) |
| `DEMO_USER_EMAIL` | Email for demo mode auto-login |
| `DEMO_USER_PASSWORD` | Password for demo mode auto-login |
| `WEBHOOK_BASE_URL` | Base URL for registering UP Bank webhook endpoints |
| `UP_API_ENCRYPTION_KEY` | 64-character hex string (32 bytes) for AES-256-GCM encryption of UP Bank API tokens |
| `DEBUG_SECRET` | Shared secret for authenticating debug endpoint requests (development only) |

### Build/Runtime

| Variable | Description |
|----------|-------------|
| `NODE_ENV` | `development` or `production` |
| `VERCEL_URL` | Auto-set by Vercel with the deployment URL |

---

## Data Flow: Transaction Lifecycle

1. **Token provision**: User provides their UP Bank personal access token during onboarding.
2. **Encrypted storage**: Token is stored in the `up_api_configs` table (associated with the user).
3. **Initial sync**: `createUpApiClient()` creates an API client. The sync process fetches all accounts, categories, and up to 1 year of transaction history (paginated) from the UP Bank API. Data is upserted into `accounts`, `categories`, and `transactions` tables.
4. **Webhook registration**: A webhook is registered with UP Bank pointing to `/api/upbank/webhook`. The webhook secret is stored in `up_api_configs` for signature verification.
5. **Real-time events**: UP Bank sends POST requests on transaction events. The webhook handler verifies the HMAC-SHA256 signature using timing-safe comparison, then processes the event:
   - `TRANSACTION_CREATED`: Fetch full transaction details from UP API, upsert into `transactions`, update account balances.
   - `TRANSACTION_SETTLED`: Same as created -- upsert updates the existing record.
   - `TRANSACTION_DELETED`: Logged (soft-delete).
   - `PING`: Acknowledged with 200.
6. **Post-processing** (after upsert):
   - **Category inference**: `inferCategoryId()` applies rule-based categorization. If no category is determined and the transaction is categorizable, `aiCategorizeTransaction()` runs asynchronously (fire-and-forget).
   - **Expense matching**: `matchSingleTransactionToExpenses()` matches negative-amount transactions to recurring expense definitions.
   - **Income matching**: `matchSingleTransactionToIncomeSources()` matches positive-amount transactions to configured income sources.
   - **Balance updates**: Account balances are refreshed from the UP API for affected accounts (including transfer accounts).
7. **Budget consumption**: Budget pages query live transaction data via Server Components and compute period totals, category spending, and expense projections client-side.

---

## Component Architecture

### Root Layout (`src/app/layout.tsx`)

Minimal wrapper: loads Geist Sans/Mono fonts, sets metadata (title, description, OpenGraph, Twitter cards), renders `{children}`, and includes Vercel Analytics (`<Analytics />`) and Speed Insights (`<SpeedInsights />`).

### App Layout (`src/app/(app)/layout.tsx`)

Full application shell for authenticated routes:

1. **Auth check**: Fetches user via `supabase.auth.getUser()`. Redirects to `/login` if unauthenticated.
2. **Profile fetch**: Loads user profile from `profiles` table for display name, avatar, theme preference, and tour state.
3. **Providers**: Wraps children in `ThemeProvider` (initialized from `profile.theme_preference`), `TourProvider` (initialized from `profile.tour_completed`), and `ConnectionStatusProvider` (initialized from feature gate queries: account count, goals, income, investments, net worth snapshots).
4. **Layout structure**:
   - `DemoBanner` -- shown when `NEXT_PUBLIC_DEMO_MODE === "true"`
   - `Sidebar` -- desktop navigation (hidden on mobile), 256px wide (`md:pl-64` = 16rem)
   - `AppHeader` -- mobile header with hamburger menu
   - `{children}` -- page content
   - `BottomNav` -- mobile bottom tab navigation
   - `PiggyChatWrapper` -- floating AI chat assistant
   - `Toaster` -- global toast notifications (Goey Toast)

### Page Pattern

Pages follow a consistent Server Component -> Client Component pattern:

- **Server Component** (the `page.tsx` file): Creates a Supabase client, fetches required data (transactions, expenses, goals, accounts, etc.), and passes it as props to a Client Component.
- **Client Component** (the `-client.tsx` file): Receives data as props and handles all interactivity -- forms, charts, modals, drag-and-drop, state transitions, and server action invocations.

This pattern ensures data fetching happens on the server (no client-side waterfalls) while keeping interactive UI fully client-rendered.
