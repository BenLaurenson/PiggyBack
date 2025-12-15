# FIRE (Financial Independence, Retire Early) System

## Overview
PiggyBack includes a comprehensive FIRE calculator tailored for the Australian financial context, supporting four FIRE variants and a two-bucket strategy for super and non-super assets. The system includes a Gameplan engine that generates actionable strategies, savings rate curves, milestone tracking, and what-if analysis.

## FIRE Variants

### Lean FIRE
- Target: 25x annual essential expenses
- Essential expenses classified by `classifySpending()` in `src/lib/fire-spending-classifier.ts`:
  - Essential parents: Housing & Utilities, Transportation, Personal Care & Health, Technology & Communication, Family & Education
  - Essential child overrides: Groceries (essential even if parent is not)
  - Discretionary overrides: Restaurants, Takeaway, Taxis & Share Cars (excluded even if under essential parent)
- Most conservative target

### Regular FIRE
- Target: 25x total annual expenses
- Uses all spending as the base
- Standard FIRE calculation

### Fat FIRE
- Target: 25x total annual expenses x 1.25 (25% buffer)
- Allows for lifestyle inflation in retirement
- Most comfortable target

### Coast FIRE
- Already have enough invested that compound growth will reach regular FIRE by retirement age
- No additional saving required
- Focus: "When can I coast?"

## Australian-Specific Features

### Superannuation Integration
- `super_balance_cents`: Current super balance
- `super_contribution_rate`: Default 11.5% (current SG rate)
- Preservation age: 60 (cannot access super before this)
- Age pension: 67

### Two-Bucket Strategy
1. **Outside-Super Bucket**: Accessible before preservation age (60)
   - Investments, savings, property equity
   - Must fund retirement from FIRE date to age 60
2. **Super Bucket**: Accessible after preservation age (60)
   - Compounding until access
   - Funds retirement from age 60+

### Projection Model
Year-by-year projection considering:
- Current outside-super investments (growing at `outsideSuperReturnRate`, falling back to `expectedReturnRate`)
- Super balance (growing at `expectedReturnRate`)
- Annual contributions (savings rate x income)
- Employer super contributions (SG rate x income)
- Annual income growth (`incomeGrowthRate`)
- Annual spending growth / inflation (`spendingGrowthRate` — also grows the FIRE target)
- Projects until FIRE target reached or age 100 (capped at age 80 for chart data)

## Key Calculations

### FIRE Number
```
fireNumber = annualExpenses x 25  // 4% safe withdrawal rate
```

### Years to FIRE
Solved iteratively: project net worth forward until it exceeds FIRE number.

### Savings Rate
```
savingsRate = (monthlyIncome - monthlyExpenses) / monthlyIncome x 100
```

### Coast FIRE Number
```
coastFireNumber = fireNumber / (1 + returnRate)^yearsToRetirement
```

### What-If Analysis
- `calculateSavingsImpact()` — impact of additional monthly savings on FIRE date
- `calculateIncomeImpact()` — impact of additional monthly income on FIRE date (keeps spending constant, increases savings capacity + super contributions)
- `calculateIncomeMilestones()` — generates 4 income milestones above current income showing FIRE age at each level

## Recommendations
`generateRecommendations()` produces actionable recommendations based on:
- **Coast FIRE achieved** — portfolio exceeds coast target, can stop aggressive saving
- **Low savings rate** (< 20%) — boost savings rate, shows top spending category
- **High savings rate + low income** (>= 50% rate, < $8k/mo) — focus on income growth for higher leverage
- **Income leverage** — concrete impact of a $1k/mo raise on FIRE date and super
- **Salary sacrifice** — tax-advantaged super contributions when only on standard SG rate
- **On track** — positive reinforcement when savings rate >= 20% and no other recommendations apply

## Gameplan Engine (`src/lib/fire-gameplan.ts`)

`generateFireGameplan()` composes FIRE calculation functions to produce a comprehensive actionable gameplan:

