"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";

const THEME_KEY = "piggyback-theme";
const PREVIOUS_THEME_KEY = "piggyback-previous-theme";
const ALL_THEMES = ["mint", "light", "dark", "ocean"];

export function useThemeToggle() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const current = localStorage.getItem(THEME_KEY) || "mint";
    setIsDark(current === "dark");
  }, []);

  const toggleTheme = useCallback(() => {
    const current = localStorage.getItem(THEME_KEY) || "mint";
    let newTheme: string;

    if (current === "dark") {
      newTheme = localStorage.getItem(PREVIOUS_THEME_KEY) || "mint";
    } else {
      localStorage.setItem(PREVIOUS_THEME_KEY, current);
      newTheme = "dark";
    }

    const root = document.documentElement;
    root.classList.remove(...ALL_THEMES);
    root.classList.add(newTheme);

    localStorage.setItem(THEME_KEY, newTheme);
    setIsDark(newTheme === "dark");

    // Persist to DB (fire-and-forget)
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        supabase
          .from("profiles")
          .update({ theme_preference: newTheme })
          .eq("id", user.id)
          .then(() => {});
      }
    });
  }, []);

  return { isDark, toggleTheme };
}
