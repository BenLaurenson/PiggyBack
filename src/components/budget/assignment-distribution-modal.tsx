"use client";

import { useState, useEffect } from "react";
import { goeyToast as toast } from "goey-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, Check } from "lucide-react";
import {
  distributeMethodologyAssignment,
  validateDistribution,
  getHistoricalSpending,
  type CategoryDistribution,
} from "@/lib/assignment-distributor";

interface AssignmentDistributionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  methodologyCategory: string;
  totalAmount: number;
  underlyingCategories: string[];
  categoryIcons: Map<string, string>;
  partnershipId: string;
  onConfirm: (distribution: Map<string, number>) => Promise<void>;
}

export function AssignmentDistributionModal({
  open,
  onOpenChange,
  methodologyCategory,
  totalAmount,
  underlyingCategories,
  categoryIcons,
  partnershipId,
  onConfirm,
}: AssignmentDistributionModalProps) {
  const [strategy, setStrategy] = useState<'equal' | 'proportional' | 'manual'>('equal');
  const [distribution, setDistribution] = useState<CategoryDistribution[]>([]);
  const [manualAmounts, setManualAmounts] = useState<Map<string, number>>(new Map());
  const [historicalSpending, setHistoricalSpending] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      loadHistoricalSpending();
    }
  }, [open, partnershipId]);

  useEffect(() => {
    if (open) {
      calculateDistribution();
    }
  }, [strategy, totalAmount, underlyingCategories, historicalSpending, manualAmounts]);

  const loadHistoricalSpending = async () => {
    setLoading(true);
    const spending = await getHistoricalSpending(underlyingCategories, partnershipId, 3);
    setHistoricalSpending(spending);
    setLoading(false);
  };

  const calculateDistribution = () => {
    const dist = distributeMethodologyAssignment(
      totalAmount,
      underlyingCategories,
      historicalSpending,
      strategy,
      manualAmounts
    );
    setDistribution(dist);
  };

  const handleManualAmountChange = (categoryName: string, value: string) => {
    const amount = parseInt(value) || 0;
    const newAmounts = new Map(manualAmounts);
    newAmounts.set(categoryName, amount * 100); // Convert to cents
    setManualAmounts(newAmounts);
  };

  const handleConfirm = async () => {
    const validation = validateDistribution(distribution, totalAmount);

    if (!validation.valid) {
      toast.error(`Distribution doesn't add up! Expected: $${(totalAmount / 100).toFixed(2)}, Actual: $${(validation.actualTotal / 100).toFixed(2)}`);
      return;
    }

    setSaving(true);
    try {
      const distributionMap = new Map<string, number>();
      distribution.forEach(d => {
        distributionMap.set(d.categoryName, d.amount);
      });

      await onConfirm(distributionMap);
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to save distribution:", error);
      toast.error("Failed to save distribution");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[600px] max-h-[80vh] flex flex-col p-0"
        style={{ backgroundColor: 'var(--background)' }}
      >
        <DialogHeader className="p-6 border-b" style={{ borderColor: 'var(--border)' }}>
          <DialogTitle className="font-[family-name:var(--font-nunito)] text-xl font-black" style={{ color: 'var(--text-primary)' }}>
            Distribute ${(totalAmount / 100).toFixed(0)} to {methodologyCategory}
          </DialogTitle>
          <DialogDescription className="font-[family-name:var(--font-dm-sans)] text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Choose how to split this amount across {underlyingCategories.length} categories
          </DialogDescription>
        </DialogHeader>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <Tabs value={strategy} onValueChange={(v) => setStrategy(v as any)}>
            <TabsList className="w-full bg-secondary p-1 rounded-xl">
              <TabsTrigger value="equal" className="flex-1 rounded-lg">
                Equal Split
              </TabsTrigger>
              <TabsTrigger value="proportional" className="flex-1 rounded-lg">
                By Spending
              </TabsTrigger>
              <TabsTrigger value="manual" className="flex-1 rounded-lg">
                Custom
              </TabsTrigger>
            </TabsList>

            <TabsContent value="equal" className="space-y-3 mt-4">
              <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary">
                Divide evenly across all categories:
              </p>
              {distribution.map((d) => (
                <div key={d.categoryName} className="flex items-center justify-between p-3 rounded-lg bg-surface-elevated border" style={{ borderColor: 'var(--border)' }}>
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{categoryIcons.get(d.categoryName) || '📂'}</span>
                    <span className="font-[family-name:var(--font-nunito)] font-bold text-sm">{d.categoryName}</span>
                  </div>
                  <span className="font-[family-name:var(--font-nunito)] font-bold text-brand-coral">
                    ${(d.amount / 100).toFixed(2)}
                  </span>
                </div>
              ))}
            </TabsContent>

            <TabsContent value="proportional" className="space-y-3 mt-4">
              {loading ? (
                <p className="text-sm text-text-secondary">Loading historical spending...</p>
              ) : (
                <>
                  <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary">
                    Based on your spending patterns from the last 3 months:
                  </p>
                  {distribution.map((d) => (
                    <div key={d.categoryName} className="flex items-center justify-between p-3 rounded-lg bg-surface-elevated border" style={{ borderColor: 'var(--border)' }}>
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{categoryIcons.get(d.categoryName) || '📂'}</span>
                        <div>
                          <span className="font-[family-name:var(--font-nunito)] font-bold text-sm block">{d.categoryName}</span>
                          <span className="font-[family-name:var(--font-dm-sans)] text-xs text-text-tertiary">
                            {d.percentage.toFixed(0)}% of spending
                          </span>
                        </div>
                      </div>
                      <span className="font-[family-name:var(--font-nunito)] font-bold text-brand-coral">
                        ${(d.amount / 100).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </>
              )}
            </TabsContent>

            <TabsContent value="manual" className="space-y-3 mt-4">
              <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary">
                Specify the amount for each category:
              </p>
              {underlyingCategories.map((catName) => {
                const dist = distribution.find(d => d.categoryName === catName);
                return (
                  <div key={catName} className="flex items-center gap-3 p-3 rounded-lg bg-surface-elevated border" style={{ borderColor: 'var(--border)' }}>
                    <span className="text-xl">{categoryIcons.get(catName) || '📂'}</span>
                    <Label className="flex-1 font-[family-name:var(--font-nunito)] font-bold text-sm">
                      {catName}
                    </Label>
                    <div className="flex items-center gap-1">
                      <span className="text-text-secondary">$</span>
                      <Input
                        type="number"
                        step="1"
                        value={((manualAmounts.get(catName) || dist?.amount || 0) / 100).toFixed(0)}
                        onChange={(e) => handleManualAmountChange(catName, e.target.value)}
                        className="w-24 h-9 text-right"
                      />
                    </div>
                  </div>
                );
              })}

              {/* Validation */}
              {(() => {
                const validation = validateDistribution(distribution, totalAmount);
                if (!validation.valid) {
                  return (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-error-light border-2 border-error-border">
                      <AlertCircle className="h-4 w-4 text-error" />
                      <span className="font-[family-name:var(--font-dm-sans)] text-sm text-error">
                        Total must equal ${(totalAmount / 100).toFixed(2)} (currently ${(validation.actualTotal / 100).toFixed(2)})
                      </span>
                    </div>
                  );
                }
                return (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-accent-teal-light border-2 border-accent-teal-border">
                    <Check className="h-4 w-4 text-accent-teal" />
                    <span className="font-[family-name:var(--font-dm-sans)] text-sm text-accent-teal">
                      Total matches perfectly!
                    </span>
                  </div>
                );
              })()}
            </TabsContent>
          </Tabs>
        </div>

        {/* Footer */}
        <DialogFooter className="p-6 border-t" style={{ borderColor: 'var(--border)' }}>
          <div className="flex gap-3 w-full">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={saving || (strategy === 'manual' && !validateDistribution(distribution, totalAmount).valid)}
              className="flex-1 bg-brand-coral hover:bg-brand-coral-dark font-[family-name:var(--font-nunito)] font-bold"
            >
              {saving ? "Saving..." : "Confirm Distribution"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
