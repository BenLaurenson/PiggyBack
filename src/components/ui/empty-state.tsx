"use client"

import * as React from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface EmptyStateProps {
  icon: string
  title: string
  description: string
  action?: {
    label: string
    href?: string
    onClick?: () => void
    icon?: React.ReactNode
    color?: "coral" | "mint" | "blue" | "purple" | "yellow"
  }
  className?: string
  variant?: "card" | "inline"
}

const colorMap = {
  coral: "var(--pastel-coral)",
  mint: "var(--pastel-mint)",
  blue: "var(--pastel-blue)",
  purple: "var(--pastel-purple)",
  yellow: "var(--pastel-yellow)",
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  variant = "card",
}: EmptyStateProps) {
  const content = (
    <div className={cn("text-center", variant === "card" ? "py-16" : "py-8", className)}>
      <div className="text-7xl mb-4">{icon}</div>
      <p className="font-[family-name:var(--font-nunito)] font-bold text-text-primary text-lg mb-2">
        {title}
      </p>
      <p className="font-[family-name:var(--font-dm-sans)] text-text-secondary mb-6">
        {description}
      </p>
      {action && (
        <ActionButton action={action} />
      )}
    </div>
  )

  if (variant === "inline") {
    return content
  }

  return (
    <Card
      className="border-0 shadow-lg"
      style={{ backgroundColor: "var(--surface-elevated)" }}
    >
      <CardContent className="p-0">
        {content}
      </CardContent>
    </Card>
  )
}

function ActionButton({ action }: { action: NonNullable<EmptyStateProps["action"]> }) {
  const buttonContent = (
    <>
      {action.icon}
      {action.label}
    </>
  )

  const buttonStyles = {
    backgroundColor: colorMap[action.color || "blue"],
    color: "white",
  }

  if (action.href) {
    return (
      <a href={action.href}>
        <Button
          className="rounded-xl font-[family-name:var(--font-nunito)] font-bold shadow-lg hover:shadow-xl transition-all hover:scale-105 border-0"
          style={buttonStyles}
        >
          {buttonContent}
        </Button>
      </a>
    )
  }

  return (
    <Button
      onClick={action.onClick}
      className="rounded-xl font-[family-name:var(--font-nunito)] font-bold shadow-lg hover:shadow-xl transition-all hover:scale-105 border-0"
      style={buttonStyles}
    >
      {buttonContent}
    </Button>
  )
}

export { type EmptyStateProps }
