"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User, Loader2 } from "lucide-react";
import { updateProfile } from "@/app/actions/profile";

interface ProfileStepProps {
  userId: string;
  existingDisplayName: string;
  onNext: () => void;
}

export function ProfileStep({ userId, existingDisplayName, onNext }: ProfileStepProps) {
  const [displayName, setDisplayName] = useState(existingDisplayName);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!displayName.trim()) {
      setError("Please enter your name");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await updateProfile({ display_name: displayName.trim() });
      if (result.error) throw new Error(result.error);
      onNext();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save profile");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="p-4 rounded-full w-16 h-16 mx-auto flex items-center justify-center" style={{ backgroundColor: "var(--pastel-blue-light)" }}>
          <User className="h-8 w-8" style={{ color: "var(--pastel-blue-dark)" }} />
        </div>
        <h2 className="text-xl font-[family-name:var(--font-nunito)] font-bold" style={{ color: "var(--text-primary)" }}>
          What should we call you?
        </h2>
        <p className="font-[family-name:var(--font-dm-sans)]" style={{ color: "var(--text-secondary)" }}>
          This is how you&apos;ll appear in the app
        </p>
      </div>
      <div className="space-y-4 max-w-sm mx-auto">
        <div className="space-y-2">
          <Label htmlFor="displayName">Display Name</Label>
          <Input
            id="displayName"
            placeholder="Enter your name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
          />
        </div>
        {error && <p className="text-sm" style={{ color: "var(--pastel-coral)" }}>{error}</p>}
        <Button onClick={handleSave} className="w-full rounded-xl font-[family-name:var(--font-nunito)] font-bold" style={{ backgroundColor: "var(--pastel-blue)", color: "white" }} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          Continue
        </Button>
      </div>
    </div>
  );
}
