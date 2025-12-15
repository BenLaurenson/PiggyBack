import {
  GitFork,
  Terminal,
  Database,
  Shield,
  Code2,
  FolderTree,
  TestTube2,
  Banknote,
  GitBranch,
  FileCode2,
  MessageSquare,
} from "lucide-react";
import { StepNumber } from "../_components/step-number";
import { CodeBlock } from "../_components/code-block";
import { InfoBox } from "../_components/info-box";

export const metadata = {
  title: "Contributing - PiggyBack Documentation",
  description:
    "How to set up your development environment and contribute to PiggyBack.",
};

export default function ContributingPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "3.5rem" }}>
      {/* Page heading */}
      <section>
        <h1 className="font-[family-name:var(--font-nunito)] text-3xl font-extrabold text-text-primary mb-3 flex items-center gap-3">
          <GitFork className="w-8 h-8 text-brand-coral" />
          Contributing
        </h1>
        <p className="font-[family-name:var(--font-dm-sans)] text-text-secondary text-lg leading-relaxed max-w-2xl">
          Thanks for your interest in contributing to PiggyBack! This guide will
          help you get started.
        </p>
      </section>

      {/* Getting Started */}
      <section>
        <h2 className="font-[family-name:var(--font-nunito)] text-xl font-bold text-text-primary mb-6 flex items-center gap-2">
          <Terminal className="w-5 h-5 text-accent-teal" />
          Getting Started
        </h2>

        <div className="space-y-8">
          {/* Step 1 */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <StepNumber n={1} />
              <h3 className="font-[family-name:var(--font-nunito)] text-lg font-bold text-text-primary">
                Fork &amp; Clone
              </h3>
            </div>
            <div className="ml-11">
              <CodeBlock title="terminal">{`git clone https://github.com/<your-username>/PiggyBack.git
cd PiggyBack
npm install`}</CodeBlock>
            </div>
          </div>

          {/* Step 2 */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <StepNumber n={2} />
              <h3 className="font-[family-name:var(--font-nunito)] text-lg font-bold text-text-primary">
                Set Up Environment Variables
              </h3>
            </div>
            <div className="ml-11 space-y-3">
              <CodeBlock title="terminal">{`cp .env.local.example .env.local`}</CodeBlock>
              <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary">
                Fill in your Supabase project URL, anon key, and a 32-character
                encryption key. See the{" "}
                <a
                  href="https://github.com/BenLaurenson/PiggyBack#getting-started"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-coral hover:underline"
                >
                  README
                </a>{" "}
                for details.
              </p>
            </div>
          </div>

          {/* Step 3 */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <StepNumber n={3} />
              <h3 className="font-[family-name:var(--font-nunito)] text-lg font-bold text-text-primary">
                Set Up the Database
              </h3>
            </div>
            <div className="ml-11">
              <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary">
                Apply the migrations in{" "}
                <code className="bg-white/50 px-1 rounded">
                  supabase/migrations/
                </code>{" "}
                to your Supabase project using the SQL editor or the Supabase
                CLI.
              </p>
            </div>
          </div>

          {/* Step 4 */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <StepNumber n={4} />
              <h3 className="font-[family-name:var(--font-nunito)] text-lg font-bold text-text-primary">
                Enable Git Hooks
              </h3>
            </div>
            <div className="ml-11 space-y-3">
              <CodeBlock title="terminal">{`git config core.hooksPath .githooks`}</CodeBlock>
              <InfoBox>
                This enables the pre-commit hook that uses{" "}
                <a
                  href="https://github.com/gitleaks/gitleaks"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-coral hover:underline"
                >
                  gitleaks
                </a>{" "}
                to prevent accidentally committing secrets. Install it with{" "}
                <code className="bg-white/50 px-1 rounded">
                  brew install gitleaks
                </code>
                .
              </InfoBox>
            </div>
          </div>

          {/* Step 5 */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <StepNumber n={5} />
              <h3 className="font-[family-name:var(--font-nunito)] text-lg font-bold text-text-primary">
                Start the Dev Server
              </h3>
            </div>
            <div className="ml-11 space-y-3">
              <CodeBlock title="terminal">{`npm run dev`}</CodeBlock>
              <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary">
                The app runs at{" "}
                <code className="bg-white/50 px-1 rounded">
                  http://localhost:3005
                </code>
                .
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Development Workflow */}
      <section>
        <h2 className="font-[family-name:var(--font-nunito)] text-xl font-bold text-text-primary mb-4 flex items-center gap-2">
          <GitBranch className="w-5 h-5 text-text-tertiary" />
          Development Workflow
        </h2>

        <ol className="space-y-3 font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary list-decimal list-inside">
          <li>
            Create a feature branch from{" "}
            <code className="bg-white/50 px-1 rounded">main</code>:{" "}
            <code className="bg-white/50 px-1 rounded">
              git checkout -b feature/your-feature
            </code>
          </li>
          <li>Make your changes</li>
          <li>
            Run linting and tests:{" "}
            <code className="bg-white/50 px-1 rounded">npm run lint</code> and{" "}
            <code className="bg-white/50 px-1 rounded">npm run test:run</code>
          </li>
          <li>Commit with a descriptive message</li>
          <li>
            Push and open a Pull Request against{" "}
            <code className="bg-white/50 px-1 rounded">main</code>
          </li>
        </ol>
      </section>

      {/* Code Standards */}
      <section>
        <h2 className="font-[family-name:var(--font-nunito)] text-xl font-bold text-text-primary mb-4 flex items-center gap-2">
          <Code2 className="w-5 h-5 text-text-tertiary" />
          Code Standards
        </h2>

        <ul className="space-y-3 font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary">
          <li className="flex gap-2">
            <span className="text-brand-coral font-bold">&bull;</span>
            <span>
              <strong>TypeScript</strong> — strict mode, no{" "}
              <code className="bg-white/50 px-1 rounded">any</code> unless
              unavoidable
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-brand-coral font-bold">&bull;</span>
            <span>
              <strong>Server Components by default</strong> — only use{" "}
              <code className="bg-white/50 px-1 rounded">
                &quot;use client&quot;
              </code>{" "}
              when interactivity is needed
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-brand-coral font-bold">&bull;</span>
            <span>
              <strong>Naming</strong> — PascalCase for components, camelCase for
              functions/variables, kebab-case for files
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-brand-coral font-bold">&bull;</span>
            <span>
              <strong>Tests required</strong> — new features and bug fixes should
              include tests (Vitest)
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-brand-coral font-bold">&bull;</span>
            <span>
              <strong>RLS for new tables</strong> — every user-facing table must
              have Row Level Security policies
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-brand-coral font-bold">&bull;</span>
            <span>
              <strong>No hardcoded secrets</strong> — use environment variables
              for all credentials
            </span>
          </li>
        </ul>
      </section>

      {/* Project Structure */}
      <section>
        <h2 className="font-[family-name:var(--font-nunito)] text-xl font-bold text-text-primary mb-4 flex items-center gap-2">
          <FolderTree className="w-5 h-5 text-text-tertiary" />
          Project Structure
        </h2>

        <CodeBlock title="project">{`src/
  app/           # Next.js App Router (34 pages, 54 API routes)
  components/    # React components by feature domain (205 files)
  lib/           # Utilities and business logic
  lib/__tests__/ # Vitest test files (43 files, 722+ tests)
  hooks/         # Custom React hooks
  types/         # TypeScript type definitions
  utils/         # Supabase client setup
supabase/
  migrations/    # SQL migration files`}</CodeBlock>
      </section>

      {/* Database Changes */}
      <section>
        <h2 className="font-[family-name:var(--font-nunito)] text-xl font-bold text-text-primary mb-4 flex items-center gap-2">
          <Database className="w-5 h-5 text-text-tertiary" />
          Database Changes
        </h2>

        <ul className="space-y-3 font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary">
          <li className="flex gap-2">
            <span className="text-brand-coral font-bold">&bull;</span>
            <span>
              Create a new migration file in{" "}
              <code className="bg-white/50 px-1 rounded">
                supabase/migrations/
              </code>{" "}
              with the next sequential number
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-brand-coral font-bold">&bull;</span>
            <span>
              Include both the schema change and any necessary RLS policies
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-brand-coral font-bold">&bull;</span>
            <span>
              Test the migration against a fresh Supabase project if possible
            </span>
          </li>
        </ul>
      </section>

      {/* Testing */}
      <section>
        <h2 className="font-[family-name:var(--font-nunito)] text-xl font-bold text-text-primary mb-4 flex items-center gap-2">
          <TestTube2 className="w-5 h-5 text-text-tertiary" />
          Testing
        </h2>

        <CodeBlock title="terminal">{`npm test          # Watch mode
npm run test:run  # Single run`}</CodeBlock>

        <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary mt-4 mb-3">
          Tests use Vitest (43 test files, 722+ tests). Test files live in{" "}
          <code className="bg-white/50 px-1 rounded">
            src/lib/__tests__/
          </code>{" "}
          and cover:
        </p>

        <ul className="space-y-2 font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary">
          <li className="flex gap-2">
            <span className="text-brand-coral font-bold">&bull;</span>
            <span>
              Budget calculations (zero-based, shared budgets, period helpers,
              income frequency)
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-brand-coral font-bold">&bull;</span>
            <span>
              Investment logic (price APIs, portfolio aggregation, FIRE
              calculations)
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-brand-coral font-bold">&bull;</span>
            <span>Expense projections and matching</span>
          </li>
          <li className="flex gap-2">
            <span className="text-brand-coral font-bold">&bull;</span>
            <span>AI tool definitions</span>
          </li>
        </ul>

        <div className="mt-4">
          <InfoBox>
            When adding new pure utility functions, create corresponding test
            files in{" "}
            <code className="bg-white/50 px-1 rounded">
              src/lib/__tests__/
            </code>
            .
          </InfoBox>
        </div>
      </section>

      {/* Up Bank API */}
      <section>
        <h2 className="font-[family-name:var(--font-nunito)] text-xl font-bold text-text-primary mb-4 flex items-center gap-2">
          <Banknote className="w-5 h-5 text-text-tertiary" />
          Up Bank API
        </h2>

        <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary">
          This app integrates with the{" "}
          <a
            href="https://developer.up.com.au/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-coral hover:underline"
          >
            Up Bank API
          </a>
          . Per Up&apos;s acceptable use policy, the API is for personal use
          only. Each contributor should use their own personal access token for
          development.
        </p>
      </section>

      {/* Questions */}
      <section>
        <h2 className="font-[family-name:var(--font-nunito)] text-xl font-bold text-text-primary mb-4 flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-text-tertiary" />
          Questions?
        </h2>

        <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary">
          Open an{" "}
          <a
            href="https://github.com/BenLaurenson/PiggyBack/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-coral hover:underline"
          >
            issue
          </a>{" "}
          — happy to help!
        </p>
      </section>
    </div>
  );
}
