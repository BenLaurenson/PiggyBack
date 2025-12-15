# Contributing to PiggyBack

Thanks for your interest in contributing to PiggyBack! This guide will help you get started.

## Getting Started

### 1. Fork and clone

```bash
git clone https://github.com/<your-username>/PiggyBack.git
cd PiggyBack
npm install
```

### 2. Set up environment variables

```bash
cp .env.local.example .env.local
```

Fill in your Supabase project URL, anon key, and a 32-character encryption key. See the [README](README.md#getting-started) for details.

### 3. Set up the database

Apply the migrations in `supabase/migrations/` to your Supabase project using the SQL editor or the Supabase CLI.

### 4. Enable git hooks

```bash
git config core.hooksPath .githooks
```

This enables the pre-commit hook that uses [gitleaks](https://github.com/gitleaks/gitleaks) to prevent accidentally committing secrets. Install gitleaks with `brew install gitleaks`.

### 5. Start the dev server

```bash
npm run dev
```

The app runs at [http://localhost:3005](http://localhost:3005).

## Development Workflow

1. Create a feature branch from `main`:
   ```bash
   git checkout -b feature/your-feature
   ```
2. Make your changes
3. Run linting and tests:
   ```bash
   npm run lint
   npm run test:run
   ```
4. Commit with a descriptive message
5. Push and open a Pull Request against `main`

## Code Standards

- **TypeScript** — strict mode, no `any` unless unavoidable
- **Server Components by default** — only use `"use client"` when interactivity is needed
- **Naming** — PascalCase for components, camelCase for functions/variables, kebab-case for files
- **Tests required** — new features and bug fixes should include tests (Vitest)
- **RLS for new tables** — every user-facing table must have Row Level Security policies
- **No hardcoded secrets** — use environment variables for all credentials

## Project Structure

```
src/
  app/           # Next.js App Router (33 pages, 34 API routes, 13 server action files)
  components/    # React components organised by feature domain (125 files)
  lib/           # Utilities and business logic (45 files)
  lib/__tests__/ # Vitest test files (50 files, 1090+ tests)
  hooks/         # Custom React hooks
  types/         # TypeScript type definitions
  utils/         # Supabase client setup
supabase/
  migrations/    # 1 consolidated initial schema migration
```

## Database Changes

- Create a new migration file in `supabase/migrations/` with the next sequential number
- Include both the schema change and any necessary RLS policies
- Test the migration against a fresh Supabase project if possible

## Testing

```bash
npm test          # Watch mode
npm run test:run  # Single run
```

Tests use Vitest (50 test files, 1090+ tests). Test files live in `src/lib/__tests__/` and additional `__tests__/` directories throughout `src/` and cover:

- Budget calculations (zero-based, shared budgets, period helpers, income frequency)
- Investment logic (price APIs, portfolio aggregation, FIRE calculations, invest calculations)
- Expense projections and matching
- AI tool definitions

When adding new pure utility functions, create corresponding test files in `src/lib/__tests__/`.

## Up Bank API

This app integrates with the [Up Bank API](https://developer.up.com.au/). Per Up's acceptable use policy, the API is for personal use only. Each contributor should use their own personal access token for development.

## Questions?

Open an [issue](https://github.com/BenLaurenson/PiggyBack/issues) — happy to help!
