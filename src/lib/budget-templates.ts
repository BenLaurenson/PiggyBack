/**
 * Budget Templates
 *
 * Pre-built budget configurations users can choose from when creating
 * a new budget. Each template defines a methodology, budget type,
 * included categories, and layout sections.
 */

export interface BudgetTemplateSection {
  name: string;
  color: string;
  percentage?: number;
  categories: string[];
  /** Specific subcategories to include (format: "Parent::Child"). Overrides parent-level assignment. */
  includeSubcategories?: string[];
  /** Include user's savings goals in this section */
  includeGoals?: boolean;
  /** Include user's investments in this section */
  includeInvestments?: boolean;
}

export interface BudgetTemplate {
  id: string;
  name: string;
  description: string;
  longDescription: string;
  icon: string; // Lucide icon name
  methodology: string;
  budgetType: "personal" | "household" | "custom";
  periodType: "weekly" | "fortnightly" | "monthly";
  sections: BudgetTemplateSection[];
  includedCategories: string[];
  features: string[];
}

// All known parent categories in the PiggyBack system
export const ALL_PARENT_CATEGORIES = [
  "Food & Dining",
  "Housing & Utilities",
  "Transportation",
  "Entertainment & Leisure",
  "Personal Care & Health",
  "Technology & Communication",
  "Family & Education",
  "Pets",
  "Financial & Admin",
  "Gifts & Charity",
  "Miscellaneous",
] as const;

export const BUDGET_TEMPLATES: BudgetTemplate[] = [
  {
    id: "essentials-only",
    name: "Essentials Only",
    description: "Track only what matters most",
    longDescription:
      "A focused budget covering just the essentials: housing, food, transport, and health. Perfect for getting started or keeping things simple.",
    icon: "Home",
    methodology: "zero-based",
    budgetType: "personal",
    periodType: "monthly",
    sections: [
      {
        name: "Essential Spending",
        color: "#60A5FA",
        categories: [
          "Housing & Utilities",
          "Food & Dining",
          "Transportation",
          "Personal Care & Health",
          "Technology & Communication",
        ],
      },
    ],
    includedCategories: [
      "Housing & Utilities",
      "Food & Dining",
      "Transportation",
      "Personal Care & Health",
      "Technology & Communication",
    ],
    features: [
      "24 budget categories",
      "Zero-based methodology",
      "Quick to set up",
    ],
  },
  {
    id: "50-30-20",
    name: "50 / 30 / 20",
    description: "The classic balanced split",
    longDescription:
      "Allocate 50% to needs, 30% to wants, and 20% to savings. A proven framework that works for most income levels.",
    icon: "PieChart",
    methodology: "50-30-20",
    budgetType: "household",
    periodType: "monthly",
    sections: [
      {
        name: "Needs",
        color: "#F87171",
        percentage: 50,
        categories: [
          "Housing & Utilities",
          "Food & Dining",
          "Transportation",
          "Technology & Communication",
          "Personal Care & Health",
          "Family & Education",
          "Pets",
        ],
      },
      {
        name: "Wants",
        color: "#FBBF24",
        percentage: 30,
        categories: [
          "Entertainment & Leisure",
          "Gifts & Charity",
        ],
        includeSubcategories: [
          "Food & Dining::Restaurants & Cafes",
          "Food & Dining::Takeaway",
          "Food & Dining::Booze",
        ],
      },
      {
        name: "Savings",
        color: "#34D399",
        percentage: 20,
        categories: ["Financial & Admin"],
        includeGoals: true,
        includeInvestments: true,
      },
    ],
    includedCategories: [...ALL_PARENT_CATEGORIES],
    features: [
      "All categories included",
      "Percentage-based targets",
      "Great for couples",
    ],
  },
  {
    id: "savings-powerhouse",
    name: "Savings Powerhouse",
    description: "Goals and investments first",
    longDescription:
      "Pay yourself first by prioritising savings goals and investment contributions before allocating to spending categories.",
    icon: "Rocket",
    methodology: "pay-yourself-first",
    budgetType: "personal",
    periodType: "monthly",
    sections: [
      {
        name: "Pay Yourself First",
        color: "#34D399",
        categories: ["Financial & Admin"],
        includeGoals: true,
        includeInvestments: true,
      },
      {
        name: "Fixed Expenses",
        color: "#60A5FA",
        categories: [
          "Housing & Utilities",
          "Technology & Communication",
          "Transportation",
        ],
      },
      {
        name: "Variable Spending",
        color: "#FBBF24",
        categories: [
          "Food & Dining",
          "Personal Care & Health",
          "Entertainment & Leisure",
          "Gifts & Charity",
          "Family & Education",
          "Pets",
        ],
      },
    ],
    includedCategories: [...ALL_PARENT_CATEGORIES],
    features: [
      "Savings prioritised at top",
      "Goals front and centre",
      "Investment tracking",
    ],
  },
  {
    id: "event-fund",
    name: "Event / Holiday Fund",
    description: "Save for something special",
    longDescription:
      "A purpose-built budget for tracking spending on holidays, weddings, or special events. Only includes relevant categories to stay focused.",
    icon: "Palmtree",
    methodology: "envelope",
    budgetType: "custom",
    periodType: "monthly",
    sections: [
      {
        name: "Event Spending",
        color: "#FBBF24",
        categories: [
          "Entertainment & Leisure",
          "Food & Dining",
          "Transportation",
          "Gifts & Charity",
        ],
      },
    ],
    includedCategories: [
      "Entertainment & Leisure",
      "Food & Dining",
      "Transportation",
      "Gifts & Charity",
    ],
    features: [
      "Focused category set",
      "Envelope methodology",
      "Event-specific tracking",
    ],
  },
];

