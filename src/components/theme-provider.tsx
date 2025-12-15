"use client";

import { useEffect } from "react";

interface ThemeProviderProps {
  defaultTheme?: string;
  children: React.ReactNode;
}

export function ThemeProvider({ defaultTheme = "mint", children }: ThemeProviderProps) {
  useEffect(() => {
    // Load theme from localStorage or use default
    const savedTheme = localStorage.getItem("piggyback-theme") || defaultTheme;

    // Apply theme to document
    const root = document.documentElement;
    root.classList.remove("mint", "light", "dark", "ocean");
    root.classList.add(savedTheme);
  }, [defaultTheme]);

  return <>{children}</>;
}
