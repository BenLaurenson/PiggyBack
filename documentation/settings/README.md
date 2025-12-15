# PiggyBack Settings System

## Overview

The Settings system is the central hub for user configuration in PiggyBack. It is implemented as a Next.js App Router page group at `/settings` with individual sub-pages for each settings domain. The main settings page (`/settings`) is a **server component** that fetches profile, UP Bank config, and partnership data at render time to display contextual status summaries. All sub-pages are **client components** (`"use client"`) that manage their own state and data loading.

**Route prefix:** `/app/(app)/settings/`

### Layout

All settings pages use a centered, max-width constrained layout:
- Outer wrapper: `p-4 md:p-6 lg:p-8 max-w-4xl mx-auto` -- responsive padding with 896px max-width, horizontally centered
- Cards and inner elements have no individual max-width constraints -- they fill the full width of the centered container
- Loading state skeletons use the same `max-w-4xl mx-auto` wrapper to prevent layout shift when content loads
- No shared `settings/layout.tsx` -- each page applies the layout independently
- Font variables (`--font-nunito` for headings, `--font-dm-sans` for body) are set on the outer wrapper

---

## Settings Page Structure and Navigation

### Main Settings Hub (`/settings`)

**File:** `src/app/(app)/settings/page.tsx`

The main settings page is a server component that renders a grouped navigation list. It fetches three pieces of data server-side to display contextual descriptions:

1. **User profile** from `profiles` table (display name, avatar, role)
2. **UP API config** from `up_api_configs` table (connection status, last sync time)
3. **Partnership membership** from `partnership_members` joined with `partnerships` (role, partnership name, partner count)

#### Navigation Groups

| Group | Section | Route | Icon | Description |
|-------|---------|-------|------|-------------|
| **Account** | Profile | `/settings/profile` | `User` | Manage account details |
| **Account** | Partner | `/settings/partner` | `Users` | Invite or manage partner |
| **Connections & API Keys** | UP Bank Connection | `/settings/up-connection` | `CreditCard` | Bank account sync |
| **Connections & API Keys** | AI Assistant | `/settings/ai` | `Sparkles` | AI provider and API keys |
| **Finances** | Income Settings | `/settings/income` | `DollarSign` | Income and payment schedule |
| **Preferences** | Appearance | `/settings/appearance` | `Palette` | Theme and display |
| **Preferences** | Notifications | `/settings/notifications` | `Bell` | Notification preferences |
| **Security** | Privacy & Security | `/settings/security` | `Shield` | Password and account deletion |

#### Additional Items (Outside Groups)

- **Replay Guided Tour** -- Links to `/home?tour=start` to restart the onboarding tour.

#### Profile Card

At the top of the settings page, a profile card displays:
- Avatar (with fallback to first character of display name or email)
- Display name (or "Set up your profile" if not set)
- Email address
- Partnership role badge (e.g., "owner")
- Partnership name (if in a partnership)

#### Footer

The settings page footer shows the app version (`PiggyBack v1.0.0`) and links to Privacy Policy and Terms of Service.

---

## Profile Settings

**Route:** `/settings/profile`
**File:** `src/app/(app)/settings/profile/page.tsx`
**Type:** Client component

### What It Configures

User identity information displayed across the app.

### Fields

| Field | Type | Required | Editable | Notes |
|-------|------|----------|----------|-------|
| Avatar | URL input | No | Yes | Enter an image URL; displayed as `Avatar` component |
| Display Name | Text input | Yes | Yes | Used throughout the app for greetings, partner display, etc. |
| Email | Email input | -- | No | Read-only; displayed from `supabase.auth.getUser()` |

### Data Model

**Table:** `profiles`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Matches the Supabase auth user ID |
| `display_name` | text | User's chosen display name |
| `avatar_url` | text (nullable) | URL to avatar image |

### Data Flow

- **Load:** Reads from `profiles` table directly via Supabase client
- **Save:** Updates `profiles` table directly via Supabase client (`supabase.from("profiles").update(...)`)
- **No server action used** -- operates entirely through the Supabase client-side SDK

---

## UP Bank Connection Settings

**Route:** `/settings/up-connection`
**File:** `src/app/(app)/settings/up-connection/page.tsx`
**Type:** Client component

### What It Configures

The connection between PiggyBack and the user's UP Bank account via the UP API. This is the primary data source for transactions.

### States

The page has two main states:

#### Disconnected State
Displays a form to enter the UP API token:
- Token input (password field with show/hide toggle)
- Link to UP API Portal (`https://api.up.com.au/getting_started`)
- "Connect Account" button

#### Connected State
Displays:
- Connection status with last sync timestamp
- Real-time sync status (webhook active/inactive indicator with animated ping dot)
- List of all synced accounts with display name, type (TRANSACTIONAL/SAVER), ownership (JOINT badge for 2Up accounts), and balance
- Manual sync button ("Run full sync" or "Sync Now")
- Disconnect button

### Connection Flow

1. User enters UP API token
2. Token validated via `GET https://api.up.com.au/api/v1/util/ping`
3. Token saved via Supabase RPC `upsert_up_api_config`
4. Automatic sync triggered (accounts, categories, transactions)
5. Webhook auto-registered for real-time sync
6. Partner detection triggered (if JOINT accounts detected)

### Sync Process

The sync process (triggered manually or on first connect):

1. Fetches all accounts from UP API and upserts into `accounts` table
2. Fetches all categories from UP API and upserts into `categories` table (sorted parent-first)
3. For each account, fetches transactions since last sync (or 12 months ago if first sync)
4. Each transaction is upserted into `transactions` table with full field mapping including:
   - Category inference via `inferCategoryId()`
   - Transfer account resolution
   - Tags handling via `transaction_tags` junction table
   - Hold info, round-up, cashback, and foreign currency data
5. Updates `last_synced_at` in `up_api_configs`
6. Triggers expense rematch via `POST /api/expenses/rematch-all`
7. Triggers partner detection (if JOINT accounts detected)

### Data Model

**Table:** `up_api_configs`

| Column | Type | Description |
|--------|------|-------------|
| `user_id` | UUID | Foreign key to auth users |
| `encrypted_token` | text | UP API personal access token (AES-256-GCM encrypted at rest) |
| `is_active` | boolean | Whether connection is active |
| `last_synced_at` | timestamptz | Last successful sync timestamp |
| `webhook_id` | text (nullable) | UP webhook ID if real-time sync is enabled |

**Table:** `accounts`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Internal account ID |
| `user_id` | UUID | Owner user |
| `up_account_id` | text | UP API account ID |
| `display_name` | text | Account name from UP |
| `account_type` | text | TRANSACTIONAL, SAVER, etc. |
| `ownership_type` | text | INDIVIDUAL or JOINT |
| `balance_cents` | integer | Current balance in cents |
| `is_active` | boolean | Whether account is active |

### Server Actions Used

| Action | File | Purpose |
|--------|------|---------|
| `registerUpWebhook()` | `src/app/actions/upbank.ts` | Registers UP webhook for real-time sync |
| `deleteUpWebhook()` | `src/app/actions/upbank.ts` | Removes UP webhook on disconnect |
| `connectUpBank(token)` | `src/app/actions/upbank.ts` | Validates and encrypts API token |

### Dev Tools

The page includes a `<SettingsDevTools>` component (from `src/components/dev/settings-dev-tools.tsx`) that is conditionally rendered for development purposes.

---

## AI Provider Settings

**Route:** `/settings/ai`
**File:** `src/app/(app)/settings/ai/page.tsx`
**Component:** `src/components/settings/ai-settings.tsx`
**Type:** Client component

### What It Configures

The AI assistant provider, API key, and model used for the PiggyBack AI chat feature (spending insights, budget analysis).

### Fields

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| AI Provider | Button group (3 options) | Yes | Anthropic (Claude), OpenAI (GPT), Google (Gemini) |
| API Key | Password input | Yes (first time) | Stored server-side in user profile |
| Model | Text input | No | Override default model; placeholder shows default |

### Default Models by Provider

| Provider | Default Model |
|----------|--------------|
| Google (Gemini) | `gemini-2.0-flash` |
| Anthropic (Claude) | `claude-sonnet-4-5-20250929` |
| OpenAI (GPT) | `gpt-4o-mini` |

### Warnings

A warning is displayed when Google (Gemini) is selected: "Gemini Flash models have known issues with tool calling reliability. For best results, use Claude or GPT-4o."