/**
 * Complete parent → subcategory mapping for seeding budget assignments.
 * Sourced from methodology-section-generator.ts (50-30-20 template covers all).
 */
export const CATEGORY_SUBCATEGORIES: Record<string, string[]> = {
  "Food & Dining": [
    "Groceries",
    "Restaurants & Cafes",
    "Takeaway",
    "Booze",
  ],
  "Housing & Utilities": [
    "Rent & Mortgage",
    "Utilities",
    "Internet",
    "Homeware & Appliances",
    "Maintenance & Improvements",
    "Rates & Insurance",
  ],
  Transportation: [
    "Fuel",
    "Parking",
    "Public Transport",
    "Taxis & Share Cars",
    "Car Insurance, Rego & Maintenance",
    "Tolls",
    "Cycling",
    "Repayments",
  ],
  "Entertainment & Leisure": [
    "TV, Music & Streaming",
    "Events & Gigs",
    "Hobbies",
    "Holidays & Travel",
    "Pubs & Bars",
    "Lottery & Gambling",
    "Adult",
    "Tobacco & Vaping",
    "News, Magazines & Books",
    "Apps, Games & Software",
  ],
  "Personal Care & Health": [
    "Health & Medical",
    "Fitness & Wellbeing",
    "Hair & Beauty",
    "Clothing & Accessories",
  ],
  "Technology & Communication": ["Mobile Phone", "Technology"],
  "Family & Education": ["Children & Family", "Education & Student Loans"],
  "Financial & Admin": ["Investments", "Life Admin"],
  Pets: ["Pets"],
  "Gifts & Charity": ["Gifts & Charity"],
  Miscellaneous: ["Miscellaneous"],
};

/**
 * Get subcategory pairs for a set of parent categories.
 * Used by createBudget to seed budget_assignments rows.
 */
export function getSubcategoriesForParents(
  parentCategories: string[]
): { parent: string; child: string }[] {
  return parentCategories.flatMap((parent) => {
    const subs = CATEGORY_SUBCATEGORIES[parent];
    if (!subs) return [];
    return subs.map((child) => ({ parent, child }));
  });
}

