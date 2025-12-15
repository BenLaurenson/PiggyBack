"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  PieChart,
  LineChart,
  TrendingUp,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";

interface MoreMenuItem {
  href: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
}

const menuItems: MoreMenuItem[] = [
  {
    href: "/analysis",
    label: "Analysis",
    description: "Spending insights",
    icon: <PieChart className="h-5 w-5" />,
    color: "var(--pastel-lavender-dark)",
    bgColor: "var(--pastel-lavender-light)",
  },
  {
    href: "/invest",
    label: "Invest",
    description: "Track investments",
    icon: <LineChart className="h-5 w-5" />,
    color: "var(--pastel-lavender-dark)",
    bgColor: "var(--pastel-lavender-light)",
  },
  {
    href: "/plan",
    label: "Plan",
    description: "Financial planning",
    icon: <TrendingUp className="h-5 w-5" />,
    color: "var(--pastel-blue-dark)",
    bgColor: "var(--pastel-blue-light)",
  },
];

interface MoreMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MoreMenu({ open, onOpenChange }: MoreMenuProps) {
  const pathname = usePathname();
  const router = useRouter();

  const handleNavigate = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" showCloseButton={false} className="rounded-t-2xl px-4 pb-8 pt-2">
        <VisuallyHidden.Root>
          <SheetTitle>More</SheetTitle>
        </VisuallyHidden.Root>

        {/* Drag handle */}
        <div className="flex justify-center py-2">
          <div className="h-1 w-10 rounded-full bg-border" />
        </div>

        <nav className="space-y-1">
          {menuItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <button
                key={item.href}
                onClick={() => handleNavigate(item.href)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-3 transition-colors cursor-pointer"
                style={{
                  backgroundColor: isActive ? item.bgColor : "transparent",
                }}
              >
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-xl"
                  style={{
                    backgroundColor: isActive ? item.color : item.bgColor,
                    color: isActive ? "white" : item.color,
                  }}
                >
                  {item.icon}
                </div>
                <div className="flex-1 text-left">
                  <div
                    className="font-[family-name:var(--font-nunito)] text-sm font-bold"
                    style={{ color: isActive ? item.color : "var(--text-primary)" }}
                  >
                    {item.label}
                  </div>
                  <div className="font-[family-name:var(--font-dm-sans)] text-xs" style={{ color: "var(--text-tertiary)" }}>
                    {item.description}
                  </div>
                </div>
              </button>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
}

/** Routes that live in the "More" menu */
export const MORE_ROUTES = ["/analysis", "/invest", "/plan"];