### API Endpoints Used

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/ai/settings` | GET | Load current provider, model, and whether a key exists |
| `/api/ai/settings` | POST | Save provider, model, and optionally a new API key |
| `/api/ai/chat` | POST | Test connection by sending a simple message |

### Features

- **Save Settings** -- Saves provider and optionally updates the API key
- **Test Connection** -- Only available when a key is configured; sends a test message via `/api/ai/chat`
- **Key Status Indicator** -- Shows a green checkmark with "Configured" if a key already exists
- Key is stored server-side only and never exposed to the client after saving

---

## Income Settings

**Route:** `/settings/income`
**File:** `src/app/(app)/settings/income/page.tsx`
**Type:** Client component

### What It Configures

Income sources used for budget calculations, the "Ready to Budget" amount, and pay schedule tracking.

### Navigation Context

The page supports contextual back navigation:
- If accessed from `/budget` (via `?from=budget` query param), the back link returns to Budget
- Otherwise, the back link returns to Settings

### Income Source Types

#### 1. Recurring Salary (`source_type: 'recurring-salary'`)

Added via two methods:

**From Transaction** (component: `IncomeFromTransaction`)
- Search transactions for income (filters positive amounts)
- Select a transaction to auto-detect pattern
- Uses `suggestMatchPattern()` and `analyzeIncomePattern()` for frequency detection
- Shows confirmation with average amount, frequency, next predicted date, and transaction history
- Creates income source via `createIncomeSourceFromTransaction()` server action

**Manual Entry** (component: `AddIncomeManual`)
- Fields: Name, Amount per Pay Period, Frequency, Last Pay Date, Next Pay Date, Notes
- Frequency options: Weekly, Fortnightly, Monthly, Quarterly, Yearly
- Next Pay Date is auto-calculated from Last Pay Date + Frequency
- Creates/updates via `createIncomeSource()` / `updateIncomeSource()` server actions

#### 2. One-off Income (`source_type: 'one-off'`)

**Component:** `AddIncomeOneOff`

- Fields: Income Type, Name, Amount, Expected Date, Already Received checkbox, Notes
- One-off types: Bonus, Gift, Dividend, Tax Refund, Freelance Project, Other
- Tracks received status with received date
- Creates/updates via `createIncomeSource()` / `updateIncomeSource()` server actions

### Income Source Display

Each income source card shows:
- Name with type badge (for one-off) and status icon (checkmark for active/received, clock for pending)
- Amount in AUD
- For recurring: frequency, last pay date, next pay date
- For one-off: expected date or received date
- Action buttons: Mark Received (one-off only), Edit, Delete

### Data Model

**Table:** `income_sources`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_id` | UUID | Owner user |
| `partnership_id` | UUID (nullable) | Associated partnership for shared budgets |
| `name` | text | Display name |
| `source_type` | text | `'recurring-salary'` or `'one-off'` |
| `one_off_type` | text (nullable) | `'bonus'`, `'gift'`, `'dividend'`, `'tax-refund'`, `'freelance'`, `'other'` |
| `amount_cents` | integer | Amount in cents |
| `frequency` | text (nullable) | `'weekly'`, `'fortnightly'`, `'monthly'`, `'quarterly'`, `'yearly'` |
| `last_pay_date` | date (nullable) | Most recent pay date |
| `next_pay_date` | date (nullable) | Predicted next pay date |
| `expected_date` | date (nullable) | Expected date for one-off income |
| `received_date` | timestamptz (nullable) | When one-off was actually received |
| `is_received` | boolean | Whether one-off has been received |
| `linked_transaction_id` | UUID (nullable) | Transaction that created this source |
| `match_pattern` | text (nullable) | Pattern for matching future transactions |
| `notes` | text (nullable) | User notes |
| `is_active` | boolean | Soft-delete flag (false = deleted) |

### Server Actions Used

| Action | File | Purpose |
|--------|------|---------|
| `getIncomeSources(userId)` | `src/app/actions/income-sources.ts` | Fetch all active income sources for a user |
| `createIncomeSource(data)` | `src/app/actions/income-sources.ts` | Create a new income source |
| `updateIncomeSource(id, data)` | `src/app/actions/income-sources.ts` | Update an existing income source |
| `deleteIncomeSource(id)` | `src/app/actions/income-sources.ts` | Soft-delete (sets `is_active` to false) |
| `markOneOffReceived(id)` | `src/app/actions/income-sources.ts` | Mark one-off as received with current timestamp |
| `createIncomeSourceFromTransaction(...)` | `src/app/actions/income.ts` | Create income source from a selected transaction |
| `getManualPartnerIncomeSources(partnershipId)` | `src/app/actions/income-sources.ts` | Get manual partner's income sources |

### Related Components

