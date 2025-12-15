"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Nunito, DM_Sans } from "next/font/google";
import { createClient } from "@/utils/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { updateProfile } from "@/app/actions/profile";

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

export default function ProfilePage() {
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    async function loadProfile() {
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        setEmail(user.email || "");

        const { data: profile } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .maybeSingle();

        if (profile) {
          setDisplayName(profile.display_name || "");
          setAvatarUrl(profile.avatar_url || "");
        }
      }

      setLoading(false);
    }

    loadProfile();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const result = await updateProfile({
        display_name: displayName,
        avatar_url: avatarUrl || null,
      });

      if (result.error) {
        setError(result.error);
        setSaving(false);
        return;
      }

      setSuccess(true);
      setSaving(false);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update profile");
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className={`p-4 md:p-6 lg:p-8 max-w-4xl mx-auto ${nunito.variable} ${dmSans.variable}`}>
        <div className="text-center py-12">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-brand-coral" />
        </div>
      </div>
    );
  }

  return (
    <div className={`p-4 md:p-6 lg:p-8 max-w-4xl mx-auto ${nunito.variable} ${dmSans.variable}`}>
      {/* Header */}
      <div className="space-y-1 mb-6">
        <Link href="/settings" className="text-sm font-[family-name:var(--font-dm-sans)] text-text-secondary hover:text-text-primary flex items-center gap-1 mb-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Settings
        </Link>
        <h1 className="font-[family-name:var(--font-nunito)] text-3xl font-black text-text-primary">
          Profile
        </h1>
        <p className="font-[family-name:var(--font-dm-sans)] text-text-secondary">
          Manage your account details
        </p>
      </div>

      <Card className="bg-surface-white-60 backdrop-blur-sm border-2 border-border-white-80 shadow-lg">
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="p-4 text-sm bg-error-light border-2 border-error-border rounded-xl text-error-text">
                {error}
              </div>
            )}

            {success && (
              <div className="p-4 text-sm bg-accent-teal-light border-2 border-accent-teal-border rounded-xl text-accent-teal">
                Profile updated successfully!
              </div>
            )}

            {/* Avatar */}
            <div className="space-y-2">
              <Label className="font-[family-name:var(--font-nunito)] font-bold text-text-primary">
                Avatar
              </Label>
              <div className="flex items-center gap-4">
                <Avatar className="h-20 w-20">
                  <AvatarImage src={avatarUrl || undefined} />
                  <AvatarFallback className="text-2xl font-[family-name:var(--font-nunito)] font-bold bg-brand-coral/20 text-brand-coral-hover">
                    {displayName?.charAt(0) || email?.charAt(0) || "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <Input
                    type="url"
                    placeholder="https://example.com/avatar.jpg"
                    value={avatarUrl}
                    onChange={(e) => setAvatarUrl(e.target.value)}
                    disabled={saving}
                    className="h-12 rounded-xl border-2 font-[family-name:var(--font-dm-sans)]"
                  />
                  <p className="font-[family-name:var(--font-dm-sans)] text-xs text-text-secondary mt-1">
                    Enter an image URL for your avatar
                  </p>
                </div>
              </div>
            </div>

            {/* Display Name */}
            <div className="space-y-2">
              <Label htmlFor="displayName" className="font-[family-name:var(--font-nunito)] font-bold text-text-primary">
                Display Name
              </Label>
              <Input
                id="displayName"
                placeholder="What should we call you?"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                disabled={saving}
                className="h-12 rounded-xl border-2 font-[family-name:var(--font-dm-sans)]"
              />
            </div>

            {/* Email (read-only) */}
            <div className="space-y-2">
              <Label htmlFor="email" className="font-[family-name:var(--font-nunito)] font-bold text-text-primary">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                disabled
                className="h-12 rounded-xl border-2 font-[family-name:var(--font-dm-sans)] bg-secondary"
              />
              <p className="font-[family-name:var(--font-dm-sans)] text-xs text-text-secondary">
                Email cannot be changed
              </p>
            </div>

            {/* Submit */}
            <div className="flex gap-3 pt-4">
              <Button
                type="submit"
                className="flex-1 h-12 rounded-xl font-[family-name:var(--font-nunito)] font-bold bg-brand-coral hover:bg-brand-coral-dark hover:scale-105 transition-all"
                disabled={saving}
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
                disabled={saving}
                className="rounded-xl font-[family-name:var(--font-nunito)] font-bold border-2"
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
