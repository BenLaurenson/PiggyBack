# Onboarding System

## Overview
New users go through a 6-step onboarding wizard before accessing the main app. The wizard is enforced by middleware that checks `profiles.has_onboarded` on every protected route request. Most steps (except Welcome and Complete) are optional and can be skipped.

## Middleware Enforcement

Located in `src/utils/supabase/middleware.ts`, the middleware runs on every request and enforces onboarding in the following order:

1. **Demo mode API guard**: If `NEXT_PUBLIC_DEMO_MODE=true` and the request is a non-GET request to `/api/*`, return a 200 response with `{ error: "Demo mode -- changes are not saved.", demo: true }`. This blocks all API mutations in demo mode.
2. **Auth token refresh**: Call `supabase.auth.getUser()` to refresh the session.
3. **Demo auto-sign-in**: If demo mode is enabled and no user session exists, automatically sign in using `DEMO_USER_EMAIL` and `DEMO_USER_PASSWORD` environment variables.
4. **Protected route check**: The following paths require authentication: `/home`, `/settings`, `/goals`, `/plan`, `/activity`, `/budget`, `/invest`, `/onboarding`. If the user is not authenticated and hits one of these paths, redirect to `/login`.
5. **Login redirect**: If an authenticated user visits `/login` or `/signup`, redirect them to `/home`.
6. **Onboarding enforcement** (skipped in demo mode): If the user is authenticated, on a protected route, and NOT already on `/onboarding`, query `profiles.has_onboarded` for the user. If `has_onboarded === false`, redirect to `/onboarding`.

The middleware uses `maybeSingle()` for the profile query, so a missing profile row does not trigger a redirect -- only an explicit `false` value does.

## Onboarding Page (Server Component)

Located at `src/app/(onboarding)/onboarding/page.tsx`:

1. Fetches the authenticated user (redirects to `/login` if not authenticated)
2. Queries the profile for `display_name`, `has_onboarded`, and `onboarding_steps_completed`
3. Passes `userId`, `email`, `existingDisplayName`, and `stepsCompleted` to the `OnboardingWizard` client component

The `onboarding_steps_completed` field is a JSON array persisted to the profile, allowing the completion checklist on the final step to reflect which steps the user actually configured (vs. skipped).

## Wizard Steps

The wizard is defined in `src/components/onboarding/onboarding-wizard.tsx` with 6 steps:

| # | Step ID | Label | Component | Required | Skippable |
|---|---------|-------|-----------|----------|-----------|
| 0 | `welcome` | Welcome | `WelcomeStep` | Yes | No (just click "Get Started") |
| 1 | `profile` | Profile | `ProfileStep` | Yes | No (display name required) |
| 2 | `bank` | Bank | `BankStep` | No | Yes (empty token = skip) |
| 3 | `income` | Income | `IncomeStep` | No | Yes ("Skip for now") |
| 4 | `ai` | AI | `AiStep` | No | Yes (no provider = skip) |
| 5 | `complete` | Done | `CompleteStep` | Yes | No (finishes onboarding) |

### Step Navigation

- A progress bar at the top shows completion percentage: `((currentStep + 1) / 6) * 100`
- Step labels are displayed below the progress bar, highlighted up to the current step
- A **Back** button appears on steps 1-4 (not on Welcome or Complete)
- Steps are rendered via a `switch` on the `currentStep` index

### Step 0: Welcome
- Displays the Penny AI mascot avatar (`/images/mascot/penny-ai-avatar.png`) and a welcome message
- Lists what the user will configure: profile, bank, income, AI assistant, partner invite
- Single "Get Started" button calls `onNext()` to advance
- No data is saved; no step is marked complete

### Step 1: Profile
- Prompts for a display name (pre-filled from `existingDisplayName` if set)
- **Validation**: Display name must not be empty after trimming; shows inline error "Please enter your name"
- **On save**: Updates `profiles.display_name` via Supabase client, then marks `"profile"` as complete and advances
- **On error**: Displays the error message inline; the user stays on the step
- Supports Enter key to submit

### Step 2: Bank Connection
- Prompts for an UP Bank API token with show/hide toggle
- Links to `https://api.up.com.au/getting_started` for token generation
- **If token is empty**: Clicking the button calls `onNext()` (skip, not marked complete)
- **If token is provided**, the step runs a multi-phase sync with a progress spinner:
  1. **Connecting**: Calls the `connectUpBank(upToken)` server action, which validates the token against the UP Bank API (ping) and encrypts it with AES-256-GCM before storing via RPC
  2. **Syncing accounts**: Fetches all accounts from the UP Bank API and upserts them into the `accounts` table
  3. **Syncing categories**: Fetches categories from the UP Bank API and upserts them into the `categories` table (parent-first ordering)
  4. **Syncing transactions**: For each account, paginates through 12 months of transactions and upserts them with full field mapping (hold info, round-up, cashback, transfer account, foreign currency, etc.). Applies category inference with priority: override > merchant rule > infer (via `inferCategoryId`). Also syncs tags and `transaction_tags`.
  5. **Finishing**: Updates `last_synced_at`, triggers expense rematch via `/api/expenses/rematch-all`, and registers a webhook for real-time sync via `registerUpWebhook()`
  6. Shows "Synced X transactions!" success screen, then marks `"bank"` as complete and advances after 1.5s
