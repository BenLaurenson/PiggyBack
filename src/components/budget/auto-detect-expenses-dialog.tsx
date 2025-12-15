"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Sparkles, Check, X, Cpu, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/budget-zero-calculations";

interface DetectedExpense {
  description: string;
  suggested_name: string;
  expected_amount_cents: number;
  recurrence_type: string;
  next_due_date: string;
  match_pattern: string;
  suggested_category: string;
  suggested_emoji: string;
  confidence: number;
  detection_count: number;
  last_date: string;
  reasoning?: string;
}

interface AutoDetectExpensesDialogProps {
  open: boolean;
  onClose: () => void;
  partnershipId: string;
  categories: string[];
}

export function AutoDetectExpensesDialog({
  open,
  onClose,
  partnershipId,
  categories,
}: AutoDetectExpensesDialogProps) {
  const router = useRouter();
  const [detected, setDetected] = useState<DetectedExpense[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<Map<number, Partial<DetectedExpense>>>(new Map());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiEnhanced, setAiEnhanced] = useState(false);

  // Fetch detected expenses when modal opens
  useEffect(() => {
    if (open) {
      fetchDetected();
    }
  }, [open]);

  const fetchDetected = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/budget/expenses/auto-detect?partnership_id=${partnershipId}`);

      if (!response.ok) {
        throw new Error("Failed to detect expenses");
      }

      const data = await response.json();
      setDetected(data.expenses || []);
      setAiEnhanced(data.ai_enhanced ?? false);

      // Auto-select high confidence expenses
      const autoSelect = new Set<number>();
      data.expenses.forEach((exp: DetectedExpense, index: number) => {
        if (exp.confidence >= 0.9) {
          autoSelect.add(index);
        }
      });
      setSelected(autoSelect);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (index: number) => {
    const newSelected = new Set(selected);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelected(newSelected);
  };

  const updateField = (index: number, field: string, value: any) => {
    const newEditing = new Map(editing);
    const current = newEditing.get(index) || {};
    newEditing.set(index, { ...current, [field]: value });
    setEditing(newEditing);
  };

  const handleAddSelected = async () => {
    setSaving(true);
    setError(null);

    try {
      const selectedExpenses = Array.from(selected).map(index => {
        const expense = detected[index];
        const edits = editing.get(index) || {};

        return {
          partnership_id: partnershipId,
          name: edits.suggested_name || expense.suggested_name,
          merchant_name: expense.description, // Store immutable merchant name
          category_name: edits.suggested_category || expense.suggested_category,
          expected_amount_cents: expense.expected_amount_cents,
          recurrence_type: expense.recurrence_type,
          next_due_date: expense.next_due_date,
          match_pattern: expense.match_pattern,
          emoji: edits.suggested_emoji || expense.suggested_emoji,
          auto_detected: true,
          // Note: linked_up_transaction_id will be handled by backend matching
        };
      });

      // Create all expenses
      for (const expense of selectedExpenses) {
        const response = await fetch('/api/budget/expenses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(expense),
        });

        if (!response.ok) {
          const data = await response.json();
          console.error('Failed to create expense:', data.error);
        }
      }

      router.refresh();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-4xl h-[85vh] overflow-hidden flex flex-col p-0 rounded-2xl">
        {/* Sticky Header */}
        <div className="px-6 pt-6 pb-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <DialogTitle className="font-[family-name:var(--font-nunito)] text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6" style={{ color: 'var(--pastel-blue-dark)' }} />
            Auto-Detected Recurring Expenses
            {!loading && detected.length > 0 && (
              <Badge
                className="rounded-full font-[family-name:var(--font-dm-sans)] text-xs font-medium ml-1 flex items-center gap-1"
                style={{
                  backgroundColor: aiEnhanced ? 'var(--pastel-purple-light, #f3e8ff)' : 'var(--pastel-blue-light)',
                  color: aiEnhanced ? 'var(--pastel-purple-dark, #7c3aed)' : 'var(--pastel-blue-dark)',
                }}
              >
                {aiEnhanced ? <Cpu className="h-3 w-3" /> : <Search className="h-3 w-3" />}
                {aiEnhanced ? "AI-powered" : "Pattern-based"}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription className="font-[family-name:var(--font-dm-sans)] mt-1">
            {loading
              ? "Scanning your transaction history..."
              : `We found ${detected.length} recurring expenses in your transaction history. Review and add them to your budget.`
            }
          </DialogDescription>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 min-h-0">
          <ScrollArea className="h-full">
            <div className="px-6 py-4">
          {error && (
            <div
              className="p-3 text-sm rounded-lg mb-4"
              style={{
                backgroundColor: 'var(--pastel-coral-light)',
                color: 'var(--pastel-coral-dark)',
              }}
            >
              {error}
            </div>
          )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: 'var(--pastel-blue-dark)' }} />
            <p className="font-[family-name:var(--font-dm-sans)] text-sm" style={{ color: 'var(--text-tertiary)' }}>
              Analyzing your transactions...
            </p>
          </div>
        ) : detected.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-6xl mb-3">🔍</div>
            <p className="font-[family-name:var(--font-nunito)] font-bold mb-2"
              style={{ color: 'var(--text-primary)' }}>
              No recurring expenses detected
            </p>
            <p className="font-[family-name:var(--font-dm-sans)] text-sm"
              style={{ color: 'var(--text-tertiary)' }}>
              You need at least 3 similar transactions to detect a pattern
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {detected.map((expense, index) => {
              const isSelected = selected.has(index);
              const edits = editing.get(index) || {};
              const displayName = edits.suggested_name || expense.suggested_name;
              const displayCategory = edits.suggested_category || expense.suggested_category;
              const displayEmoji = edits.suggested_emoji || expense.suggested_emoji;

              return (
                <div
                  key={index}
                  className="p-4 rounded-xl border-2 transition-all"
                  style={{
                    backgroundColor: isSelected ? 'var(--pastel-blue-light)' : 'var(--surface)',
                    borderColor: isSelected ? 'var(--pastel-blue)' : 'var(--border)',
                  }}
                >
                  <div className="flex items-start gap-3">
                    {/* Checkbox */}
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(index)}
                      className="mt-1 w-5 h-5 rounded"
                    />

                    {/* Content */}
                    <div className="flex-1 space-y-3">
                      {/* Header */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-3xl">{displayEmoji}</span>
                          <div>
                            <p className="font-[family-name:var(--font-nunito)] text-base font-bold"
                              style={{ color: 'var(--text-primary)' }}>
                              {expense.description}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="font-[family-name:var(--font-dm-sans)] text-xs"
                                style={{ color: 'var(--text-tertiary)' }}>
                                {formatCurrency(expense.expected_amount_cents)} {expense.recurrence_type}
                              </span>
                              <span className="text-xs">•</span>
                              <span className="font-[family-name:var(--font-dm-sans)] text-xs"
                                style={{ color: 'var(--text-tertiary)' }}>
                                Detected {expense.detection_count}× • Last: {new Date(expense.last_date).toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })}
                              </span>
                            </div>
                          </div>
                        </div>

                        <Badge
                          className="rounded-full font-[family-name:var(--font-nunito)] font-bold text-xs"
                          style={{
                            backgroundColor: expense.confidence >= 0.9 ? 'var(--pastel-mint-light)' : 'var(--pastel-yellow-light)',
                            color: expense.confidence >= 0.9 ? 'var(--pastel-mint-dark)' : 'var(--pastel-yellow-dark)',
                          }}
                        >
                          {(expense.confidence * 100).toFixed(0)}% confident
                        </Badge>
                      </div>

                      {/* AI Reasoning */}
                      {expense.reasoning && (
                        <p className="font-[family-name:var(--font-dm-sans)] text-xs italic"
                          style={{ color: 'var(--text-tertiary)' }}>
                          {expense.reasoning}
                        </p>
                      )}

                      {/* Editable Fields */}
                      {isSelected && (
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="font-[family-name:var(--font-dm-sans)] text-xs font-medium"
                              style={{ color: 'var(--text-secondary)' }}>
                              Name
                            </label>
                            <Input
                              value={displayName}
                              onChange={(e) => updateField(index, 'suggested_name', e.target.value)}
                              className="h-9 rounded-lg"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="font-[family-name:var(--font-dm-sans)] text-xs font-medium"
                              style={{ color: 'var(--text-secondary)' }}>
                              Category
                            </label>
                            <Select
                              value={displayCategory}
                              onValueChange={(value) => updateField(index, 'suggested_category', value)}
                            >
                              <SelectTrigger className="h-9 rounded-lg">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {categories.map((cat) => (
                                  <SelectItem key={cat} value={cat}>
                                    {cat}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

          </div>
        )}
            </div>
          </ScrollArea>
        </div>

        {/* Sticky Footer - Only show if has detected expenses */}
        {detected.length > 0 && !loading && (
          <div className="border-t px-6 py-4" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center justify-between">
              <p className="font-[family-name:var(--font-dm-sans)] text-sm"
                style={{ color: 'var(--text-secondary)' }}>
                {selected.size} of {detected.length} selected
              </p>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setSelected(new Set())}
                  disabled={saving}
                  className="rounded-xl font-[family-name:var(--font-nunito)] font-bold"
                >
                  Ignore All
                </Button>

                <Button
                  onClick={handleAddSelected}
                  disabled={saving || selected.size === 0}
                  className="rounded-xl font-[family-name:var(--font-nunito)] font-bold border-0"
                  style={{
                    backgroundColor: 'var(--pastel-mint)',
                    color: 'white',
                  }}
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Adding...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Add Selected ({selected.size})
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
