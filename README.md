# PiggyBack

<p>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT" /></a>
  <img src="https://img.shields.io/badge/Status-Beta-blue" alt="Status: Beta" />
  <a href="https://securityscorecards.dev/viewer/?uri=github.com/BenLaurenson/PiggyBack"><img src="https://api.securityscorecards.dev/projects/github.com/BenLaurenson/PiggyBack/badge" alt="OpenSSF Scorecard" /></a>
  <a href="https://www.bestpractices.dev/projects/10407"><img src="https://www.bestpractices.dev/projects/10407/badge" alt="OpenSSF Best Practices" /></a>
  <br />
  <a href="https://nextjs.org/"><img src="https://img.shields.io/badge/Next.js-16-black?logo=next.js" alt="Next.js" /></a>
  <a href="https://react.dev/"><img src="https://img.shields.io/badge/React-19-61DAFB?logo=react" alt="React" /></a>
  <a href="https://supabase.com/"><img src="https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase" alt="Supabase" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript" alt="TypeScript" /></a>
  <a href="https://tailwindcss.com/"><img src="https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss" alt="Tailwind CSS" /></a>
</p>

Your finances on autopilot with Up Bank. Auto-syncing transactions, budgets, savings goals, and a 35-tool AI financial assistant. Self-hosted on Vercel + Supabase.

<p align="center">
  <img src="public/images/screenshots/dashboard.png" alt="Dashboard" width="100%" />
</p>

<p align="center">
  <a href="https://piggyback.finance/home">Check out the live demo</a>
</p>

## Overview