| Component | File | Purpose |
|-----------|------|---------|
| `IncomeFromTransaction` | `src/components/settings/income-from-transaction.tsx` | Transaction search and income pattern detection |
| `AddIncomeManual` | `src/components/settings/add-income-manual.tsx` | Manual recurring salary entry form |
| `AddIncomeOneOff` | `src/components/settings/add-income-oneoff.tsx` | One-off income entry form |
| `TransactionLink` | `src/components/transactions/transaction-link.tsx` | Shows linked UP transaction |
| `TransactionHistory` | `src/components/transactions/transaction-history.tsx` | Shows recent matching transactions |

---

## Partner Settings

**Route:** `/settings/partner`
**File:** `src/app/(app)/settings/partner/page.tsx`
**Type:** Client component

### What It Configures

Manual partner information for users whose partner does not use PiggyBack. This enables partner-aware features like FIRE planning with combined super balances and income-based budget splitting.

### Page Sections

#### 1. Manual Partner Card
Allows the user to enter their partner's details:
- Partner name
- Date of birth (for FIRE age calculations)
- Target retirement age
- Superannuation balance
- Employer contribution rate

#### 2. Partner Income Sources
When a manual partner is configured, the user can add income sources on behalf of their partner (marked with `is_manual_partner_income: true`).

### Data Model

Manual partner data is stored directly on the `partnerships` table:

| Column | Type | Description |
|--------|------|-------------|
| `manual_partner_name` | text (nullable) | Partner's display name |
| `manual_partner_dob` | date (nullable) | Partner's date of birth |
| `manual_partner_target_retirement_age` | integer (nullable) | Partner's target retirement age |
| `manual_partner_super_balance_cents` | integer | Partner's super balance in cents (default 0) |
| `manual_partner_super_contribution_rate` | numeric | Partner's employer SG rate (default 11.5) |

### Server Actions Used

| Action | File | Purpose |
|--------|------|---------|
| `saveManualPartner(data)` | `src/app/actions/partner.ts` | Save or update manual partner details |
| `removeManualPartner()` | `src/app/actions/partner.ts` | Clear manual partner data and soft-delete their income sources |
| `getManualPartnerInfo()` | `src/app/actions/partner.ts` | Get current manual partner info (null if none configured) |

---

## FIRE Settings

**Route:** `/settings/fire`
**File:** `src/app/(app)/settings/fire/page.tsx`
**Type:** Client component

### What It Configures

Financial Independence, Retire Early (FIRE) planning parameters. These settings drive the projections on the `/plan` page.

### Form Sections

#### 1. Personal Details

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Date of Birth | Date input | Yes (required to save) | Used to calculate current age and projection timeline |
| Target Retirement Age | Number input (25-80) | No | Defaults to "As early as possible" (ASAP mode toggle) |

#### 2. Superannuation

| Field | Type | Notes |
|-------|------|-------|
| Current Super Balance | Currency input ($) | Starting balance for projections |
| Employer Contribution Rate | Select or custom input (%) | Presets: 11.5% (Standard SG 2025-26), 12%, 15%, 20%, or Custom |

#### 3. Investment Assumptions

| Field | Type | Notes |
|-------|------|-------|
| Expected Annual Return (after inflation) | Preset buttons or custom input (%) | Conservative 5%, Balanced 7%, Aggressive 9%, or custom rate |
| Outside Super Return Rate | Toggle + custom input (%) | Optional separate return rate for non-super investments; defaults to same as super |
| Income Growth Rate | Percentage input (%) | Expected annual income growth rate |
| Spending Growth Rate | Percentage input (%) | Expected annual spending growth rate |

#### 4. FIRE Variant

| Variant | Description |
|---------|-------------|
| **Lean FIRE** | Essentials only -- frugal retirement |
| **Regular FIRE** | Current lifestyle maintained |
| **Fat FIRE** | Current lifestyle + 25% buffer |
| **Coast FIRE** | Stop saving, let growth do the work |

#### 5. Override Annual Expenses

Optional toggle to override the calculated annual expenses from transaction history with a fixed amount.

### Data Model

All FIRE fields are stored on the `profiles` table:

| Column | Type | Description |
|--------|------|-------------|
| `date_of_birth` | date (nullable) | User's date of birth |
| `target_retirement_age` | integer (nullable) | Target age; null = ASAP |
| `super_balance_cents` | integer (nullable) | Current superannuation balance in cents |
| `super_contribution_rate` | numeric (nullable) | Employer SG rate (e.g., 11.5) |
| `expected_return_rate` | numeric (nullable) | Expected annual return after inflation |
| `outside_super_return_rate` | numeric (nullable) | Separate return rate for outside-super investments; null = use expected_return_rate |
| `income_growth_rate` | numeric | Expected annual income growth rate |
| `spending_growth_rate` | numeric | Expected annual spending growth rate |
| `fire_variant` | text (nullable) | `'lean'`, `'regular'`, `'fat'`, or `'coast'` |
| `annual_expense_override_cents` | integer (nullable) | Manual expense override; null = use calculated |
| `fire_onboarded` | boolean | Set to `true` on first save |

### Server Actions Used

| Action | File | Purpose |
|--------|------|---------|
| `updateFireProfile(data)` | `src/app/actions/fire.ts` | Save FIRE settings; sets `fire_onboarded: true`; revalidates `/plan` and `/settings/fire` |

**Note:** FIRE profile data is loaded client-side directly from the `profiles` table via Supabase client. There is no `getFireProfile` server action.

---

## Appearance / Theme Settings

**Route:** `/settings/appearance`
**File:** `src/app/(app)/settings/appearance/page.tsx`
**Type:** Client component

### What It Configures

The visual theme applied across the entire PiggyBack application.

### Available Themes

| Theme | Icon | Description |
|-------|------|-------------|
| **Mint** | `Leaf` | Fresh and playful pastel theme (default) |
| **Light** | `Sun` | Clean and bright |
| **Dark** | `Moon` | Easy on the eyes |
| **Ocean** | `Waves` | Cool and calming |

### Theme Application

Themes are applied by adding a CSS class to the `<html>` element:
```
document.documentElement.classList.add(theme)
```

Previous theme classes are removed before the new one is applied.

### Persistence Strategy (Dual Storage)

1. **localStorage** (`piggyback-theme`) -- Checked first for fast load; prevents flash of wrong theme
2. **Database** (`profiles.theme_preference`) -- Synced for cross-device consistency

On load:
1. Check `localStorage` for saved theme
2. If not found, fetch from `profiles.theme_preference` via Supabase
3. Apply theme and save to `localStorage`

On save:
1. Save to `localStorage` immediately
2. Update `profiles.theme_preference` in database

### Data Model

**Table:** `profiles`

| Column | Type | Description |
|--------|------|-------------|
| `theme_preference` | text (nullable) | `'mint'`, `'light'`, `'dark'`, or `'ocean'` |

### Live Preview

Selecting a theme applies it immediately (before saving), allowing the user to preview it. The save button is only enabled when the selected theme differs from the current saved theme.

---

## Notification Settings

**Route:** `/settings/notifications`
**File:** `src/app/(app)/settings/notifications/page.tsx`
**Type:** Client component

### What It Configures

In-app notification preferences for various app events. Each notification category can be individually enabled or disabled, with configurable delivery parameters where applicable.

### Notification Categories

| Category | Default | Configurable Options | Description |
|----------|---------|---------------------|-------------|
| **Price Changes** | On | -- | Notified when tracked investment prices change significantly |
| **Goal Milestones** | On | -- | Celebrate savings goal milestones (25%, 50%, 75%, 100%) |
| **Payment Reminders** | On | Lead days (1-7), send time, timezone | Upcoming bills and paydays |
| **Weekly Summary** | Off | Day of week, send time, timezone | Weekly financial overview |

### Data Model

**Table:** `profiles`

| Column | Type | Description |
|--------|------|-------------|
| `notification_preferences` | jsonb (nullable) | JSON object with preference flags and configuration |

The `notification_preferences` JSON structure:
```json
{
  "price_changes": { "enabled": true },
  "goal_milestones": { "enabled": true },
  "payment_reminders": {
    "enabled": true,
    "lead_days": 3,
    "send_time": "09:00",
    "timezone": "Australia/Melbourne"
  },
  "weekly_summary": {
    "enabled": false,
    "day_of_week": "sunday",
    "send_time": "08:00",
    "timezone": "Australia/Melbourne"
  }
}
```

### Data Flow

- **Load:** Reads `profiles.notification_preferences` via Supabase client
- **Save:** Updates `profiles.notification_preferences` via Supabase client
- **No server action used** -- operates entirely through the Supabase client-side SDK

---

## Privacy & Security Settings

**Route:** `/settings/security`
**File:** `src/app/(app)/settings/security/page.tsx`
**Type:** Client component

