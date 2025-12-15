"use client"

import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const tabsListVariants = cva(
  "inline-flex items-center",
  {
    variants: {
      variant: {
        default: "bg-muted text-muted-foreground h-9 w-fit justify-center rounded-lg p-[3px]",
        underline: "gap-8 border-b border-border bg-transparent w-full justify-start",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const tabsTriggerVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "data-[state=active]:bg-background dark:data-[state=active]:text-foreground dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 text-foreground dark:text-muted-foreground h-[calc(100%-1px)] flex-1 rounded-md border border-transparent px-2 py-1 data-[state=active]:shadow-sm",
        underline: "relative pb-2 font-[family-name:var(--font-nunito)] font-bold text-text-secondary hover:text-text-primary data-[state=active]:text-brand-coral after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:rounded-full after:bg-transparent data-[state=active]:after:bg-brand-coral",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

// Create context to pass variant to children
const TabsVariantContext = React.createContext<"default" | "underline">("default")

function Tabs({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

interface TabsListProps
  extends React.ComponentProps<typeof TabsPrimitive.List>,
    VariantProps<typeof tabsListVariants> {}

function TabsList({
  className,
  variant,
  ...props
}: TabsListProps) {
  return (
    <TabsVariantContext.Provider value={variant ?? "default"}>
      <TabsPrimitive.List
        data-slot="tabs-list"
        className={cn(tabsListVariants({ variant }), className)}
        {...props}
      />
    </TabsVariantContext.Provider>
  )
}

interface TabsTriggerProps
  extends React.ComponentProps<typeof TabsPrimitive.Trigger>,
    VariantProps<typeof tabsTriggerVariants> {}

function TabsTrigger({
  className,
  variant,
  ...props
}: TabsTriggerProps) {
  const contextVariant = React.useContext(TabsVariantContext)
  const resolvedVariant = variant ?? contextVariant

  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(tabsTriggerVariants({ variant: resolvedVariant }), className)}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
export type { TabsListProps, TabsTriggerProps }
