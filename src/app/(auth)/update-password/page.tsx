"use client";

import { useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRouter } from "next/navigation";

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    setError("");

    const supabase = createClient();

    const { error } = await supabase.auth.updateUser({
      password: password
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      // Success - redirect to dashboard
      router.push("/home");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: 'var(--background)' }}>
      <div className="w-full max-w-md">
        <div className="rounded-2xl shadow-lg p-8" style={{ backgroundColor: 'var(--surface-elevated)' }}>
          <h1 className="font-[family-name:var(--font-nunito)] text-3xl font-black mb-2" style={{ color: 'var(--text-primary)' }}>
            Update Password
          </h1>
          <p className="font-[family-name:var(--font-dm-sans)] text-sm mb-6" style={{ color: 'var(--text-tertiary)' }}>
            Enter your new password below.
          </p>

          <form onSubmit={handleUpdate} className="space-y-4">
            <div>
              <label className="font-[family-name:var(--font-dm-sans)] text-sm font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>
                New Password
              </label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter new password"
                required
                minLength={6}
                className="rounded-xl"
              />
            </div>

            <div>
              <label className="font-[family-name:var(--font-dm-sans)] text-sm font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>
                Confirm New Password
              </label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                required
                minLength={6}
                className="rounded-xl"
              />
            </div>

            {error && (
              <p className="text-sm font-[family-name:var(--font-dm-sans)]" style={{ color: 'var(--pastel-coral-dark)' }}>
                {error}
              </p>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl font-[family-name:var(--font-nunito)] font-bold"
              style={{ backgroundColor: 'var(--pastel-blue)', color: 'white' }}
            >
              {loading ? 'Updating...' : 'Update Password'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
