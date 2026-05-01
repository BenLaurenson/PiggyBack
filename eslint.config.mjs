import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
      // React Compiler rules — downgrade to warn, fix incrementally
      "react-hooks/immutability": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/purity": "warn",
    },
  },
  // Orchestrator-only paths must NEVER read or write tenant transaction tables.
  // Per spec docs/superpowers/specs/2026-05-01-01-data-architecture-design.md.
  // If you need partner aggregates, fan out via the stored Supabase OAuth
  // refresh token to the partner's tenant — never store transactions on the
  // orchestrator DB.
  {
    files: [
      "src/app/api/admin/**",
      "src/lib/orchestrator-*.ts",
      "src/lib/provisioner/**",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.property.name='from'][arguments.0.value=/^(transactions|accounts|savings_goals|investments|goal_contributions|investment_contributions|expense_definitions|budgets|tags|tags_canonical|transaction_tags|merchant_category_rules|couple_split_settings)$/]",
          message:
            "Tenant-table reads/writes are forbidden in orchestrator-only paths. Per spec #1 — the orchestrator never holds transaction data. If you need partner aggregates, use the fan-out endpoint via stored OAuth refresh tokens.",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Sub-agent worktrees — each contains its own .next/node_modules.
    ".claude/worktrees/**",
  ]),
]);

export default eslintConfig;
