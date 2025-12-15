"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Trash2 } from "lucide-react";
import { ExpenseFromTransaction } from "./expense-from-transaction";
import { useRouter } from "next/navigation";
import {
  getExpenseForTransaction,
  deleteExpense,
} from "@/app/actions/expenses";

interface CreateExpenseFromTransactionDialogProps {
  transaction: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateExpenseFromTransactionDialog({
  transaction,
  open,
  onOpenChange,
}: CreateExpenseFromTransactionDialogProps) {
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  const [linkedExpense, setLinkedExpense] = useState<{
    id: string;
    name: string;
    emoji: string | null;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Check linkage when dialog opens
  useEffect(() => {
    if (!open || !transaction) {
      setLinkedExpense(null);
      setDeleteError(null);
      return;
    }

    const checkLinkage = async () => {
      setChecking(true);
      try {
        const result = await getExpenseForTransaction(transaction.id);
        if (result.linked && result.expense) {
          setLinkedExpense(result.expense);
        } else {
          setLinkedExpense(null);
        }
      } catch {
        setLinkedExpense(null);
      } finally {
        setChecking(false);
      }
    };

    checkLinkage();
  }, [open, transaction]);

  const handleDelete = async () => {
    if (!linkedExpense) return;
    setDeleting(true);
    setDeleteError(null);

    const result = await deleteExpense(linkedExpense.id);
    if (result.success) {
      onOpenChange(false);
      router.refresh();
    } else {
      setDeleteError(result.error || "Failed to remove expense");
    }
    setDeleting(false);
  };

  const isRemoveMode = !checking && linkedExpense;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-[family-name:var(--font-nunito)] text-lg font-bold">
            {checking
              ? "Checking..."
              : isRemoveMode
                ? "Remove Recurring Expense"
                : "Create from Transaction"}
          </DialogTitle>
          {isRemoveMode && (
            <DialogDescription className="font-[family-name:var(--font-dm-sans)] text-sm" style={{ color: 'var(--text-secondary)' }}>
              This transaction is linked to an existing recurring expense.
            </DialogDescription>
          )}
        </DialogHeader>

        {checking ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--text-tertiary)' }} />
          </div>
        ) : isRemoveMode ? (
          <div className="space-y-4">
            {/* Expense info */}
            <div
              className="flex items-center gap-3 p-4 rounded-xl"
              style={{ backgroundColor: 'var(--surface-elevated)' }}
            >
              <span className="text-2xl">{linkedExpense.emoji || "📋"}</span>
              <div>
                <p className="font-[family-name:var(--font-nunito)] font-bold" style={{ color: 'var(--text-primary)' }}>
                  {linkedExpense.name}
                </p>
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  This will permanently remove the recurring expense and all its matched transactions.
                </p>
              </div>
            </div>

            {deleteError && (
              <div className="p-3 rounded-xl" style={{ backgroundColor: 'var(--error-light)', border: '1px solid var(--error-border)' }}>
                <p className="text-sm" style={{ color: 'var(--error)' }}>{deleteError}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => onOpenChange(false)}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleDelete}
                disabled={deleting}
                style={{
                  backgroundColor: 'var(--pastel-coral)',
                  color: 'white',
                }}
              >
                {deleting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-2" />
                )}
                Remove
              </Button>
            </div>
          </div>
        ) : (
          open &&
          transaction && (
            <ExpenseFromTransaction
              initialTransaction={transaction}
              onBack={() => onOpenChange(false)}
              onSuccess={() => {
                onOpenChange(false);
                router.refresh();
              }}
            />
          )
        )}
      </DialogContent>
    </Dialog>
  );
}
