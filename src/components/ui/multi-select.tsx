"use client"

import * as React from "react"
import { useState } from "react"
import { ChevronDown, Check, X } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export interface MultiSelectOption {
  value: string
  label: string
  icon?: React.ReactNode
}

export interface MultiSelectGroup {
  label: string
  options: MultiSelectOption[]
}

interface MultiSelectBaseProps {
  selected: string[]
  onChange: (selected: string[]) => void
  placeholder?: string
  emptyMessage?: string
  className?: string
  maxHeight?: string
  showSelectedBadges?: boolean
  disabled?: boolean
}

interface FlatMultiSelectProps extends MultiSelectBaseProps {
  options: MultiSelectOption[]
  groups?: never
}

interface GroupedMultiSelectProps extends MultiSelectBaseProps {
  options?: never
  groups: MultiSelectGroup[]
}

export type MultiSelectProps = FlatMultiSelectProps | GroupedMultiSelectProps

export function MultiSelect({
  selected,
  onChange,
  placeholder = "Select...",
  emptyMessage = "No options available",
  className,
  maxHeight = "300px",
  showSelectedBadges = false,
  disabled = false,
  ...props
}: MultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false)

  const isGrouped = "groups" in props && props.groups !== undefined
  const options = isGrouped ? undefined : (props as FlatMultiSelectProps).options
  const groups = isGrouped ? (props as GroupedMultiSelectProps).groups : undefined

  // Get all option values for display text calculation
  const getAllOptions = (): MultiSelectOption[] => {
    if (options) return options
    if (groups) return groups.flatMap(g => g.options)
    return []
  }

  const allOptions = getAllOptions()

  const handleToggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter(v => v !== value))
    } else {
      onChange([...selected, value])
    }
  }

  const handleToggleGroup = (group: MultiSelectGroup) => {
    const groupValues = group.options.map(o => o.value)
    const allSelected = groupValues.every(v => selected.includes(v))

    if (allSelected) {
      onChange(selected.filter(v => !groupValues.includes(v)))
    } else {
      const newSelection = [...new Set([...selected, ...groupValues])]
      onChange(newSelection)
    }
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange([])
  }

  const getDisplayText = () => {
    if (selected.length === 0) return placeholder
    if (selected.length === 1) {
      const option = allOptions.find(o => o.value === selected[0])
      return option?.label || selected[0]
    }
    return `${selected.length} selected`
  }

  const getSelectedLabels = () => {
    return selected
      .map(value => allOptions.find(o => o.value === value)?.label || value)
      .slice(0, 3)
  }

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={cn(
          "w-full h-10 px-3 rounded-lg border bg-white flex items-center justify-between font-[family-name:var(--font-dm-sans)] text-sm transition-colors",
          disabled && "opacity-50 cursor-not-allowed",
          !disabled && "hover:border-gray-400"
        )}
        style={{ borderColor: 'var(--border)' }}
      >
        <span className={cn(
          selected.length === 0 && "text-muted-foreground"
        )}>
          {getDisplayText()}
        </span>
        <div className="flex items-center gap-1">
          {selected.length > 0 && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="p-0.5 rounded hover:bg-gray-100 transition-colors"
            >
              <X className="h-3.5 w-3.5" style={{ color: 'var(--text-tertiary)' }} />
            </button>
          )}
          <ChevronDown
            className={cn(
              "h-4 w-4 transition-transform",
              isOpen && "rotate-180"
            )}
            style={{ color: 'var(--text-tertiary)' }}
          />
        </div>
      </button>

      {/* Selected badges (optional) */}
      {showSelectedBadges && selected.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {getSelectedLabels().map((label, idx) => (
            <Badge
              key={idx}
              variant="secondary"
              className="text-xs px-2 py-0.5 cursor-pointer hover:bg-destructive/20"
              onClick={() => {
                const option = allOptions.find(o => o.label === label)
                if (option) handleToggle(option.value)
              }}
            >
              {label}
              <X className="h-3 w-3 ml-1" />
            </Badge>
          ))}
          {selected.length > 3 && (
            <Badge variant="outline" className="text-xs px-2 py-0.5">
              +{selected.length - 3} more
            </Badge>
          )}
        </div>
      )}

      {/* Dropdown */}
      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div
            className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg overflow-hidden z-50"
            style={{ borderColor: 'var(--border)', maxHeight }}
          >
            <div className="overflow-y-auto p-2" style={{ maxHeight }}>
              {/* Flat options */}
              {options && options.length > 0 && (
                <div className="space-y-1">
                  {options.map((option) => (
                    <MultiSelectItem
                      key={option.value}
                      option={option}
                      checked={selected.includes(option.value)}
                      onToggle={() => handleToggle(option.value)}
                    />
                  ))}
                </div>
              )}

              {/* Grouped options */}
              {groups && groups.length > 0 && (
                <div className="space-y-3">
                  {groups.map((group) => {
                    const groupValues = group.options.map(o => o.value)
                    const allSelected = groupValues.every(v => selected.includes(v))
                    const someSelected = groupValues.some(v => selected.includes(v))

                    return (
                      <div key={group.label}>
                        {/* Group header with checkbox */}
                        <div
                          className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer"
                          onClick={() => handleToggleGroup(group)}
                        >
                          <Checkbox
                            checked={someSelected && !allSelected ? "indeterminate" : allSelected}
                            onCheckedChange={() => handleToggleGroup(group)}
                          />
                          <span
                            className="font-[family-name:var(--font-nunito)] font-bold text-sm"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            {group.label}
                          </span>
                        </div>

                        {/* Group items */}
                        <div className="pl-6 space-y-1">
                          {group.options.map((option) => (
                            <MultiSelectItem
                              key={option.value}
                              option={option}
                              checked={selected.includes(option.value)}
                              onToggle={() => handleToggle(option.value)}
                            />
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Empty state */}
              {(!options || options.length === 0) && (!groups || groups.length === 0) && (
                <div className="py-6 text-center">
                  <p
                    className="font-[family-name:var(--font-dm-sans)] text-sm"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    {emptyMessage}
                  </p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function MultiSelectItem({
  option,
  checked,
  onToggle,
}: {
  option: MultiSelectOption
  checked: boolean
  onToggle: () => void
}) {
  return (
    <div
      className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer"
      onClick={onToggle}
    >
      <Checkbox
        checked={checked}
        onCheckedChange={onToggle}
      />
      <label className="font-[family-name:var(--font-dm-sans)] text-sm cursor-pointer flex items-center gap-1.5">
        {option.icon && <span>{option.icon}</span>}
        {option.label}
      </label>
    </div>
  )
}
