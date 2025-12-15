"use client";

import { User, Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import dynamic from "next/dynamic";

const NotificationBell = dynamic(
  () => import("@/components/notifications/notification-bell").then((m) => m.NotificationBell),
  { ssr: false }
);
import { useThemeToggle } from "./theme-toggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Link from "next/link";

interface AppHeaderProps {
  user?: {
    email?: string;
    display_name?: string;
    avatar_url?: string;
  } | null;
  title?: string;
}

export function AppHeader({ user, title }: AppHeaderProps) {
  const { isDark, toggleTheme } = useThemeToggle();

  const handleSignOut = async () => {
    const form = document.createElement("form");
    form.method = "POST";
    form.action = "/auth/signout";
    document.body.appendChild(form);
    form.submit();
  };

  return (
    <header className="md:hidden sticky top-0 z-40 bg-background/80 backdrop-blur-lg border-b">
      <div className="flex items-center justify-between h-14 px-4">
        {/* Logo / Title */}
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/favicon.ico"
            alt="PiggyBack"
            width={24}
            height={24}
            className="flex-shrink-0"
          />
          <span className="font-[family-name:var(--font-nunito)] font-bold text-lg" style={{ color: 'var(--text-primary)' }}>
            {title || "PiggyBack"}
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          <NotificationBell />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={user?.avatar_url || undefined} />
                  <AvatarFallback>
                    {user?.display_name?.charAt(0) || user?.email?.charAt(0) || <User className="h-4 w-4" />}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span>{user?.display_name || "User"}</span>
                    <span className="text-xs font-normal text-muted-foreground">
                      {user?.email}
                    </span>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleTheme(); }}
                    className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-accent cursor-pointer transition-colors"
                    aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
                  >
                    {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                  </button>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/settings">Settings</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/settings/profile">Profile</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut}>
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
