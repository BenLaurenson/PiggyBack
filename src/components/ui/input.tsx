import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, autoComplete, ...props }: React.ComponentProps<"input">) {
  // Only apply our autoComplete default when the caller hasn't passed one.
  // The previous default ('current-password' for type=password) was applied
  // unconditionally and got overridden by props spread, but ONLY because of
  // JSX spread order — a footgun. Now if a caller passes autoComplete="off"
  // it actually disables autofill (e.g. Up Bank PAT entry, where password
  // managers offering the user's PiggyBack password is wrong).
  const resolvedAutoComplete =
    autoComplete !== undefined
      ? autoComplete
      : type === "password"
        ? "current-password"
        : type === "email"
          ? "email"
          : undefined;

  return (
    <input
      type={type}
      data-slot="input"
      autoComplete={resolvedAutoComplete}
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Input }
