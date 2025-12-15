"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Activity,
  Wallet,
  Target,
  MoreHorizontal,
} from "lucide-react";
import { MoreMenu, MORE_ROUTES } from "./more-menu";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  { href: "/budget", label: "Budget", icon: <Wallet className="h-5 w-5" /> },
  { href: "/activity", label: "Activity", icon: <Activity className="h-5 w-5" /> },
  { href: "/home", label: "Home", icon: <Home className="h-5 w-5" /> },
  { href: "/goals", label: "Goals", icon: <Target className="h-5 w-5" /> },
];

export function BottomNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const navColors: Record<string, { bg: string; active: string; text: string }> = {
    "/budget": { bg: 'var(--pastel-mint-light)', active: 'var(--pastel-mint)', text: 'var(--pastel-mint-dark)' },
    "/activity": { bg: 'var(--pastel-blue-light)', active: 'var(--pastel-blue)', text: 'var(--pastel-blue-dark)' },
    "/home": { bg: 'var(--pastel-coral-light)', active: 'var(--pastel-coral)', text: 'var(--pastel-coral-dark)' },
    "/goals": { bg: 'var(--pastel-yellow-light)', active: 'var(--pastel-yellow)', text: 'var(--pastel-yellow-dark)' },
  };

  // "More" tab is active when on any of its child routes
  const isMoreActive = MORE_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );

  return (
    <>
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 border-t safe-area-bottom z-50"
        style={{
          backgroundColor: 'var(--sidebar)',
          borderColor: 'var(--border)'
        }}
      >
        <div className="flex items-center justify-around h-16 px-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const colors = navColors[item.href];

            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex flex-col items-center justify-center flex-1 py-2"
              >
                <div
                  className="p-2 rounded-xl transition-all duration-200"
                  style={{
                    backgroundColor: isActive ? colors.active : 'transparent',
                  }}
                >
                  <div style={{ color: isActive ? 'white' : colors.text }}>
                    {item.icon}
                  </div>
                </div>
                <span
                  className="text-[10px] mt-1 font-[family-name:var(--font-nunito)] font-bold"
                  style={{ color: isActive ? colors.text : 'var(--text-tertiary)' }}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}

          {/* More tab */}
          <button
            onClick={() => setMoreOpen(true)}
            className="flex flex-col items-center justify-center flex-1 py-2 cursor-pointer"
          >
            <div
              className="p-2 rounded-xl transition-all duration-200"
              style={{
                backgroundColor: isMoreActive ? 'var(--pastel-lavender)' : 'transparent',
              }}
            >
              <div style={{ color: isMoreActive ? 'white' : 'var(--text-tertiary)' }}>
                <MoreHorizontal className="h-5 w-5" />
              </div>
            </div>
            <span
              className="text-[10px] mt-1 font-[family-name:var(--font-nunito)] font-bold"
              style={{ color: isMoreActive ? 'var(--pastel-lavender-dark)' : 'var(--text-tertiary)' }}
            >
              More
            </span>
          </button>
        </div>
      </nav>

      <MoreMenu open={moreOpen} onOpenChange={setMoreOpen} />
    </>
  );
}