### What It Configures

Password management and account deletion.

### Sections

#### 1. Change Password

| Field | Type | Validation |
|-------|------|------------|
| New Password | Password input | Minimum 8 characters |
| Confirm New Password | Password input | Must match new password |

Password change is performed via `supabase.auth.updateUser({ password: newPassword })`.

#### 2. Danger Zone -- Delete Account

Account deletion requires typing "DELETE" to confirm. The deletion process:

1. Deletes the user's `profiles` row (related data cascades per DB schema)
2. Signs the user out via `supabase.auth.signOut()`
3. Redirects to the home page

A confirmation dialog warns: "This will permanently delete your account, all your data, transactions, goals, and partnerships. This action cannot be undone."

### Data Flow

- **Password Change:** `supabase.auth.updateUser()` (Supabase Auth API)
- **Account Deletion:** `supabase.from("profiles").delete()` + `supabase.auth.signOut()`
- **No server action used** -- operates entirely through the Supabase client-side SDK

---

## Demo Mode

Several settings actions are guarded by `demoActionGuard()` (from `src/lib/demo-guard.ts`). In demo mode, write operations return early with a blocked response while read operations continue to work normally. The following server actions enforce demo guards:

- `createIncomeSource()`
- `updateIncomeSource()`
- `deleteIncomeSource()`
- `markOneOffReceived()`
- `updateFireProfile()`
- `registerUpWebhook()`
- `saveManualPartner()`
- `removeManualPartner()`

---

## File Reference

### Pages

| File | Route | Server/Client |
|------|-------|---------------|
| `src/app/(app)/settings/page.tsx` | `/settings` | Server |
| `src/app/(app)/settings/profile/page.tsx` | `/settings/profile` | Client |
| `src/app/(app)/settings/partner/page.tsx` | `/settings/partner` | Client |
| `src/app/(app)/settings/up-connection/page.tsx` | `/settings/up-connection` | Client |
| `src/app/(app)/settings/ai/page.tsx` | `/settings/ai` | Client |
| `src/app/(app)/settings/income/page.tsx` | `/settings/income` | Client |
| `src/app/(app)/settings/fire/page.tsx` | `/settings/fire` | Client |
| `src/app/(app)/settings/appearance/page.tsx` | `/settings/appearance` | Client |
| `src/app/(app)/settings/notifications/page.tsx` | `/settings/notifications` | Client |
| `src/app/(app)/settings/security/page.tsx` | `/settings/security` | Client |

### Components

| File | Used By |
|------|---------|
| `src/components/settings/ai-settings.tsx` | AI settings page |
| `src/components/settings/income-from-transaction.tsx` | Income settings page |
| `src/components/settings/add-income-manual.tsx` | Income settings page |
| `src/components/settings/add-income-oneoff.tsx` | Income settings page |

### Server Actions

| File | Actions |
|------|---------|
| `src/app/actions/income-sources.ts` | `createIncomeSource`, `getIncomeSources`, `getManualPartnerIncomeSources`, `updateIncomeSource`, `deleteIncomeSource`, `markOneOffReceived` |
| `src/app/actions/partner.ts` | `saveManualPartner`, `removeManualPartner`, `getManualPartnerInfo` |
| `src/app/actions/fire.ts` | `updateFireProfile` |
| `src/app/actions/upbank.ts` | `registerUpWebhook`, `deleteUpWebhook`, `connectUpBank`, `pingWebhook` |
| `src/app/actions/income.ts` | `createIncomeSourceFromTransaction`, `syncIncomeTagsFromUpBank` |

### API Routes

| Endpoint | Used By |
|----------|---------|
| `/api/ai/settings` (GET/POST) | AI settings |
| `/api/ai/chat` (POST) | AI settings (test connection) |
| `/api/expenses/rematch-all` (POST) | UP connection (post-sync) |
| `/api/transactions` (GET) | Income from transaction search |

---

## Database Tables Summary

| Table | Settings Sections |
|-------|------------------|
| `profiles` | Profile, FIRE, Appearance, Notifications |
| `up_api_configs` | UP Bank Connection |
| `accounts` | UP Bank Connection, Partner |
| `income_sources` | Income |
| `partnership_members` | Partner, Settings hub |
| `partnerships` | Partner, Settings hub |
| `transactions` | Income (from transaction), UP Bank Connection (sync) |
| `categories` | UP Bank Connection (sync) |
| `transaction_tags` | UP Bank Connection (sync) |
