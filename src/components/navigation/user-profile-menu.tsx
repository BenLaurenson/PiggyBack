"use client";

import { useState } from "react";
import { Settings, LogOut, ChevronDown, Sun, Moon } from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useThemeToggle } from "./theme-toggle";

interface UserProfileMenuProps {
  user: {
    email: string;
    displayName?: string;
  };
}

export function UserProfileMenu({ user }: UserProfileMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { isDark, toggleTheme } = useThemeToggle();

  return (
    <div className="relative">
      {/* Profile Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-3 rounded-xl flex items-center gap-3 hover:bg-opacity-80 transition-all"
        style={{ backgroundColor: 'var(--muted)' }}
      >
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center font-[family-name:var(--font-nunito)] font-bold text-lg"
          style={{ backgroundColor: 'var(--pastel-blue)', color: 'white' }}
        >
          {user.displayName?.[0] || user.email[0].toUpperCase()}
        </div>
        <div className="flex-1 text-left min-w-0">
          <p className="font-[family-name:var(--font-nunito)] font-bold text-sm truncate" style={{ color: 'var(--text-primary)' }}>
            {user.displayName || 'User'}
          </p>
          <p className="font-[family-name:var(--font-dm-sans)] text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>
            {user.email}
          </p>
        </div>
        <ChevronDown
          className={`h-4 w-4 transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`}
          style={{ color: 'var(--text-tertiary)' }}
        />
      </button>

      {/* Dropdown Menu */}
      <AnimatePresence>
        {isOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute bottom-full left-0 right-0 mb-2 rounded-xl shadow-lg border overflow-hidden z-50"
              style={{ borderColor: 'var(--border)', backgroundColor: 'var(--background)' }}
            >
              <button
                type="button"
                onClick={() => { toggleTheme(); }}
                className="flex w-full items-center gap-3 px-4 py-3 transition-colors cursor-pointer"
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--muted)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                {isDark ? (
                  <Sun className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
                ) : (
                  <Moon className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
                )}
                <span className="font-[family-name:var(--font-dm-sans)] text-sm" style={{ color: 'var(--text-primary)' }}>
                  {isDark ? "Light mode" : "Dark mode"}
                </span>
              </button>

              <div className="border-t" style={{ borderColor: 'var(--border)' }} />

              <Link
                href="/settings"
                className="flex items-center gap-3 px-4 py-3 transition-colors"
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--muted)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                onClick={() => setIsOpen(false)}
              >
                <Settings className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
                <span className="font-[family-name:var(--font-dm-sans)] text-sm" style={{ color: 'var(--text-primary)' }}>
                  Settings
                </span>
              </Link>

              <div className="border-t" style={{ borderColor: 'var(--border)' }} />

              <form action="/auth/signout" method="post">
                <button
                  type="submit"
                  className="w-full flex items-center gap-3 px-4 py-3 transition-colors text-left"
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--muted)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  <LogOut className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
                  <span className="font-[family-name:var(--font-dm-sans)] text-sm" style={{ color: 'var(--text-primary)' }}>
                    Sign out
                  </span>
                </button>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
