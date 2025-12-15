"use client";

import { useState } from "react";
import Link from "next/link";
import { Nunito, DM_Sans } from "next/font/google";
import { createClient } from "@/utils/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Loader2, Save, Trash2, Lock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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

export default function SecurityPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const supabase = createClient();

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    if (newPassword !== confirmPassword) {
      setError("New passwords don't match");
      setLoading(false);
      return;
    }

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      setLoading(false);
      return;
    }

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (updateError) throw updateError;

      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== "DELETE") {
      setError('Please type "DELETE" to confirm');
      return;
    }

    setDeleting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Delete user data (implement your cleanup logic)
      // This should cascade delete related data based on your DB schema
      await supabase.from("profiles").delete().eq("id", user.id);

      // Sign out
      await supabase.auth.signOut();

      // Redirect to home
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete account");
    } finally {
      setDeleting(false);
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
          Privacy & Security
        </h1>
        <p className="font-[family-name:var(--font-dm-sans)] text-text-secondary">
          Manage your password and security settings
        </p>
      </div>

      {error && (
        <div className="p-4 text-sm bg-error-light border-2 border-error-border rounded-xl text-error-text mb-6">
          {error}
        </div>
      )}

      {success && (
        <div className="p-4 text-sm bg-accent-teal-light border-2 border-accent-teal-border rounded-xl text-accent-teal mb-6">
          Password changed successfully!
        </div>
      )}

      {/* Change Password */}
      <Card className="bg-surface-white-60 backdrop-blur-sm border-2 border-border-white-80 shadow-lg mb-6">
        <CardContent className="pt-6">
          <h2 className="font-[family-name:var(--font-nunito)] text-lg font-bold text-text-primary mb-4">
            Change Password
          </h2>

          <form onSubmit={handleChangePassword} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="newPassword" className="font-[family-name:var(--font-nunito)] font-bold text-text-primary">
                New Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary" />
                <Input
                  id="newPassword"
                  type="password"
                  placeholder="Enter new password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  disabled={loading}
                  className="pl-10 h-12 rounded-xl border-2 font-[family-name:var(--font-dm-sans)]"
                />
              </div>
              <p className="font-[family-name:var(--font-dm-sans)] text-xs text-text-secondary">
                Must be at least 8 characters
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="font-[family-name:var(--font-nunito)] font-bold text-text-primary">
                Confirm New Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary" />
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={loading}
                  className="pl-10 h-12 rounded-xl border-2 font-[family-name:var(--font-dm-sans)]"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-xl font-[family-name:var(--font-nunito)] font-bold bg-brand-coral hover:bg-brand-coral-dark hover:scale-105 transition-all"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Changing...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Change Password
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="bg-surface-white-60 backdrop-blur-sm border-2 border-error-border shadow-lg">
        <CardContent className="pt-6">
          <h2 className="font-[family-name:var(--font-nunito)] text-lg font-bold text-error mb-2">
            Danger Zone
          </h2>
          <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary mb-4">
            Irreversible actions
          </p>

          <div className="flex items-center justify-between p-4 rounded-xl border-2 border-error bg-error-light">
            <div>
              <p className="font-[family-name:var(--font-nunito)] font-bold text-error">
                Delete Account
              </p>
              <p className="font-[family-name:var(--font-dm-sans)] text-sm text-error">
                Permanently delete your account and all data
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(true)}
              className="rounded-xl font-[family-name:var(--font-nunito)] font-bold border-2 border-error text-error hover:bg-error hover:text-white"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-[family-name:var(--font-nunito)] text-2xl font-bold text-error">
              Delete Account?
            </DialogTitle>
            <DialogDescription className="font-[family-name:var(--font-dm-sans)]">
              This will permanently delete your account, all your data, transactions, goals, and partnerships. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="confirm" className="font-[family-name:var(--font-nunito)] font-bold text-text-primary">
              Type "DELETE" to confirm
            </Label>
            <Input
              id="confirm"
              placeholder="DELETE"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              className="h-12 rounded-xl border-2 font-[family-name:var(--font-dm-sans)]"
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowDeleteDialog(false);
                setDeleteConfirmText("");
              }}
              disabled={deleting}
              className="rounded-xl font-[family-name:var(--font-nunito)] font-bold border-2"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDeleteAccount}
              disabled={deleting || deleteConfirmText !== "DELETE"}
              className="rounded-xl font-[family-name:var(--font-nunito)] font-bold bg-error hover:bg-error/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Account
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
