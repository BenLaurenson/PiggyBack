"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Cloud,
  Server,
  Settings,
  Users,
  Shield,
  Menu,
  X,
} from "lucide-react";

const NAV_GROUPS = [
  {
    label: "GETTING STARTED",
    items: [
      { href: "/docs", label: "Overview", icon: BookOpen },
    ],
  },
  {
    label: "DEPLOY",
    items: [
      { href: "/docs/deploy-cloud", label: "Cloud Hosting", icon: Cloud },
      { href: "/docs/deploy-local", label: "Local Hosting", icon: Server },
    ],
  },
  {
    label: "CONFIGURATION",
    items: [
      { href: "/docs/configuration", label: "Configuration", icon: Settings },
    ],
  },
  {
    label: "COMMUNITY",
    items: [
      { href: "/docs/contributing", label: "Contributing", icon: Users },
      { href: "/docs/security", label: "Security", icon: Shield },
    ],
  },
];

export function DocSidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === "/docs") return pathname === "/docs";
    return pathname.startsWith(href);
  };

  const navContent = (
    <nav className="space-y-6 py-6 px-4">
      {NAV_GROUPS.map((group) => (
        <div key={group.label}>
          <p className="font-[family-name:var(--font-nunito)] text-[11px] font-bold text-text-tertiary tracking-wider mb-2 px-3">
            {group.label}
          </p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = isActive(item.href);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors duration-150 ${
                      active
                        ? "bg-brand-coral/10 text-brand-coral border-l-2 border-brand-coral font-semibold"
                        : "text-text-secondary hover:bg-surface-secondary hover:text-text-primary"
                    }`}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span className="font-[family-name:var(--font-dm-sans)]">
                      {item.label}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:block w-60 flex-shrink-0 border-r border-border-light bg-surface/80 min-h-[calc(100vh-57px)] sticky top-[57px]">
        {navContent}
      </aside>

      {/* Mobile toggle button */}
      <div className="md:hidden border-b border-border-light bg-surface/80 px-4 py-2">
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="flex items-center gap-2 text-sm text-text-secondary font-[family-name:var(--font-dm-sans)]"
        >
          {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          Documentation Menu
        </button>
        {mobileOpen && (
          <div className="border-t border-border-light mt-2">
            {navContent}
          </div>
        )}
      </div>
    </>
  );
}
