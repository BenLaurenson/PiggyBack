"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Nunito, DM_Sans } from "next/font/google";
import { createClient } from "@/utils/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft,
  Loader2,
  Save,
  Check,
  Sun,
  Moon,
  Waves,
  Leaf
} from "lucide-react";

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

const themes = [
  {
    id: "mint",
    name: "Mint",
    icon: Leaf,
    description: "Fresh and playful pastel theme",
  },
  {
    id: "light",
    name: "Light",
    icon: Sun,
    description: "Clean and bright",
  },
  {
    id: "dark",
    name: "Dark",
    icon: Moon,
    description: "Easy on the eyes",
  },
  {
    id: "ocean",
    name: "Ocean",
    icon: Waves,
    description: "Cool and calming",
  },
];

export default function AppearancePage() {
  const [currentTheme, setCurrentTheme] = useState("mint");
  const [selectedTheme, setSelectedTheme] = useState("mint");
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    loadTheme();
  }, []);

  const loadTheme = async () => {
    const savedTheme = localStorage.getItem("piggyback-theme");
    if (savedTheme) {
      setCurrentTheme(savedTheme);
      setSelectedTheme(savedTheme);
      applyTheme(savedTheme);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("theme_preference")
      .eq("id", user.id)
      .maybeSingle();

    const theme = profile?.theme_preference || "mint";
    setCurrentTheme(theme);
    setSelectedTheme(theme);
    applyTheme(theme);
    localStorage.setItem("piggyback-theme", theme);
  };

  const applyTheme = (theme: string) => {
    const root = document.documentElement;
    root.classList.remove("mint", "light", "dark", "ocean");
    root.classList.add(theme);
  };

  const handleThemeSelect = (theme: string) => {
    setSelectedTheme(theme);
    applyTheme(theme);
  };

  const handleSaveTheme = async () => {
    setLoading(true);
    setSaved(false);

    try {
      localStorage.setItem("piggyback-theme", selectedTheme);
      setCurrentTheme(selectedTheme);

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from("profiles")
          .update({ theme_preference: selectedTheme })
          .eq("id", user.id);
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error("Failed to save theme:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`p-4 md:p-6 lg:p-8 max-w-4xl mx-auto ${nunito.variable} ${dmSans.variable}`}>
      {/* Header */}
      <div className="space-y-1 mb-6">
        <Link href="/settings" className="text-sm font-[family-name:var(--font-dm-sans)] text-text-secondary hover:text-text-primary flex items-center gap-1 mb-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Settings
        </Link>
        <h1 className="font-[family-name:var(--font-nunito)] text-3xl font-black text-text-primary">
          Appearance
        </h1>
        <p className="font-[family-name:var(--font-dm-sans)] text-text-secondary">
          Customize how PiggyBack looks
        </p>
      </div>

      <Card className="bg-surface-white-60 backdrop-blur-sm border-2 border-border-white-80 shadow-lg">
        <CardContent className="pt-6">
          {saved && (
            <div className="p-4 text-sm bg-accent-teal-light border-2 border-accent-teal-border rounded-xl text-accent-teal mb-6">
              Theme saved successfully!
            </div>
          )}

          <div className="space-y-2 mb-6">
            <Label className="font-[family-name:var(--font-nunito)] font-bold text-text-primary">
              Theme
            </Label>
            <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary">
              Select your preferred color scheme
            </p>
          </div>

          <div className="space-y-3 mb-6">
            {themes.map((theme) => (
              <button
                key={theme.id}
                type="button"
                onClick={() => handleThemeSelect(theme.id)}
                className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all ${
                  selectedTheme === theme.id
                    ? "border-brand-coral bg-brand-coral/5"
                    : "border-border hover:border-border-white-80 hover:bg-secondary"
                }`}
              >
                <div className="p-2 rounded-lg bg-secondary">
                  <theme.icon className="h-5 w-5 text-text-primary" />
                </div>
                <div className="flex-1 text-left">
                  <div className="font-[family-name:var(--font-nunito)] font-bold text-text-primary">
                    {theme.name}
                  </div>
                  <div className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary">
                    {theme.description}
                  </div>
                </div>
                {selectedTheme === theme.id && (
                  <Check className="h-5 w-5 text-brand-coral flex-shrink-0" />
                )}
              </button>
            ))}
          </div>

          <Button
            onClick={handleSaveTheme}
            disabled={loading || selectedTheme === currentTheme}
            className="w-full h-12 rounded-xl font-[family-name:var(--font-nunito)] font-bold bg-brand-coral hover:bg-brand-coral-dark hover:scale-105 transition-all"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : saved ? (
              <>
                <Check className="h-4 w-4 mr-2" />
                Saved!
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Theme
              </>
            )}
          </Button>

          {selectedTheme !== currentTheme && !saved && (
            <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary text-center mt-4">
              Click Save to remember your theme preference
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