- **Status**: on-track / gap / impossible — based on whether projected FIRE age meets target
- **Actions**: primary/secondary/alternative actions (earn more, save-invest, cut spending, switch variant) with binary search to find required amounts
- **Milestones**: coast / lean / regular / fat FIRE with progress tracking and achievement status
- **Coast FIRE data**: current portfolio vs coast number with progress percentage
- **Savings rate curve**: years-to-FIRE at each 10% savings rate increment (10%–80%)
- **Withdrawal rate comparison**: 4% / 3.5% / 3% safe withdrawal rates and corresponding FIRE numbers
- **ETF suggestions**: VAS, VGS, VDHG for Australian investors

## Data Model
FIRE data stored in `profiles` table:
- `date_of_birth` - Age calculations
- `target_retirement_age` - Default 60 (null = "as soon as possible")
- `super_balance_cents` - Current super balance
- `super_contribution_rate` - Default 11.5%
- `expected_return_rate` - Default 7.0% (used for super bucket)
- `outside_super_return_rate` - Separate rate for non-super investments (nullable, falls back to `expected_return_rate`)
- `income_growth_rate` - Annual income growth percentage (e.g. 3.0%)
- `spending_growth_rate` - Annual spending growth / inflation percentage (e.g. 2.0%)
- `fire_variant` - lean/regular/fat/coast
- `annual_expense_override_cents` - Override calculated expenses
- `fire_onboarded` - Setup completion flag

## Plan Page Data Flow

`src/app/(app)/plan/page.tsx` is a server component that:
1. Fetches profile, accounts, transactions (12 months), investments, income sources, net worth snapshots, savings goals, expense definitions, annual checkups, and target allocations
2. Classifies spending via `classifySpending()`
3. Calculates monthly averages and savings rate (prefers frequency-aware income sources over transaction averages)
4. Runs `projectFireDate()` for full FIRE projections
5. Generates recommendations via `generateRecommendations()`
6. Generates gameplan via `generateFireGameplan()`
7. Computes financial health metrics, priority recommendations, super cap room, goal interactions, and rebalancing data
8. Passes everything to `PlanClient` for client-side rendering

## Key Files
- `src/lib/fire-calculations.ts` - Core FIRE math (11 exported functions: calculateAge, calculateAnnualExpenses, calculateFireNumber, calculateTwoBucket, calculateCoastFire, projectFireDate, calculateSavingsImpact, calculateIncomeImpact, calculateIncomeMilestones, generateRecommendations, generateProjectionData)
- `src/lib/fire-gameplan.ts` - Gameplan engine (8 exported functions: generateFireGameplan, findRequiredExtraIncome, findRequiredExtraSavings, computeMilestones, computeCoastFire, computeSavingsRateCurve, computeWithdrawalComparison, getEtfSuggestions)
- `src/lib/fire-spending-classifier.ts` - Essential vs discretionary classification
- `src/app/actions/fire.ts` - FIRE profile update (updateFireProfile server action)
- `src/app/(app)/plan/page.tsx` - Plan page (server component, data orchestration)
- `src/components/plan/plan-client.tsx` - Client-side plan page with tabs
- `src/components/plan/fire-projection-chart.tsx` - Year-by-year projection chart
- `src/components/plan/fire-what-if.tsx` - What-if savings/income impact analysis
- `src/components/plan/fire-gameplan.tsx` - Gameplan UI with actions and milestones
- `src/components/plan/two-bucket-chart.tsx` - Outside-super vs super bucket visualization
- `src/components/plan/fire-setup-prompt.tsx` - FIRE onboarding setup
- `src/components/plan/plan-health-ring.tsx` - Financial health ring visualization
- `src/components/plan/financial-health-snapshot.tsx` - Health metrics dashboard
- `src/components/plan/priority-recommendations.tsx` - Priority recommendation cards
- `src/components/plan/goals-timeline.tsx` - Goals timeline visualization
- `src/components/plan/annual-checkup/checkup-wizard.tsx` - Annual financial checkup wizard