PiggyBack syncs with [Up Bank](https://up.com.au/) to automatically import your accounts and transactions, then provides tools to manage your finances. It features shared budgets with fair-split calculations, savings goal tracking linked to Up savers, recurring expense detection, investment portfolio tracking with live price updates from Yahoo Finance and CoinGecko, FIRE (Financial Independence) planning, and an AI-powered financial assistant.

Each user connects their own Up Bank account using a personal access token. All financial data is stored in the user's own Supabase database with row-level security -- no data is shared with third parties.

## Features

- **Up Bank Sync** -- Automatic import of accounts, transactions, categories, and tags via webhooks
- **Couples Partnership** -- Shared financial view with your partner, income-weighted expense splitting
- **Zero-Based Budgeting** -- Category budgets with real-time spending tracking and period-aware calculations
- **Savings Goals** -- Visual progress tracking linked to Up Bank saver accounts
- **Recurring Expenses** -- Auto-detection and tracking of subscriptions and bills
- **Investment Portfolio** -- Track stocks, ETFs, crypto, and property with live price updates (Yahoo Finance for ASX/US stocks, CoinGecko for crypto)
- **Watchlist** -- Track investments you don't own yet with price monitoring
- **Target Allocations** -- Set portfolio allocation targets and see rebalancing recommendations
- **FIRE Planning** -- Australian two-bucket FIRE calculator with lean/regular/fat/coast variants
- **AI Assistant** -- Chat-based financial insights powered by your choice of Google, OpenAI, or Anthropic
- **Net Worth Tracking** -- Real-time snapshots via webhook with historical charts
- **Customizable UI** -- Multiple themes, accent colors, and layout configurations

## Screenshots

<details>
<summary>Budget Tracking</summary>
<img src="public/images/screenshots/budget.png" alt="Budget" width="100%" />
</details>

<details>
<summary>Transaction Activity</summary>
<img src="public/images/screenshots/activity.png" alt="Activity" width="100%" />
</details>

<details>
<summary>Savings Goals</summary>
<img src="public/images/screenshots/goals.png" alt="Goals" width="100%" />
</details>

<details>
<summary>Investment Portfolio</summary>
<img src="public/images/screenshots/invest.png" alt="Investments" width="100%" />
</details>

<details>
<summary>FIRE Planning</summary>
<img src="public/images/screenshots/plan.png" alt="FIRE Planning" width="100%" />
</details>

<details>
<summary>Spending Analysis</summary>
<img src="public/images/screenshots/analysis.png" alt="Analysis" width="100%" />
</details>

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Next.js 16](https://nextjs.org/) (App Router, Turbopack) |
| UI | [React 19](https://react.dev/), [Tailwind CSS 4](https://tailwindcss.com/), [shadcn/ui](https://ui.shadcn.com/) |
| Database | [Supabase](https://supabase.com/) (PostgreSQL with Row Level Security) |
| Banking API | [Up Bank API](https://developer.up.com.au/) |
| Price APIs | [Yahoo Finance](https://finance.yahoo.com/) (stocks/ETFs), [CoinGecko](https://www.coingecko.com/) (crypto) |
| AI | [Vercel AI SDK](https://sdk.vercel.ai/) with multi-provider support |
| Testing | [Vitest](https://vitest.dev/) (1120+ tests across 50 test files) |
| Charts | [Recharts](https://recharts.org/) |
| Animations | [Framer Motion](https://www.framer.com/motion/) |
| Deployment | [Vercel](https://vercel.com/) |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [npm](https://www.npmjs.com/) or [pnpm](https://pnpm.io/)
- A [Supabase](https://supabase.com/) account (free tier works)
- An [Up Bank](https://up.com.au/) account (Australian neobank)

### 1. Clone the repository

```bash
git clone https://github.com/BenLaurenson/PiggyBack.git
cd PiggyBack
npm install
```

### 2. Set up Supabase

Create a new Supabase project, then apply the database migrations in order:

```bash
# Apply all migrations from supabase/migrations/ via the Supabase dashboard SQL editor
# or using the Supabase CLI
```

The `supabase/migrations/` directory contains a single consolidated migration that sets up all tables, RLS policies, and functions.

### 3. Configure environment variables

Copy the example file and fill in your values:

```bash
cp .env.local.example .env.local
```

Required variables:

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase publishable/anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase service role key (Settings > API) |
| `UP_API_ENCRYPTION_KEY` | 64-character hex key for encrypting stored Up API tokens (see `.env.local.example`) |
| `NEXT_PUBLIC_APP_URL` | Your app URL (`http://localhost:3005` for local dev, `http://localhost:3000` for Docker/production) |

### 4. Run the development server

```bash
npm run dev
```

Open [http://localhost:3005](http://localhost:3005) to access the app. Make sure `NEXT_PUBLIC_APP_URL` in `.env.local` is set to `http://localhost:3005` and your Supabase auth redirect URLs include the `:3005` port.

### 5. Connect Up Bank

1. Sign up / log in to PiggyBack
2. Go to Settings > Up Bank Connection
3. Enter your Up Bank Personal Access Token (from the Up app or [api.up.com.au](https://api.up.com.au))
4. Your accounts and transactions will sync automatically

## Project Structure

```
PiggyBack/
├── src/
│   ├── app/              # Next.js App Router
│   │   ├── (app)/        # Authenticated pages
│   │   │   ├── home/
│   │   │   ├── activity/
│   │   │   ├── analysis/
│   │   │   ├── budget/
│   │   │   ├── goals/
│   │   │   ├── invest/
│   │   │   ├── plan/
│   │   │   ├── notifications/
│   │   │   └── settings/
│   │   ├── actions/      # Server actions
│   │   ├── api/          # REST API routes
│   │   └── auth/
│   ├── components/       # 125 React components
│   ├── lib/              # Business logic
│   │   └── __tests__/    # 50 test files
│   └── utils/
│       └── supabase/     # Client setup
├── documentation/
├── supabase/
│   └── migrations/
└── package.json
```

## Up Bank API Usage

This app uses the [Up Bank API](https://developer.up.com.au/) for personal banking data. Per Up's [API Acceptable Use Policy](https://up.com.au/api-acceptable-use-policy/):

- The API is for **personal use only**
- Each user must use their **own personal access token**
- Tokens must **not be shared** with third parties
- Do not extract merchant data for commercial use

Your Up API token is encrypted at rest in the database and is never exposed in client-side code.

## Running Tests

```bash
npm test          # Watch mode
npm run test:run  # Single run
```

The test suite covers 1120+ tests across 50 test files, including:

- Budget calculations (zero-based, shared budgets, period helpers, income frequency)
- Investment logic (price APIs, portfolio aggregation, FIRE calculations, invest calculations)
- Expense projections and matching
- AI tool definitions

## Deployment

Two deployment guides are available:

- **[Deploy to the Cloud](DEPLOY-CLOUD.md)** — Vercel + hosted Supabase (free tier, quickest setup)
- **[Deploy Locally](DEPLOY-LOCAL.md)** — Docker + local or hosted Supabase (self-hosted, maximum privacy)

## Documentation

Detailed documentation for contributors and developers:

| Directory | Contents |
|-----------|----------|
| `architecture/` | System overview, data flow, deployment, tech stack |
| `features/` | AI system, budget engine, FIRE calculator, income tracking, investments, recurring expenses, Up Bank integration, library reference |
| `database/` | Schema reference, RLS policies |
| `api-routes/` | REST API routes, server actions |
| `up-bank-api/` | Accounts, transactions, categories, tags, webhooks, pagination |
| `components/` | Component architecture |
| `settings/` | Settings system |
| `onboarding/` | Onboarding flow |

See the full [documentation index](documentation/README.md) for details.

## Security

PiggyBack takes security seriously. The project maintains an [OpenSSF Best Practices](https://www.bestpractices.dev/projects/10407) passing badge and is continuously monitored by the [OpenSSF Scorecard](https://securityscorecards.dev/viewer/?uri=github.com/BenLaurenson/PiggyBack).

### CI/CD Security Pipeline

Every push and pull request is scanned by:

| Tool | What It Does |
|------|-------------|
| CodeQL | SAST for JS/TS — detects XSS, injection, data flow vulnerabilities |
| Trivy | Filesystem and Docker vulnerability scanning, SBOM generation |
| Gitleaks | Secret detection in commits (also runs as a pre-commit hook) |
| Dependency Review | Blocks PRs with vulnerable or restrictively-licensed dependencies |
| Snyk | Code and dependency scanning (SAST + SCA) |
| OpenSSF Scorecard | Automated supply chain security health scoring |
| SLSA Provenance | Supply chain integrity and artifact provenance verification |
| Dependabot | Automated dependency updates for npm, GitHub Actions, and Docker |

All workflow files are in [`.github/workflows/`](.github/workflows/).

### Application Security

- **AES-256-GCM encryption** — Up Bank API tokens encrypted at rest
- **Row Level Security (RLS)** — All user-facing Supabase tables protected
- **HMAC-SHA256 webhook verification** — Timing-safe comparison for Up Bank webhooks
- **Zod input validation** — Schema validation on all server actions and API routes
- **Content Security Policy** — CSP headers configured in Next.js
- **GitHub Secret Scanning** — Push protection enabled to prevent credential leaks

### Vulnerability Reporting

Please report security vulnerabilities privately via [GitHub Security Advisories](https://github.com/BenLaurenson/PiggyBack/security/advisories) or see [SECURITY.md](SECURITY.md) for details.

## Disclaimer

This software is provided for personal, non-commercial use. It is not financial advice. The developers are not responsible for any financial decisions made based on information displayed by this application. Always consult a qualified financial adviser for financial decisions.

This project is not affiliated with, endorsed by, or officially connected to Up Bank (Ferocia Pty Ltd / Bendigo and Adelaide Bank).

Users are responsible for compliance with Up Bank's [Terms of Use](https://up.com.au/terms_of_use/) and [API Acceptable Use Policy](https://up.com.au/api-acceptable-use-policy/), as well as applicable Australian privacy and consumer data laws.

## Contributing

Contributions are welcome! Please read:

- [CONTRIBUTING.md](CONTRIBUTING.md) — setup guide, workflow, and code standards
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) — community guidelines
- [SECURITY.md](SECURITY.md) — how to report vulnerabilities

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Acknowledgements

- [Up Bank](https://up.com.au/) for their excellent banking API
- [Supabase](https://supabase.com/) for the backend platform
- [Next.js](https://nextjs.org/) and the React ecosystem
- [shadcn/ui](https://ui.shadcn.com/) for the component library
- [Vercel](https://vercel.com/) for hosting and deployment