- Progress is shown throughout: phase description, transaction count updated every 25 transactions
- **On error**: Displays the error inline and resets to the form

### Step 3: Income Setup
- On mount, fetches the user's `accountIds` (active accounts), `partnershipId`, and any existing income sources via `getIncomeSources()`
- Shows a choice screen with two options:
  - **"From Transaction"**: Uses the `IncomeFromTransaction` component (`src/components/settings/income-from-transaction.tsx`) to search synced transactions for income deposits, detect frequency/amount patterns, and create an income source. Only shown if the user has connected bank accounts.
  - **"Manual Entry"**: Uses the `AddIncomeManual` component (`src/components/settings/add-income-manual.tsx`) for manual income source creation with name, amount, frequency, and pay dates.
- After adding an income source, returns to the choice screen showing the added source(s) with a checkmark
- Users can add multiple income sources before continuing
- **"Continue"** button appears after at least one source is added (marks `"income"` as complete)
- **"Skip for now"** is always available at the bottom

### Step 4: AI Setup
- Provider selection dropdown: Google Gemini, OpenAI, Anthropic Claude
- API key input with show/hide toggle (only appears after selecting a provider)
- Default models per provider: `gemini-2.0-flash`, `gpt-4o-mini`, `claude-sonnet-4-5-20250929`
- **If no provider or no key**: Button shows "Skip for now" and calls `onNext()` (not marked complete)
- **If provider and key are provided**: Button shows "Save & Continue"
  1. Updates `profiles.ai_provider`, `profiles.ai_api_key`, and `profiles.ai_model`
  2. Shows an "AI Configured!" success screen
  3. After an 800ms delay, marks `"ai"` as complete and advances
- **On error**: Displays the error inline

### Step 5: Complete
- Displays a summary checklist showing which steps were completed vs. skipped
- Checklist items: Profile, Bank, Income, AI Assistant, Partner Invited
- Completed items show a green checkmark; skipped items are dimmed
- Single **"Go to Dashboard"** button that calls `completeOnboarding(completedSteps)` then navigates to `/home`

### Completion Action

The `completeOnboarding` server action (`src/app/actions/onboarding.ts`):
1. Guards against demo mode via `demoActionGuard()`
2. Authenticates the user
3. Updates the profile with:
   - `has_onboarded: true`
   - `onboarded_at: <current ISO timestamp>`
   - `onboarding_steps_completed: <array of step IDs>`

## Error Handling

All step components follow the same error handling pattern:

1. Each step maintains its own `error` state (initially `null`)
2. Before an async operation, `error` is cleared to `null` and `loading` is set to `true`
3. On failure, the caught error message is set to the `error` state
4. Errors are displayed inline as styled text below the form fields
5. The `loading` state disables the submit button to prevent duplicate submissions
6. The user remains on the current step and can retry or correct their input

For the Bank and AI steps specifically, a success state is shown briefly (green checkmark / success screen) before auto-advancing via `setTimeout`.

## Data Sync During Onboarding

During the Bank Connection step (Step 2), if a valid token is provided, a full sync is performed:
1. All accounts are fetched from the UP Bank API and upserted into the `accounts` table
2. All categories are fetched and upserted into the `categories` table
3. 12 months of transactions are paginated and upserted with category inference, tags, and full field mapping
4. `last_synced_at` is updated on `up_api_configs`
5. Expense rematch is triggered via `/api/expenses/rematch-all`
6. A webhook is registered for real-time sync via `registerUpWebhook()`

This ensures that by the time the user reaches the Income step, their synced transactions are available for transaction-based income detection.

## Key Files

| File | Purpose |
|------|---------|
| `src/app/(onboarding)/onboarding/page.tsx` | Server component: auth check, profile fetch, renders wizard |
| `src/components/onboarding/onboarding-wizard.tsx` | Client component: step navigation, progress bar, step rendering |
| `src/components/onboarding/steps/welcome-step.tsx` | Step 0: Welcome screen with Penny mascot |
| `src/components/onboarding/steps/profile-step.tsx` | Step 1: Display name input |
| `src/components/onboarding/steps/bank-step.tsx` | Step 2: UP Bank token + full 12-month sync |
| `src/components/onboarding/steps/income-step.tsx` | Step 3: Transaction-based or manual income setup |
| `src/components/onboarding/steps/ai-step.tsx` | Step 4: AI provider + API key |
| `src/components/onboarding/steps/complete-step.tsx` | Step 5: Summary checklist + go to dashboard |
| `src/app/actions/onboarding.ts` | Server action: marks onboarding complete |
| `src/utils/supabase/middleware.ts` | Middleware: auth, demo mode, onboarding enforcement |
| `src/components/settings/income-from-transaction.tsx` | Reused component: transaction-based income detection |
| `src/components/settings/add-income-manual.tsx` | Reused component: manual income entry form |
