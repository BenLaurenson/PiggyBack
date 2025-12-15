"use client"

import { useState } from "react"
import { goeyToast as toast } from "goey-toast"
import { Plus, RefreshCw, Settings, Trash2, Check, X, Info, AlertTriangle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Label } from "@/components/ui/label"
import { EmptyState } from "@/components/ui/empty-state"
import { MultiSelect } from "@/components/ui/multi-select"

export default function ComponentShowcasePage() {
  const [loading, setLoading] = useState(false)
  const [nativeChecked, setNativeChecked] = useState(false)
  const [shadcnChecked, setShadcnChecked] = useState(false)
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([])
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])

  const handleLoading = () => {
    setLoading(true)
    setTimeout(() => setLoading(false), 2000)
  }

  return (
    <div className="p-4 md:p-6 space-y-8">
      <div className="space-y-2">
        <h1 className="font-[family-name:var(--font-nunito)] text-3xl font-black text-text-primary">
          Component Showcase
        </h1>
        <p className="font-[family-name:var(--font-dm-sans)] text-text-secondary">
          Visual comparison of all UI components for audit purposes
        </p>
      </div>

      {/* Buttons Section */}
      <Card>
        <CardHeader>
          <CardTitle>Buttons</CardTitle>
          <CardDescription>All button variants and states</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Standard Variants */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-text-secondary">Standard Variants</h4>
            <div className="flex flex-wrap gap-3">
              <Button variant="default">Default</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="link">Link</Button>
              <Button variant="destructive">Destructive</Button>
            </div>
          </div>

          {/* Pastel Color Buttons */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-text-secondary">Pastel Themed Buttons</h4>
            <div className="flex flex-wrap gap-3">
              <Button
                className="rounded-xl font-[family-name:var(--font-nunito)] font-bold shadow-lg hover:shadow-xl transition-all hover:scale-105 border-0"
                style={{ backgroundColor: 'var(--pastel-purple)', color: 'white' }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Goals Style
              </Button>
              <Button
                className="rounded-xl font-[family-name:var(--font-nunito)] font-bold shadow-lg hover:shadow-xl transition-all hover:scale-105 border-0"
                style={{ backgroundColor: 'var(--pastel-blue)', color: 'white' }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Invest Style
              </Button>
              <Button
                className="rounded-xl font-[family-name:var(--font-nunito)] font-bold shadow-lg hover:shadow-xl transition-all hover:scale-105 border-0"
                style={{ backgroundColor: 'var(--pastel-mint)', color: 'white' }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Mint Style
              </Button>
            </div>
          </div>

          {/* Sizes */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-text-secondary">Sizes</h4>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm">Small</Button>
              <Button size="default">Default</Button>
              <Button size="lg">Large</Button>
              <Button size="icon"><Settings className="h-4 w-4" /></Button>
              <Button size="icon-sm"><Settings className="h-4 w-4" /></Button>
            </div>
          </div>

          {/* States */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-text-secondary">States</h4>
            <div className="flex flex-wrap gap-3">
              <Button disabled>Disabled</Button>
              <Button onClick={handleLoading} disabled={loading}>
                {loading && <RefreshCw className="h-4 w-4 animate-spin" />}
                {loading ? "Loading..." : "Click to Load"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Toast Section */}
      <Card>
        <CardHeader>
          <CardTitle>Toast Notifications (Sonner)</CardTitle>
          <CardDescription>Global toast system - click to test</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => toast.success("Success! Operation completed.")}>
              <Check className="h-4 w-4 mr-2" />
              Success Toast
            </Button>
            <Button variant="outline" onClick={() => toast.error("Error! Something went wrong.")}>
              <X className="h-4 w-4 mr-2" />
              Error Toast
            </Button>
            <Button variant="outline" onClick={() => toast.warning("Warning! Please review.")}>
              <AlertTriangle className="h-4 w-4 mr-2" />
              Warning Toast
            </Button>
            <Button variant="outline" onClick={() => toast.info("Info: Here's some information.")}>
              <Info className="h-4 w-4 mr-2" />
              Info Toast
            </Button>
            <Button variant="outline" onClick={() => toast.info("Loading...", { duration: 2000 })}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Loading Toast
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tabs Variants */}
      <Card>
        <CardHeader>
          <CardTitle>Tabs</CardTitle>
          <CardDescription>Standardized tab variants (RESOLVED)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Default Variant (Pill Style) */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-text-secondary">Default Variant (Used in /plan)</h4>
            <Tabs defaultValue="tab1" className="w-full">
              <TabsList>
                <TabsTrigger value="tab1">Tab One</TabsTrigger>
                <TabsTrigger value="tab2">Tab Two</TabsTrigger>
                <TabsTrigger value="tab3">Tab Three</TabsTrigger>
              </TabsList>
              <TabsContent value="tab1" className="p-4 bg-surface-elevated rounded-lg mt-2">
                Content for Tab One
              </TabsContent>
              <TabsContent value="tab2" className="p-4 bg-surface-elevated rounded-lg mt-2">
                Content for Tab Two
              </TabsContent>
              <TabsContent value="tab3" className="p-4 bg-surface-elevated rounded-lg mt-2">
                Content for Tab Three
              </TabsContent>
            </Tabs>
          </div>

          {/* Underline Variant */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-text-secondary">Underline Variant (Used in /budget)</h4>
            <Tabs defaultValue="my-budget" className="w-full">
              <TabsList variant="underline">
                <TabsTrigger value="my-budget">My Budget</TabsTrigger>
                <TabsTrigger value="our-budget">Our Budget</TabsTrigger>
                <TabsTrigger value="forecast">Forecast</TabsTrigger>
              </TabsList>
              <TabsContent value="my-budget" className="p-4 bg-surface-elevated rounded-lg mt-2">
                My Budget content
              </TabsContent>
              <TabsContent value="our-budget" className="p-4 bg-surface-elevated rounded-lg mt-2">
                Our Budget content
              </TabsContent>
              <TabsContent value="forecast" className="p-4 bg-surface-elevated rounded-lg mt-2">
                Forecast content
              </TabsContent>
            </Tabs>
          </div>
        </CardContent>
      </Card>

      {/* Checkbox Comparison */}
      <Card>
        <CardHeader>
          <CardTitle>Checkbox Comparison</CardTitle>
          <CardDescription>Native HTML vs shadcn Checkbox (INCONSISTENCY)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Native Checkbox (Current Activity Filter Style) */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-text-secondary">Native HTML Checkbox (Used in /activity filters) - NEEDS STANDARDIZATION</h4>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={nativeChecked}
                onChange={(e) => setNativeChecked(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                style={{ accentColor: 'var(--pastel-mint)' }}
              />
              <span className="text-sm">Include transfers</span>
            </div>
          </div>

          {/* shadcn Checkbox */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-text-secondary">shadcn Checkbox (RECOMMENDED)</h4>
            <div className="flex items-center gap-2">
              <Checkbox
                id="shadcn-checkbox"
                checked={shadcnChecked}
                onCheckedChange={(checked) => setShadcnChecked(checked as boolean)}
              />
              <Label htmlFor="shadcn-checkbox">Include transfers</Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Input Section */}
      <Card>
        <CardHeader>
          <CardTitle>Inputs</CardTitle>
          <CardDescription>Text, number, and date inputs</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Text Input</Label>
              <Input type="text" placeholder="Enter text..." />
            </div>
            <div className="space-y-2">
              <Label>Number Input</Label>
              <Input type="number" placeholder="0.00" />
            </div>
            <div className="space-y-2">
              <Label>Date Input (Native)</Label>
              <Input type="date" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Select Section */}
      <Card>
        <CardHeader>
          <CardTitle>Select</CardTitle>
          <CardDescription>Dropdown selections</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>shadcn Select</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select an option" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="option1">Option 1</SelectItem>
                  <SelectItem value="option2">Option 2</SelectItem>
                  <SelectItem value="option3">Option 3</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Small Select</Label>
              <Select>
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="Small select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="option1">Option 1</SelectItem>
                  <SelectItem value="option2">Option 2</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Multi-Select Section */}
      <Card>
        <CardHeader>
          <CardTitle>Multi-Select</CardTitle>
          <CardDescription>Multi-selection dropdowns with flat and grouped options</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Flat Options */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-text-secondary">Flat Options</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Select Accounts</Label>
                <MultiSelect
                  options={[
                    { value: "acc1", label: "Spending Account" },
                    { value: "acc2", label: "Savings Account" },
                    { value: "acc3", label: "Bills Account" },
                    { value: "acc4", label: "Emergency Fund" },
                  ]}
                  selected={selectedAccounts}
                  onChange={setSelectedAccounts}
                  placeholder="All Accounts"
                />
              </div>
              <div className="space-y-2">
                <Label>With Selected Badges</Label>
                <MultiSelect
                  options={[
                    { value: "2023", label: "2023" },
                    { value: "2024", label: "2024" },
                    { value: "2025", label: "2025" },
                  ]}
                  selected={selectedAccounts}
                  onChange={setSelectedAccounts}
                  placeholder="All Years"
                  showSelectedBadges
                />
              </div>
            </div>
          </div>

          {/* Grouped Options */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-text-secondary">Grouped Options (Hierarchical)</h4>
            <div className="max-w-md">
              <Label>Select Categories</Label>
              <MultiSelect
                groups={[
                  {
                    label: "🍔 Food & Drink",
                    options: [
                      { value: "groceries", label: "Groceries" },
                      { value: "restaurants", label: "Restaurants" },
                      { value: "coffee", label: "Coffee" },
                    ],
                  },
                  {
                    label: "🚗 Transport",
                    options: [
                      { value: "fuel", label: "Fuel" },
                      { value: "public", label: "Public Transport" },
                      { value: "parking", label: "Parking" },
                    ],
                  },
                  {
                    label: "🏠 Home",
                    options: [
                      { value: "rent", label: "Rent" },
                      { value: "utilities", label: "Utilities" },
                      { value: "maintenance", label: "Maintenance" },
                    ],
                  },
                ]}
                selected={selectedCategories}
                onChange={setSelectedCategories}
                placeholder="All Categories"
                maxHeight="350px"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Badges Section */}
      <Card>
        <CardHeader>
          <CardTitle>Badges</CardTitle>
          <CardDescription>Status indicators and labels</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Badge variant="default">Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="outline">Outline</Badge>
            <Badge variant="destructive">Destructive</Badge>
            {/* Clickable badge (filter chip style) */}
            <Badge
              className="cursor-pointer hover:bg-destructive/20 transition-colors flex items-center gap-1"
              onClick={() => toast.info("Badge clicked!")}
            >
              Clickable Filter
              <X className="h-3 w-3" />
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Progress Section */}
      <Card>
        <CardHeader>
          <CardTitle>Progress</CardTitle>
          <CardDescription>Progress indicators</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Default (25%)</span>
              <span>25%</span>
            </div>
            <Progress value={25} />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>With custom color (75%)</span>
              <span>75%</span>
            </div>
            <Progress value={75} indicatorColor="bg-pastel-mint" />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Warning state (90%)</span>
              <span>90%</span>
            </div>
            <Progress value={90} indicatorColor="bg-pastel-coral" />
          </div>
        </CardContent>
      </Card>

      {/* Switch Section */}
      <Card>
        <CardHeader>
          <CardTitle>Switch</CardTitle>
          <CardDescription>Toggle switches</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch id="switch1" />
              <Label htmlFor="switch1">Enable feature</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="switch2" defaultChecked />
              <Label htmlFor="switch2">Enabled by default</Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Skeleton Section */}
      <Card>
        <CardHeader>
          <CardTitle>Skeleton</CardTitle>
          <CardDescription>Loading placeholders</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <Skeleton className="h-12 w-12 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-[200px]" />
                <Skeleton className="h-4 w-[150px]" />
              </div>
            </div>
            <Skeleton className="h-[100px] w-full rounded-xl" />
          </div>
        </CardContent>
      </Card>

      {/* Dialog Section */}
      <Card>
        <CardHeader>
          <CardTitle>Dialogs</CardTitle>
          <CardDescription>Modal dialogs and confirmations</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline">Open Dialog</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Dialog Title</DialogTitle>
                  <DialogDescription>
                    This is a standard dialog using shadcn/Radix. It has proper focus trap and keyboard navigation.
                  </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                  <p className="text-sm text-text-secondary">Dialog content goes here.</p>
                </div>
              </DialogContent>
            </Dialog>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">Delete Action</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete your data.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => toast.success("Deleted!")}>
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>

      {/* Card Padding Comparison */}
      <Card>
        <CardHeader>
          <CardTitle>Card Padding Comparison</CardTitle>
          <CardDescription>Different CardContent padding patterns (INCONSISTENCY)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">p-4 (default)</CardTitle>
              </CardHeader>
              <CardContent className="p-4 bg-pastel-mint/20 rounded">
                Content
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">pt-4 only</CardTitle>
              </CardHeader>
              <CardContent className="pt-4 bg-pastel-blue/20 rounded">
                Content
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">pt-6</CardTitle>
              </CardHeader>
              <CardContent className="pt-6 bg-pastel-purple/20 rounded">
                Content
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">p-0 (none)</CardTitle>
              </CardHeader>
              <CardContent className="p-0 bg-pastel-coral/20 rounded">
                Content
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      {/* Page Padding */}
      <Card>
        <CardHeader>
          <CardTitle>Page Padding</CardTitle>
          <CardDescription>Standardized page container padding (RESOLVED)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="border rounded-lg overflow-hidden">
            <div className="bg-text-secondary/10 text-xs p-2 font-mono">
              p-4 md:p-6 space-y-6 (all pages)
            </div>
            <div className="p-4 md:p-6 bg-pastel-mint/10 min-h-[100px]">
              Standard page padding - now consistent across all routes
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Empty State */}
      <Card>
        <CardHeader>
          <CardTitle>Empty State</CardTitle>
          <CardDescription>Reusable empty state component for zero-data scenarios</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-text-secondary">Card Variant (default)</h4>
            <EmptyState
              icon="🎯"
              title="No goals yet"
              description="Start saving towards something special"
              action={{
                label: "Create Your First Goal",
                icon: <Plus className="h-4 w-4 mr-2" />,
                href: "/goals/new",
                color: "purple",
              }}
            />
          </div>

          <div className="space-y-2">
            <h4 className="text-sm font-medium text-text-secondary">Inline Variant (no card wrapper)</h4>
            <div className="border rounded-lg" style={{ borderColor: 'var(--border)' }}>
              <EmptyState
                variant="inline"
                icon="📊"
                title="No data found"
                description="Try adjusting your filters"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <Card className="border-pastel-mint">
        <CardHeader>
          <CardTitle className="text-pastel-mint-dark">Audit Status</CardTitle>
          <CardDescription>Progress on identified inconsistencies</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Resolved Issues */}
          <div>
            <h4 className="text-sm font-medium text-pastel-mint-dark mb-2">Resolved</h4>
            <ul className="space-y-1.5 text-sm">
              <li className="flex items-start gap-2">
                <span className="text-pastel-mint-dark">✓</span>
                <span><strong>Tabs:</strong> Now using unified Tabs component with underline variant</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-pastel-mint-dark">✓</span>
                <span><strong>Checkboxes:</strong> All using shadcn Checkbox (including activity filters)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-pastel-mint-dark">✓</span>
                <span><strong>Gradients:</strong> Removed - all buttons now use solid pastel colors</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-pastel-mint-dark">✓</span>
                <span><strong>Toast System:</strong> Unified on Sonner for all notifications</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-pastel-mint-dark">✓</span>
                <span><strong>Custom Modals:</strong> Refactored to use Dialog with proper accessibility</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-pastel-mint-dark">✓</span>
                <span><strong>Page Padding:</strong> All routes now use p-4 md:p-6 space-y-6</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-pastel-mint-dark">✓</span>
                <span><strong>Component Naming:</strong> AutoDetectExpensesSheet renamed to AutoDetectExpensesDialog</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-pastel-mint-dark">✓</span>
                <span><strong>Empty State:</strong> Reusable EmptyState component for zero-data scenarios</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-pastel-mint-dark">✓</span>
                <span><strong>Multi-Select:</strong> Reusable component with flat and grouped options support</span>
              </li>
            </ul>
          </div>

          {/* Remaining Issues */}
          <div>
            <h4 className="text-sm font-medium text-pastel-coral-dark mb-2">Remaining (Low Priority)</h4>
            <ul className="space-y-1.5 text-sm">
              <li className="flex items-start gap-2">
                <span className="text-pastel-coral-dark font-bold">•</span>
                <span><strong>CardContent Padding:</strong> Varies between pt-4, pt-6, p-4, p-0 (intentional per context)</span>
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
