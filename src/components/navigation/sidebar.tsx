"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Home,
  Activity,
  Wallet,
  Target,
  LineChart,
  TrendingUp,
  PieChart,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { PiggyBackLogo } from "@/components/branding/piggyback-logo";
import { UserProfileMenu } from "./user-profile-menu";
import dynamic from "next/dynamic";

const NotificationBell = dynamic(
  () => import("@/components/notifications/notification-bell").then((m) => m.NotificationBell),
  { ssr: false }
);

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  { href: "/home", label: "Home", icon: <Home className="h-5 w-5" /> },
  { href: "/activity", label: "Activity", icon: <Activity className="h-5 w-5" /> },
  { href: "/budget", label: "Budget", icon: <Wallet className="h-5 w-5" /> },
  { href: "/analysis", label: "Analysis", icon: <PieChart className="h-5 w-5" /> },
  { href: "/goals", label: "Goals", icon: <Target className="h-5 w-5" /> },
  { href: "/invest", label: "Invest", icon: <LineChart className="h-5 w-5" /> },
  { href: "/plan", label: "Plan", icon: <TrendingUp className="h-5 w-5" /> },
];

interface SidebarProps {
  user?: {
    email?: string;
    display_name?: string;
    avatar_url?: string;
  } | null;
  demoMode?: boolean;
}

export function Sidebar({ user, demoMode = false }: SidebarProps) {
  const pathname = usePathname();

  // Assign pastel colors to each nav item
  const navColors: Record<string, { bg: string; hover: string; active: string; text: string }> = {
    "/home": { bg: 'var(--pastel-coral-light)', hover: 'var(--pastel-coral)', active: 'var(--pastel-coral)', text: 'var(--pastel-coral-dark)' },
    "/activity": { bg: 'var(--pastel-blue-light)', hover: 'var(--pastel-blue)', active: 'var(--pastel-blue)', text: 'var(--pastel-blue-dark)' },
    "/budget": { bg: 'var(--pastel-mint-light)', hover: 'var(--pastel-mint)', active: 'var(--pastel-mint)', text: 'var(--pastel-mint-dark)' },
    "/analysis": { bg: 'var(--pastel-lavender-light)', hover: 'var(--pastel-lavender)', active: 'var(--pastel-lavender)', text: 'var(--pastel-lavender-dark)' },
    "/goals": { bg: 'var(--pastel-yellow-light)', hover: 'var(--pastel-yellow)', active: 'var(--pastel-yellow)', text: 'var(--pastel-yellow-dark)' },
    "/invest": { bg: 'var(--pastel-lavender-light)', hover: 'var(--pastel-lavender)', active: 'var(--pastel-lavender)', text: 'var(--pastel-lavender-dark)' },
    "/plan": { bg: 'var(--pastel-blue-light)', hover: 'var(--pastel-blue)', active: 'var(--pastel-blue)', text: 'var(--pastel-blue-dark)' },
  };

  return (
    <aside
      className={cn(
        "hidden md:flex md:flex-col md:w-64 md:fixed md:left-0 md:bottom-0 border-r",
        demoMode ? "md:top-10" : "md:top-0"
      )}
      style={{
        backgroundColor: 'var(--sidebar)',
        borderColor: 'var(--border)'
      }}
    >
      {/* Logo */}
      <div className="p-6 pb-5">
        <PiggyBackLogo size="default" />
        <p className="font-[family-name:var(--font-dm-sans)] text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
          Personal Finance
        </p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-2 space-y-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const colors = navColors[item.href] || navColors["/home"];

          return (
            <Link
              key={item.href}
              href={item.href}
              className="block group"
            >
              <div
                className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-[family-name:var(--font-nunito)] font-bold text-sm"
                style={{
                  backgroundColor: isActive ? colors.active : 'transparent',
                  color: isActive ? 'white' : colors.text,
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = colors.bg;
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
              >
                {item.icon}
                {item.label}
              </div>
            </Link>
          );
        })}
      </nav>

      {/* User Section */}
      {user && (
        <>
          <Separator />
          <div className="p-4">
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <UserProfileMenu
                  user={{
                    email: user.email || '',
                    displayName: user.display_name
                  }}
                />
              </div>
              <NotificationBell />
            </div>
          </div>
        </>
      )}
    </aside>
  );
}
