"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { goeyToast as toast } from "goey-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoreVertical, Loader2 } from "lucide-react";
import { addFundsToGoal, markGoalComplete, reopenGoal, deleteGoal } from "@/app/actions/goals";

interface GoalActionsMenuProps {
  goalId: string;
  goalName: string;
  isCompleted?: boolean;
}

export function GoalActionsMenu({ goalId, goalName, isCompleted }: GoalActionsMenuProps) {
  const [showAddFunds, setShowAddFunds] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleAddFunds = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      setError("Please enter a valid amount");
      return;
    }

    setLoading(true);
    setError(null);

    const result = await addFundsToGoal(goalId, Math.round(parseFloat(amount) * 100));

    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    toast.success("Funds added successfully!");
    setShowAddFunds(false);
    setAmount("");
    setLoading(false);
    router.refresh();
  };

  const handleMarkComplete = async () => {
    setLoading(true);
    const result = await markGoalComplete(goalId);

    if (result.error) {
      toast.error(result.error);
      setLoading(false);
      return;
    }

    toast.success("Goal marked as complete!");
    setLoading(false);
    router.refresh();
  };

  const handleReopenGoal = async () => {
    setLoading(true);
    const result = await reopenGoal(goalId);

    if (result.error) {
      toast.error(result.error);
      setLoading(false);
      return;
    }

    toast.success("Goal reopened!");
    setLoading(false);
    router.refresh();
  };

  const handleDelete = async () => {
    setLoading(true);
    const result = await deleteGoal(goalId);

    if (result.error) {
      toast.error(result.error);
      setLoading(false);
      return;
    }

    toast.success("Goal deleted successfully");
    setShowDelete(false);
    setLoading(false);
    router.refresh();
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="rounded-xl">
          <DropdownMenuItem onClick={() => router.push(`/goals/${goalId}/edit`)}>
            Edit Goal
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowAddFunds(true)}>
            Add Funds
          </DropdownMenuItem>
          {isCompleted ? (
            <DropdownMenuItem onClick={handleReopenGoal}>
              Reopen Goal
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={handleMarkComplete}>
              Mark Complete
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setShowDelete(true)}
            className="text-error"
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Add Funds Dialog */}
      <Dialog open={showAddFunds} onOpenChange={setShowAddFunds}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-[family-name:var(--font-nunito)] text-2xl font-bold">
              Add Funds
            </DialogTitle>
            <DialogDescription className="font-[family-name:var(--font-dm-sans)]">
              Add money to {goalName}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {error && (
              <div className="p-3 text-sm bg-error-light border-2 border-error-border rounded-xl text-error-text">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="amount" className="font-[family-name:var(--font-nunito)] font-bold">
                Amount
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary">$</span>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="pl-7 h-12 rounded-xl border-2 font-[family-name:var(--font-dm-sans)]"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowAddFunds(false)}
              disabled={loading}
              className="rounded-xl font-[family-name:var(--font-nunito)] font-bold border-2"
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddFunds}
              disabled={loading}
              className="rounded-xl font-[family-name:var(--font-nunito)] font-bold bg-brand-coral hover:bg-brand-coral-dark"
            >
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Add Funds
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDelete} onOpenChange={setShowDelete}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-[family-name:var(--font-nunito)] text-2xl font-bold text-error">
              Delete Goal?
            </DialogTitle>
            <DialogDescription className="font-[family-name:var(--font-dm-sans)]">
              Are you sure you want to delete &quot;{goalName}&quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDelete(false)}
              disabled={loading}
              className="rounded-xl font-[family-name:var(--font-nunito)] font-bold border-2"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDelete}
              disabled={loading}
              variant="destructive"
              className="rounded-xl font-[family-name:var(--font-nunito)] font-bold"
            >
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Delete Goal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
