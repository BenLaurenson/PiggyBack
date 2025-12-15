"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Check, Plus, Settings, ChevronLeft, ChevronRight, Copy, Info, Sparkles, Home, PieChart, Target, TrendingUp, Search, Bell } from "lucide-react"
import { goeyToast as toast } from "goey-toast"

// ============================================================================
// CURATED BACKGROUND & HOVER SCHEMES
// ============================================================================
// Based on research of pastel web UIs (Revolut, Stripe, Wise, Chime, Linear)
// Keeps your existing accent colors (coral, mint, blue, lavender, purple)
// Only changes: page background, card background, hover/skeleton states
// ============================================================================

interface UIScheme {
  id: string
  name: string
  subtitle: string
  description: string
  inspiration: string
  bestFor: string[]
  colors: {
    pageBackground: string
    cardBackground: string
    hoverAccent: string
    hoverAccentForeground: string
    skeletonColor: string
    sidebarHover: string
    tableRowHover: string
    inputBackground: string
  }
}

const uiSchemes: UIScheme[] = [
  {
    id: "airy-minimal",
    name: "Airy Minimal",
    subtitle: "Nearly White with Subtle Blue Tint",
    description: "Extreme visual restraint with barely perceptible cool undertones. White space and typography establish hierarchy. Maximum clarity for financial data.",
    inspiration: "Inspired by Linear, Stripe dashboard aesthetics",
    bestFor: ["Data-heavy dashboards", "Professional users", "Maximum clarity"],
    colors: {
      pageBackground: "oklch(0.98 0.01 230)",      // Barely perceptible blue tint
      cardBackground: "oklch(1.0 0.0 0)",          // Pure white cards
      hoverAccent: "oklch(0.96 0.015 230)",        // Very subtle blue hover
      hoverAccentForeground: "oklch(0.35 0.02 230)",
      skeletonColor: "oklch(0.95 0.01 230)",       // Light blue-gray skeleton
      sidebarHover: "oklch(0.96 0.01 230)",        // Matching sidebar hover
      tableRowHover: "oklch(0.97 0.01 230)",       // Even subtler for rows
      inputBackground: "oklch(0.99 0.005 230)",    // Barely tinted inputs
    },
  },
  {
    id: "warm-cozy",
    name: "Warm Cozy",
    subtitle: "Soft Cream with Peachy Warmth",
    description: "Inviting warmth that complements your coral accent perfectly. Creates approachability while maintaining professionalism.",
    inspiration: "Inspired by Notion's warm aesthetic, Chime's friendly feel",
    bestFor: ["Consumer apps", "Younger demographics", "Approachable feel"],
    colors: {
      pageBackground: "oklch(0.97 0.02 50)",       // Warm peachy undertone
      cardBackground: "oklch(0.99 0.01 40)",       // Slightly warm white
      hoverAccent: "oklch(0.94 0.025 50)",         // Warm cream hover
      hoverAccentForeground: "oklch(0.35 0.02 50)",
      skeletonColor: "oklch(0.93 0.02 50)",        // Warm skeleton
      sidebarHover: "oklch(0.95 0.02 50)",         // Warm sidebar hover
      tableRowHover: "oklch(0.96 0.015 50)",       // Subtle warm row hover
      inputBackground: "oklch(0.98 0.01 50)",      // Warm input bg
    },
  },
  {
    id: "cool-sophisticated",
    name: "Cool Sophisticated",
    subtitle: "Professional Blue-Gray Foundation",
    description: "Institutional credibility through cool neutrals. Conveys stability and trust - perfect for security-conscious users.",
    inspiration: "Inspired by banking apps, Wise's professional clarity",
    bestFor: ["Security focus", "Older demographics", "Institutional trust"],
    colors: {
      pageBackground: "oklch(0.97 0.015 240)",     // Cool blue-gray
      cardBackground: "oklch(0.99 0.008 240)",     // Very light cool white
      hoverAccent: "oklch(0.94 0.02 240)",         // Cool hover
      hoverAccentForeground: "oklch(0.35 0.02 240)",
      skeletonColor: "oklch(0.93 0.015 240)",      // Cool gray skeleton
      sidebarHover: "oklch(0.95 0.015 240)",       // Cool sidebar hover
      tableRowHover: "oklch(0.96 0.01 240)",       // Subtle cool row hover
      inputBackground: "oklch(0.98 0.008 240)",    // Cool input bg
    },
  },
  {
    id: "pure-clean",
    name: "Pure Clean",
    subtitle: "Maximum White, Neutral Gray Hovers",
    description: "Pure white backgrounds let your pastel accents pop. Neutral gray hovers provide feedback without color distraction.",
    inspiration: "Inspired by Apple's clean aesthetic, Google Material",
    bestFor: ["Vibrant accent colors", "Minimal distractions", "Modern feel"],
    colors: {
      pageBackground: "oklch(0.985 0.0 0)",        // Near-pure white
      cardBackground: "oklch(1.0 0.0 0)",          // Pure white
      hoverAccent: "oklch(0.96 0.0 0)",            // Pure neutral gray hover
      hoverAccentForeground: "oklch(0.40 0.0 0)",
      skeletonColor: "oklch(0.94 0.0 0)",          // Neutral gray skeleton
      sidebarHover: "oklch(0.96 0.0 0)",           // Neutral sidebar hover
      tableRowHover: "oklch(0.97 0.0 0)",          // Very light gray row hover
      inputBackground: "oklch(0.98 0.0 0)",        // Light gray input
    },
  },
  {
    id: "mint-growth",
    name: "Mint Growth",
    subtitle: "Subtle Mint Tint for Financial Wellness",
    description: "Mint undertones suggest growth and positive movement. Perfect match for your mint accent color - creates unified, optimistic feel.",
    inspiration: "Inspired by Robinhood's growth aesthetic, wellness apps",
    bestFor: ["Savings focus", "Goal tracking", "Financial wellness"],
    colors: {
      pageBackground: "oklch(0.97 0.015 155)",     // Subtle mint tint
      cardBackground: "oklch(0.99 0.008 155)",     // Very light mint white
      hoverAccent: "oklch(0.94 0.025 155)",        // Light mint hover
      hoverAccentForeground: "oklch(0.30 0.02 155)",
      skeletonColor: "oklch(0.93 0.02 155)",       // Mint skeleton
      sidebarHover: "oklch(0.95 0.02 155)",        // Mint sidebar hover
      tableRowHover: "oklch(0.96 0.015 155)",      // Subtle mint row hover
      inputBackground: "oklch(0.98 0.01 155)",     // Mint input bg
    },
  },
  {
    id: "elegant-muted",
    name: "Elegant Muted",
    subtitle: "Desaturated Warmth for Premium Feel",
    description: "Sophisticated restraint through desaturation. Projects maturity and premium positioning for discerning users.",
    inspiration: "Inspired by wealth management platforms, premium fintech",
    bestFor: ["Premium features", "Mature audience", "Understated elegance"],
    colors: {
      pageBackground: "oklch(0.975 0.008 60)",     // Very subtle warm
      cardBackground: "oklch(0.99 0.004 60)",      // Near white, hint of warm
      hoverAccent: "oklch(0.95 0.012 60)",         // Muted warm hover
      hoverAccentForeground: "oklch(0.38 0.02 60)",
      skeletonColor: "oklch(0.94 0.01 60)",        // Muted skeleton
      sidebarHover: "oklch(0.96 0.01 60)",         // Muted sidebar hover
      tableRowHover: "oklch(0.97 0.008 60)",       // Very subtle warm row
      inputBackground: "oklch(0.98 0.006 60)",     // Muted input bg
    },
  },
]

