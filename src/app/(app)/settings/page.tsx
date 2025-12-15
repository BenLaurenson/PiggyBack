import { createClient } from "@/utils/supabase/server";
import { Nunito, DM_Sans } from "next/font/google";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  User,
  CreditCard,
  Users,
  Palette,
  Bell,
  Shield,
  ChevronRight,
  DollarSign,
  Sparkles,
} from "lucide-react";
import Link from "next/link";

const nunito = Nunito({
  subsets: ["latin"],
  variable: "--font-nunito",
  weight: ["600", "700", "800"]
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  weight: ["400", "500"]
});

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Fetch user profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user?.id)
    .maybeSingle();

  // Fetch UP API config
  const { data: upConfig } = await supabase
    .from("up_api_configs")
    .select("is_active, last_synced_at")
    .eq("user_id", user?.id)
    .maybeSingle();

  // Fetch partnership info
  const { data: membership } = await supabase
    .from("partnership_members")
    .select(`
      role,
      partnerships (name),
      partnership_id
    `)
    .eq("user_id", user?.id)
    .maybeSingle();

  // Fetch partner count
  const { count: partnerCount } = await supabase
    .from("partnership_members")
    .select("*", { count: "exact", head: true })
    .eq("partnership_id", membership?.partnership_id);

  const settingsGroups = [
    {
      label: "Account",
      items: [
        {
          title: "Profile",
          description: "Manage your account details",
          icon: User,
          href: "/settings/profile",
        },
        {
          title: "Partner",
          description: (partnerCount || 0) > 1 ? "Partner connected" : "Invite or manage your partner",
          icon: Users,
          href: "/settings/partner",
        },
      ],
    },
    {
      label: "Connections & API Keys",
      items: [
        {
          title: "UP Bank Connection",
          description: upConfig?.is_active
            ? `Connected • Last synced ${upConfig.last_synced_at ? new Date(upConfig.last_synced_at).toLocaleDateString() : "never"}`
            : "Connect and sync your UP accounts",
          icon: CreditCard,
          href: "/settings/up-connection",
        },
        {
          title: "AI Assistant",
          description: "Configure PiggyBack AI and API keys",
          icon: Sparkles,
          href: "/settings/ai",
        },
      ],
    },
    {
      label: "Finances",
      items: [
        {
          title: "Income Settings",
          description: "Manage income and payment schedule",
          icon: DollarSign,
          href: "/settings/income",
        },
      ],
    },
    {
      label: "Preferences",
      items: [
        {
          title: "Appearance",
          description: "Theme and display preferences",
          icon: Palette,
          href: "/settings/appearance",
        },
        {
          title: "Notifications",
          description: "Manage notification preferences",
          icon: Bell,
          href: "/settings/notifications",
        },
      ],
    },
    {
      label: "Security",
      items: [
        {
          title: "Privacy & Security",
          description: "Password and security settings",
          icon: Shield,
          href: "/settings/security",
        },
      ],
    },
  ];

  return (
    <div className={`p-4 md:p-6 lg:p-8 max-w-4xl mx-auto ${nunito.variable} ${dmSans.variable}`}>
      {/* Header */}
      <div className="space-y-1 mb-6">
        <h1 className="font-[family-name:var(--font-nunito)] text-3xl font-black text-text-primary">
          Settings
        </h1>
        <p className="font-[family-name:var(--font-dm-sans)] text-text-secondary">
          Manage your account and preferences
        </p>
      </div>

      {/* Profile Card */}
      <Card className="bg-surface-white-60 backdrop-blur-sm border-2 border-border-white-80 shadow-lg mb-6">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={profile?.avatar_url || undefined} />
              <AvatarFallback className="text-lg font-[family-name:var(--font-nunito)] font-bold bg-brand-coral/20 text-brand-coral-hover">
                {profile?.display_name?.charAt(0) || user?.email?.charAt(0) || "U"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <h2 className="font-[family-name:var(--font-nunito)] text-lg font-bold text-text-primary truncate">
                {profile?.display_name || "Set up your profile"}
              </h2>
              <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary truncate">
                {user?.email}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="secondary" className="font-[family-name:var(--font-dm-sans)] text-xs">
                  {membership?.role || "owner"}
                </Badge>
                {(membership?.partnerships as { name?: string } | null)?.name && (
                  <span className="font-[family-name:var(--font-dm-sans)] text-xs text-text-secondary">
                    {(membership?.partnerships as { name?: string })?.name}
                  </span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Settings Sections */}
      <div className="space-y-6">
        {settingsGroups.map((group) => (
          <div key={group.label}>
            <h2 className="font-[family-name:var(--font-nunito)] text-sm font-bold text-text-secondary uppercase tracking-wider mb-2 px-1">
              {group.label}
            </h2>
            <Card className="bg-surface-white-60 backdrop-blur-sm border-2 border-border-white-80 shadow-lg">
              <CardContent className="p-0">
                {group.items.map((section, index) => (
                  <Link key={section.title} href={section.href}>
                    <div className={`flex items-center gap-4 p-4 hover:bg-secondary transition-colors ${
                      index !== group.items.length - 1 ? "border-b border-border" : ""
                    }`}>
                      <div className="p-2 rounded-lg bg-secondary">
                        <section.icon className="h-5 w-5 text-text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-[family-name:var(--font-nunito)] font-bold text-text-primary">
                          {section.title}
                        </p>
                        <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary">
                          {section.description}
                        </p>
                      </div>
                      <ChevronRight className="h-5 w-5 text-text-secondary flex-shrink-0" />
                    </div>
                  </Link>
                ))}
              </CardContent>
            </Card>
          </div>
        ))}

      </div>

      {/* App Info */}
      <div className="text-center font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary space-y-1 mt-8">
        <p>PiggyBack v1.0.0</p>
        <div className="flex items-center justify-center gap-4">
          <Link href="/privacy" className="hover:text-text-primary transition-colors">
            Privacy Policy
          </Link>
          <Link href="/terms" className="hover:text-text-primary transition-colors">
            Terms of Service
          </Link>
        </div>
      </div>
    </div>
  );
}