export default function AccentPickerPage() {
  const [selectedScheme, setSelectedScheme] = useState<string>("airy-minimal")
  const currentScheme = uiSchemes.find(s => s.id === selectedScheme) || uiSchemes[0]

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    toast.success(`Copied ${label}`)
  }

  const generateCSS = () => {
    const c = currentScheme.colors
    return `/* ${currentScheme.name} - ${currentScheme.subtitle} */
/* Page & Card Backgrounds */
--background: ${c.pageBackground};
--card: ${c.cardBackground};
--surface: ${c.cardBackground};
--surface-elevated: ${c.cardBackground};

/* Hover/Skeleton Accent */
--accent: ${c.hoverAccent};
--accent-foreground: ${c.hoverAccentForeground};

/* Sidebar */
--sidebar: ${c.cardBackground};
--sidebar-accent: ${c.sidebarHover};

/* Input */
--input: ${c.inputBackground};`
  }

  return (
    <div className="p-4 md:p-6 space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="font-[family-name:var(--font-nunito)] text-3xl font-black text-text-primary">
          Background & Hover System
        </h1>
        <p className="font-[family-name:var(--font-dm-sans)] text-text-secondary">
          Research-backed schemes from Revolut, Stripe, Linear, Notion • Keeps your pastel accents
        </p>
      </div>

      {/* Research Info */}
      <Card className="bg-pastel-blue-light/30 border-pastel-blue">
        <CardHeader className="pb-3">
          <CardTitle className="text-pastel-blue-dark flex items-center gap-2">
            <Info className="h-5 w-5" />
            Web UI Research Applied
          </CardTitle>
        </CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="font-medium mb-1">Background Best Practices:</p>
            <ul className="text-text-secondary space-y-1">
              <li>• Off-white reduces eye strain vs pure white</li>
              <li>• Subtle tints create psychological cohesion</li>
              <li>• Card elevation via lightness, not shadows</li>
            </ul>
          </div>
          <div>
            <p className="font-medium mb-1">Hover State Science:</p>
            <ul className="text-text-secondary space-y-1">
              <li>• 200ms transition for optimal feedback</li>
              <li>• ~0.03-0.04 lightness change is ideal</li>
              <li>• Match hover hue to page background</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Scheme Selection */}
      <div className="space-y-4">
        <h2 className="font-[family-name:var(--font-nunito)] text-xl font-bold text-text-primary">
          Choose Your Scheme
        </h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {uiSchemes.map((scheme) => (
            <Card
              key={scheme.id}
              className={`cursor-pointer transition-all ${
                selectedScheme === scheme.id
                  ? "ring-2 ring-pastel-mint shadow-lg"
                  : "hover:shadow-md"
              }`}
              onClick={() => setSelectedScheme(scheme.id)}
            >
              <CardContent className="p-4 space-y-3">
                {/* Color Preview Bar */}
                <div className="flex h-12 rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
                  <div className="flex-1" style={{ backgroundColor: scheme.colors.pageBackground }} title="Page BG" />
                  <div className="flex-1" style={{ backgroundColor: scheme.colors.cardBackground }} title="Card BG" />
                  <div className="flex-1" style={{ backgroundColor: scheme.colors.hoverAccent }} title="Hover" />
                  <div className="flex-1" style={{ backgroundColor: scheme.colors.skeletonColor }} title="Skeleton" />
                </div>

                {/* Info */}
                <div>
                  <h3 className="font-[family-name:var(--font-nunito)] font-bold flex items-center gap-2">
                    {scheme.name}
                    {selectedScheme === scheme.id && <Check className="h-4 w-4 text-pastel-mint-dark" />}
                  </h3>
                  <p className="text-xs text-text-secondary">{scheme.subtitle}</p>
                </div>

                <p className="text-xs text-text-tertiary">{scheme.description}</p>

                <div className="flex flex-wrap gap-1">
                  {scheme.bestFor.map((tag, i) => (
                    <Badge key={i} variant="secondary" className="text-[10px]">{tag}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* ===== LIVE MOCK PAGES ===== */}
      <Card>
        <CardHeader>
          <CardTitle>Live Preview: {currentScheme.name}</CardTitle>
          <CardDescription>{currentScheme.inspiration}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">

          {/* === FULL APP MOCK === */}
          <div>
            <h4 className="text-sm font-medium text-text-secondary mb-3">Full App Layout</h4>
            <div
              className="rounded-xl border overflow-hidden"
              style={{ backgroundColor: currentScheme.colors.pageBackground, borderColor: 'var(--border)' }}
            >
              <div className="flex min-h-[500px]">
                {/* Sidebar */}
                <div
                  className="w-56 p-4 border-r flex flex-col"
                  style={{ backgroundColor: currentScheme.colors.cardBackground, borderColor: 'var(--border)' }}
                >
                  <div className="text-xl font-black text-pastel-coral-dark mb-6">PiggyBack</div>

                  <nav className="space-y-1 flex-1">
                    {[
                      { icon: Home, label: "Dashboard", active: false },
                      { icon: PieChart, label: "Activity", active: false },
                      { icon: Target, label: "Budget", active: true },
                      { icon: TrendingUp, label: "Goals", active: false },
                      { icon: Settings, label: "Settings", active: false },
                    ].map((item) => (
                      <button
                        key={item.label}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                          item.active ? "text-white font-bold" : "text-text-secondary"
                        }`}
                        style={{
                          backgroundColor: item.active ? 'var(--pastel-mint)' : 'transparent',
                        }}
                        onMouseEnter={(e) => {
                          if (!item.active) e.currentTarget.style.backgroundColor = currentScheme.colors.sidebarHover
                        }}
                        onMouseLeave={(e) => {
                          if (!item.active) e.currentTarget.style.backgroundColor = 'transparent'
                        }}
                      >
                        <item.icon className="h-4 w-4" />
                        {item.label}
                      </button>
                    ))}
                  </nav>

                  {/* User */}
                  <div
                    className="flex items-center gap-3 p-3 rounded-lg mt-4 cursor-pointer transition-colors"
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = currentScheme.colors.sidebarHover}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <div className="w-8 h-8 rounded-full bg-pastel-coral flex items-center justify-center text-white text-sm font-bold">
                      B
                    </div>
                    <div className="text-sm">
                      <div className="font-medium">Ben</div>
                      <div className="text-xs text-text-tertiary">Settings</div>
                    </div>
                  </div>
                </div>

                {/* Main Content */}
                <div className="flex-1 p-6">
                  {/* Header */}
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h1 className="text-2xl font-black text-text-primary">Budget</h1>
                      <p className="text-sm text-text-secondary">January 2026</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        className="p-2 rounded-lg transition-colors"
                        style={{ backgroundColor: 'transparent' }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = currentScheme.colors.hoverAccent}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        <Search className="h-5 w-5 text-text-secondary" />
                      </button>
                      <button
                        className="p-2 rounded-lg transition-colors"
                        style={{ backgroundColor: 'transparent' }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = currentScheme.colors.hoverAccent}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        <Bell className="h-5 w-5 text-text-secondary" />
                      </button>
                      <Button
                        className="rounded-xl font-bold text-white border-0"
                        style={{ backgroundColor: 'var(--pastel-coral)' }}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        New Expense
                      </Button>
                    </div>
                  </div>

                  {/* Stats Cards */}
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    {[
                      { label: "To Be Budgeted", value: "$5,556", color: "text-pastel-mint-dark" },
                      { label: "Total Spent", value: "$1,204", color: "text-pastel-coral-dark" },
                      { label: "Budget Health", value: "78%", color: "text-pastel-blue-dark" },
                    ].map((stat) => (
                      <div
                        key={stat.label}
                        className="p-4 rounded-xl border transition-colors cursor-pointer"
                        style={{ backgroundColor: currentScheme.colors.cardBackground, borderColor: 'var(--border)' }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = currentScheme.colors.hoverAccent}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = currentScheme.colors.cardBackground}
                      >
                        <div className="text-xs text-text-tertiary uppercase tracking-wide">{stat.label}</div>
                        <div className={`text-2xl font-black ${stat.color}`}>{stat.value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Budget Table */}
                  <div
                    className="rounded-xl border overflow-hidden"
                    style={{ backgroundColor: currentScheme.colors.cardBackground, borderColor: 'var(--border)' }}
                  >
                    {/* Table Header */}
                    <div
                      className="grid grid-cols-4 gap-4 p-3 text-xs text-text-tertiary uppercase tracking-wide border-b"
                      style={{ borderColor: 'var(--border)' }}
                    >
                      <div>Category</div>
                      <div className="text-right">Assigned</div>
                      <div className="text-right">Spent</div>
                      <div className="text-right">Available</div>
                    </div>

                    {/* Category Header */}
                    <div
                      className="grid grid-cols-4 gap-4 p-3 font-bold text-sm"
                      style={{ backgroundColor: 'var(--pastel-coral-light)' }}
                    >
                      <div>🏠 Needs (50%)</div>
                      <div className="text-right">$2,778</div>
                      <div className="text-right">$1,054</div>
                      <div className="text-right text-pastel-mint-dark">$1,724</div>
                    </div>

                    {/* Table Rows */}
                    {[
                      { name: "Rent & Mortgage", category: "Housing", assigned: "$1,800", spent: "$850", available: "$950" },
                      { name: "Groceries", category: "Food & Dining", assigned: "$600", spent: "$204", available: "$396" },
                      { name: "Utilities", category: "Housing", assigned: "$200", spent: "$0", available: "$200" },
                      { name: "Transport", category: "Auto & Transport", assigned: "$178", spent: "$0", available: "$178" },
                    ].map((row, i) => (
                      <div
                        key={i}
                        className="grid grid-cols-4 gap-4 p-3 text-sm border-t transition-colors cursor-pointer"
                        style={{ borderColor: 'var(--border)' }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = currentScheme.colors.tableRowHover}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        <div>
                          <div className="font-medium">{row.name}</div>
                          <div className="text-xs text-text-tertiary">{row.category}</div>
                        </div>
                        <div className="text-right">{row.assigned}</div>
                        <div className="text-right">{row.spent}</div>
                        <div className="text-right text-pastel-mint-dark font-medium">{row.available}</div>
                      </div>
                    ))}

                    {/* Category Header 2 */}
                    <div
                      className="grid grid-cols-4 gap-4 p-3 font-bold text-sm border-t"
                      style={{ backgroundColor: 'var(--pastel-blue-light)', borderColor: 'var(--border)' }}
                    >
                      <div>💸 Wants (30%)</div>
                      <div className="text-right">$1,667</div>
                      <div className="text-right">$150</div>
                      <div className="text-right text-pastel-mint-dark">$1,517</div>
                    </div>

                    {[
                      { name: "Entertainment", category: "Fun", assigned: "$300", spent: "$22", available: "$278" },
                      { name: "Shopping", category: "Personal", assigned: "$200", spent: "$128", available: "$72" },
                    ].map((row, i) => (
                      <div
                        key={i}
                        className="grid grid-cols-4 gap-4 p-3 text-sm border-t transition-colors cursor-pointer"
                        style={{ borderColor: 'var(--border)' }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = currentScheme.colors.tableRowHover}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        <div>
                          <div className="font-medium">{row.name}</div>
                          <div className="text-xs text-text-tertiary">{row.category}</div>
                        </div>
                        <div className="text-right">{row.assigned}</div>
                        <div className="text-right">{row.spent}</div>
                        <div className="text-right text-pastel-mint-dark font-medium">{row.available}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* === COMPONENT TESTS === */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Buttons & Icons */}
            <div>
              <h4 className="text-sm font-medium text-text-secondary mb-3">Hover Buttons</h4>
              <div
                className="p-4 rounded-xl border"
                style={{ backgroundColor: currentScheme.colors.cardBackground, borderColor: 'var(--border)' }}
              >
                <div className="flex flex-wrap gap-3 mb-4">
                  <button
                    className="px-4 py-2 rounded-lg text-sm font-medium transition-colors border"
                    style={{ backgroundColor: 'transparent', borderColor: 'var(--border)' }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = currentScheme.colors.hoverAccent}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    Outline Button
                  </button>
                  <button
                    className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    style={{ backgroundColor: 'transparent' }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = currentScheme.colors.hoverAccent}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    Ghost Button
                  </button>
                </div>
                <div className="flex gap-2">
                  {[Settings, Plus, ChevronLeft, ChevronRight, Search, Bell].map((Icon, i) => (
                    <button
                      key={i}
                      className="p-2 rounded-lg transition-colors"
                      style={{ backgroundColor: 'transparent' }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = currentScheme.colors.hoverAccent}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <Icon className="h-5 w-5 text-text-secondary" />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Skeleton Loading */}
            <div>
              <h4 className="text-sm font-medium text-text-secondary mb-3">Skeleton Loading</h4>
              <div
                className="p-4 rounded-xl border"
                style={{ backgroundColor: currentScheme.colors.cardBackground, borderColor: 'var(--border)' }}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="h-12 w-12 rounded-full animate-pulse"
                    style={{ backgroundColor: currentScheme.colors.skeletonColor }}
                  />
                  <div className="space-y-2 flex-1">
                    <div
                      className="h-4 w-3/4 rounded animate-pulse"
                      style={{ backgroundColor: currentScheme.colors.skeletonColor }}
                    />
                    <div
                      className="h-3 w-1/2 rounded animate-pulse"
                      style={{ backgroundColor: currentScheme.colors.skeletonColor }}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <div
                    className="h-3 w-full rounded animate-pulse"
                    style={{ backgroundColor: currentScheme.colors.skeletonColor }}
                  />
                  <div
                    className="h-3 w-5/6 rounded animate-pulse"
                    style={{ backgroundColor: currentScheme.colors.skeletonColor }}
                  />
                  <div
                    className="h-3 w-4/6 rounded animate-pulse"
                    style={{ backgroundColor: currentScheme.colors.skeletonColor }}
                  />
                </div>
              </div>
            </div>

            {/* Input Fields */}
            <div>
              <h4 className="text-sm font-medium text-text-secondary mb-3">Form Inputs</h4>
              <div
                className="p-4 rounded-xl border space-y-3"
                style={{ backgroundColor: currentScheme.colors.cardBackground, borderColor: 'var(--border)' }}
              >
                <input
                  type="text"
                  placeholder="Search transactions..."
                  className="w-full px-3 py-2 rounded-lg border text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-pastel-mint"
                  style={{
                    backgroundColor: currentScheme.colors.inputBackground,
                    borderColor: 'var(--border)',
                  }}
                />
                <input
                  type="text"
                  placeholder="Enter amount..."
                  className="w-full px-3 py-2 rounded-lg border text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-pastel-mint"
                  style={{
                    backgroundColor: currentScheme.colors.inputBackground,
                    borderColor: 'var(--border)',
                  }}
                />
              </div>
            </div>

            {/* Transaction List */}
            <div>
              <h4 className="text-sm font-medium text-text-secondary mb-3">Activity List</h4>
              <div
                className="rounded-xl border overflow-hidden"
                style={{ backgroundColor: currentScheme.colors.cardBackground, borderColor: 'var(--border)' }}
              >
                {[
                  { name: "Woolworths", amount: "-$124.50", cat: "Groceries" },
                  { name: "Salary Deposit", amount: "+$5,556.00", cat: "Income" },
                  { name: "Netflix", amount: "-$22.99", cat: "Entertainment" },
                ].map((tx, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-3 border-b last:border-b-0 transition-colors cursor-pointer"
                    style={{ borderColor: 'var(--border)' }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = currentScheme.colors.tableRowHover}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <div>
                      <div className="font-medium text-sm">{tx.name}</div>
                      <div className="text-xs text-text-tertiary">{tx.cat}</div>
                    </div>
                    <div className={`font-bold text-sm ${tx.amount.startsWith('+') ? 'text-pastel-mint-dark' : 'text-pastel-coral-dark'}`}>
                      {tx.amount}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Export */}
      <Card className="border-pastel-mint bg-pastel-mint-light/30">
        <CardHeader>
          <CardTitle className="text-pastel-mint-dark flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Export: {currentScheme.name}
          </CardTitle>
          <CardDescription>CSS variables for your globals.css .mint theme</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Color breakdown */}
          <div className="grid grid-cols-4 gap-3 mb-4">
            {[
              { label: "Page BG", color: currentScheme.colors.pageBackground },
              { label: "Card BG", color: currentScheme.colors.cardBackground },
              { label: "Hover", color: currentScheme.colors.hoverAccent },
              { label: "Skeleton", color: currentScheme.colors.skeletonColor },
            ].map((item) => (
              <button
                key={item.label}
                className="p-2 rounded-lg border hover:shadow-md transition-shadow text-left"
                style={{ borderColor: 'var(--border)' }}
                onClick={() => copyToClipboard(item.color, item.label)}
              >
                <div className="h-8 rounded mb-1" style={{ backgroundColor: item.color }} />
                <div className="text-xs font-medium">{item.label}</div>
                <div className="text-[10px] font-mono text-text-tertiary truncate">{item.color}</div>
              </button>
            ))}
          </div>

          {/* CSS Output */}
          <div className="p-4 bg-gray-900 rounded-lg">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs text-gray-400">globals.css .mint theme</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-gray-400 hover:text-white"
                onClick={() => copyToClipboard(generateCSS(), "CSS variables")}
              >
                <Copy className="h-3 w-3 mr-1" />
                Copy All
              </Button>
            </div>
            <pre className="text-sm text-green-400 font-mono whitespace-pre-wrap">
              {generateCSS()}
            </pre>
          </div>

          <p className="text-sm text-text-secondary mt-4">
            Tell me which scheme you like and I&apos;ll apply it to your app!
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
