"use client";

/**
 * Recurring investments section for /invest.
 *
 * Phase-1 #46: lets the user define rules like "Pearler $200/fortnight"
 * that the Up Bank webhook auto-detects and rolls up into
 * investment_contributions. Renders a card per rule with:
 *   - next due date
 *   - last 6 contributions detected
 *   - contribution-vs-growth breakdown bar chart
 *
 * Pure presentational + dialog state. All persistence goes through
 * server actions in src/app/actions/recurring-investments.ts.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Pencil, Trash2, Loader2, Repeat, AlertCircle } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createRecurringInvestment,
  updateRecurringInvestment,
  deleteRecurringInvestment,
} from "@/app/actions/recurring-investments";
import {
  contributionVsGrowth,
  FREQUENCY_LABEL,
  type Frequency,
} from "@/lib/recurring-investments";

// ============================================================================
// Types
// ============================================================================

export interface RecurringRuleDTO {
  id: string;
  asset_id: string;
  asset_name: string;
  asset_ticker: string | null;
  amount_cents: number;
  frequency: Frequency;
  anchor_date: string;
  merchant_pattern: string;
  is_active: boolean;
  next_due_date: string;
  recent_contributions: Array<{
    id: string;
    amountCents: number;
    contributedAt: string;
  }>;
  contributed_total_cents: number;
  current_value_cents: number;
}

interface AssetOption {
  id: string;
  name: string;
  ticker_symbol: string | null;
  asset_type: string;
  current_value_cents: number;
}

interface Props {
  rules: RecurringRuleDTO[];
  /** Investments the user has — used as the asset picker source. */
  assets: AssetOption[];
  /** Distinct merchant descriptions from recent debits — typeahead helper. */
  merchantSuggestions: string[];
}

// ============================================================================
// Helpers
// ============================================================================

const fmt = (cents: number) =>
  new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);

const fmtShort = (iso: string) =>
  new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  });

const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
  });

const FREQUENCIES: Frequency[] = [
  "weekly",
  "fortnightly",
  "monthly",
  "quarterly",
  "yearly",
];

// ============================================================================
// Section
// ============================================================================

export function RecurringInvestmentsSection({
  rules,
  assets,
  merchantSuggestions,
}: Props) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<RecurringRuleDTO | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  if (assets.length === 0) {
    // No assets to attach a rule to — gate behind asset creation.
    return null;
  }

  const openCreate = () => {
    setEditingRule(null);
    setDialogOpen(true);
  };
  const openEdit = (r: RecurringRuleDTO) => {
    setEditingRule(r);
    setDialogOpen(true);
  };
  const handleDelete = async (id: string) => {
    if (!confirm("Delete this recurring rule? Existing detected contributions are kept.")) return;
    setDeletingId(id);
    const res = await deleteRecurringInvestment(id);
    setDeletingId(null);
    if ("error" in res && res.error) {
      alert(res.error);
      return;
    }
    router.refresh();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.16 }}
    >
      <div
        className="border-0 shadow-sm rounded-2xl overflow-hidden"
        style={{ backgroundColor: "var(--surface-elevated)" }}
      >
        <div
          className="px-5 py-3.5 flex items-center justify-between border-b"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="flex items-center gap-2">
            <Repeat className="h-4 w-4" style={{ color: "var(--pastel-purple-dark)" }} />
            <span
              className="font-[family-name:var(--font-nunito)] text-base font-bold"
              style={{ color: "var(--text-primary)" }}
            >
              Recurring contributions
            </span>
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full"
              style={{
                backgroundColor: "var(--pastel-purple-light)",
                color: "var(--pastel-purple-dark)",
              }}
            >
              {rules.length}
            </span>
          </div>
          <Button
            onClick={openCreate}
            size="sm"
            variant="outline"
            className="rounded-xl text-xs h-8 cursor-pointer"
          >
            <Plus className="h-3 w-3 mr-1" /> Add rule
          </Button>
        </div>

        {rules.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              No recurring investments tracked yet.
            </p>
            <p className="text-[11px] mt-1" style={{ color: "var(--text-tertiary)" }}>
              Add a rule to auto-detect contributions when matching transactions land.
            </p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {rules.map((rule) => (
              <RecurringRuleCard
                key={rule.id}
                rule={rule}
                onEdit={() => openEdit(rule)}
                onDelete={() => handleDelete(rule.id)}
                deleting={deletingId === rule.id}
              />
            ))}
          </div>
        )}
      </div>

      <RecurringRuleDialog
        open={dialogOpen}
        rule={editingRule}
        assets={assets}
        merchantSuggestions={merchantSuggestions}
        onClose={() => setDialogOpen(false)}
        onSaved={() => {
          setDialogOpen(false);
          router.refresh();
        }}
      />
    </motion.div>
  );
}

// ============================================================================
// Rule card (one row per rule)
// ============================================================================

function RecurringRuleCard({
  rule,
  onEdit,
  onDelete,
  deleting,
}: {
  rule: RecurringRuleDTO;
  onEdit: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const { contributedCents, growthCents } = contributionVsGrowth(
    rule.recent_contributions.map((c) => c.amountCents),
    rule.current_value_cents
  );
  const totalForBar = Math.max(1, contributedCents + growthCents);
  const contribPct = (contributedCents / totalForBar) * 100;
  const growthPct = (growthCents / totalForBar) * 100;
  const noContribsYet = rule.recent_contributions.length === 0;

  return (
    <div className="p-4 sm:p-5">
      {/* Header row: asset + amount/freq + actions */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="text-sm font-semibold truncate"
              style={{ color: "var(--text-primary)" }}
            >
              {rule.asset_name}
            </span>
            {rule.asset_ticker && (
              <span
                className="text-[10px] font-medium"
                style={{ color: "var(--text-tertiary)" }}
              >
                {rule.asset_ticker}
              </span>
            )}
            {!rule.is_active && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded-full"
                style={{
                  backgroundColor: "var(--surface-sunken)",
                  color: "var(--text-tertiary)",
                }}
              >
                Paused
              </span>
            )}
          </div>
          <div
            className="text-[11px] mt-0.5"
            style={{ color: "var(--text-tertiary)" }}
          >
            <span className="font-medium">{fmt(rule.amount_cents)}</span>{" "}
            {FREQUENCY_LABEL[rule.frequency].toLowerCase()}
            <span className="px-1">·</span>
            matches{" "}
            <span
              className="font-mono px-1 rounded"
              style={{ backgroundColor: "var(--surface-sunken)" }}
            >
              {rule.merchant_pattern}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={onEdit}
            className="p-1.5 rounded-lg hover:bg-[var(--surface-sunken)] transition-colors cursor-pointer"
            title="Edit"
          >
            <Pencil className="h-3.5 w-3.5" style={{ color: "var(--text-tertiary)" }} />
          </button>
          <button
            onClick={onDelete}
            disabled={deleting}
            className="p-1.5 rounded-lg hover:bg-[var(--surface-sunken)] transition-colors cursor-pointer disabled:opacity-50"
            title="Delete"
          >
            {deleting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2
                className="h-3.5 w-3.5"
                style={{ color: "var(--pastel-coral-dark)" }}
              />
            )}
          </button>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-3 mb-3">
        <div>
          <p
            className="text-[10px] uppercase tracking-wider mb-0.5"
            style={{ color: "var(--text-tertiary)" }}
          >
            Next due
          </p>
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            {fmtShort(rule.next_due_date)}
          </p>
        </div>
        <div>
          <p
            className="text-[10px] uppercase tracking-wider mb-0.5"
            style={{ color: "var(--text-tertiary)" }}
          >
            Contributed
          </p>
          <p
            className="text-sm font-semibold tabular-nums"
            style={{ color: "var(--text-primary)" }}
          >
            {fmt(rule.contributed_total_cents)}
          </p>
        </div>
        <div>
          <p
            className="text-[10px] uppercase tracking-wider mb-0.5"
            style={{ color: "var(--text-tertiary)" }}
          >
            Detected
          </p>
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            {rule.recent_contributions.length}
            {rule.recent_contributions.length === 6 ? "+" : ""}
          </p>
        </div>
      </div>

      {/* Contribution-vs-growth bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>
            Contribution vs growth
          </span>
          {!noContribsYet && (
            <span
              className="text-[10px] tabular-nums"
              style={{ color: "var(--text-tertiary)" }}
            >
              {fmt(contributedCents)} in · {fmt(growthCents)} growth
            </span>
          )}
        </div>
        <div
          className="h-2 rounded-full overflow-hidden flex"
          style={{ backgroundColor: "var(--surface-sunken)" }}
          aria-label="contribution vs growth bar"
        >
          {!noContribsYet ? (
            <>
              <div
                style={{
                  width: `${contribPct}%`,
                  backgroundColor: "var(--pastel-blue)",
                }}
              />
              <div
                style={{
                  width: `${growthPct}%`,
                  backgroundColor: "var(--pastel-mint)",
                }}
              />
            </>
          ) : null}
        </div>
        <div className="flex items-center gap-3 mt-1.5">
          <span className="flex items-center gap-1 text-[10px]" style={{ color: "var(--text-tertiary)" }}>
            <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: "var(--pastel-blue)" }} />
            Money in
          </span>
          <span className="flex items-center gap-1 text-[10px]" style={{ color: "var(--text-tertiary)" }}>
            <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: "var(--pastel-mint)" }} />
            Growth
          </span>
        </div>
      </div>

      {/* Last 6 contributions */}
      {rule.recent_contributions.length > 0 ? (
        <div
          className="rounded-xl p-2"
          style={{ backgroundColor: "var(--surface-sunken)" }}
        >
          <p
            className="text-[10px] uppercase tracking-wider mb-1.5 px-1"
            style={{ color: "var(--text-tertiary)" }}
          >
            Last {rule.recent_contributions.length} detected
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
            {rule.recent_contributions.map((c) => (
              <div
                key={c.id}
                className="flex flex-col px-2 py-1 rounded-lg text-[11px]"
                style={{ backgroundColor: "var(--surface-elevated)" }}
              >
                <span style={{ color: "var(--text-tertiary)" }}>
                  {fmtDay(c.contributedAt)}
                </span>
                <span
                  className="font-semibold tabular-nums"
                  style={{ color: "var(--text-primary)" }}
                >
                  {fmt(c.amountCents)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div
          className="flex items-center gap-2 rounded-xl p-2.5 text-[11px]"
          style={{
            backgroundColor: "var(--pastel-yellow-light)",
            color: "var(--pastel-yellow-dark)",
          }}
        >
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
          No matching transactions detected yet — they{"’"}ll show up here once the
          Up Bank webhook fires.
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Add / Edit dialog
// ============================================================================

function RecurringRuleDialog({
  open,
  rule,
  assets,
  merchantSuggestions,
  onClose,
  onSaved,
}: {
  open: boolean;
  rule: RecurringRuleDTO | null;
  assets: AssetOption[];
  merchantSuggestions: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEditing = !!rule;
  const [assetId, setAssetId] = useState(rule?.asset_id ?? assets[0]?.id ?? "");
  const [amount, setAmount] = useState(
    rule ? (rule.amount_cents / 100).toFixed(2) : ""
  );
  const [frequency, setFrequency] = useState<Frequency>(
    rule?.frequency ?? "fortnightly"
  );
  const [anchorDate, setAnchorDate] = useState(
    rule?.anchor_date ?? new Date().toISOString().slice(0, 10)
  );
  const [merchant, setMerchant] = useState(rule?.merchant_pattern ?? "");
  const [isActive, setIsActive] = useState(rule?.is_active ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when dialog opens or the rule prop changes (edit vs new).
  useEffect(() => {
    if (!open) return;
    setAssetId(rule?.asset_id ?? assets[0]?.id ?? "");
    setAmount(rule ? (rule.amount_cents / 100).toFixed(2) : "");
    setFrequency(rule?.frequency ?? "fortnightly");
    setAnchorDate(rule?.anchor_date ?? new Date().toISOString().slice(0, 10));
    setMerchant(rule?.merchant_pattern ?? "");
    setIsActive(rule?.is_active ?? true);
    setError(null);
  }, [open, rule, assets]);

  // Filter merchant suggestions for the user-typed value to give a quick
  // preview-style autocomplete WITHOUT pulling in a combobox library.
  const filteredSuggestions = useMemo(() => {
    if (!merchant || merchant.length < 1) return merchantSuggestions.slice(0, 6);
    const q = merchant.toLowerCase();
    return merchantSuggestions
      .filter((m) => m.toLowerCase().includes(q) && m.toLowerCase() !== q)
      .slice(0, 6);
  }, [merchant, merchantSuggestions]);

  const onSubmit = async () => {
    setError(null);
    const amountFloat = parseFloat(amount);
    if (!Number.isFinite(amountFloat) || amountFloat <= 0) {
      setError("Enter a valid positive amount.");
      return;
    }
    if (!merchant.trim()) {
      setError("Merchant pattern can't be empty.");
      return;
    }
    if (!assetId) {
      setError("Pick an asset.");
      return;
    }
    setSaving(true);
    const payload = {
      asset_id: assetId,
      amount_cents: Math.round(amountFloat * 100),
      frequency,
      anchor_date: anchorDate,
      merchant_pattern: merchant.trim(),
      is_active: isActive,
    };
    const res = isEditing
      ? await updateRecurringInvestment(rule!.id, payload)
      : await createRecurringInvestment(payload);
    setSaving(false);
    if ("error" in res && res.error) {
      setError(res.error);
      return;
    }
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit recurring investment" : "Add recurring investment"}
          </DialogTitle>
          <DialogDescription>
            Match transactions automatically by merchant name. Used for things
            like Pearler, Vanguard, Stake — any debit that lands repeatedly.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Asset */}
          <div className="space-y-1.5">
            <Label htmlFor="ri-asset">Asset</Label>
            <Select value={assetId} onValueChange={setAssetId}>
              <SelectTrigger id="ri-asset">
                <SelectValue placeholder="Pick an asset" />
              </SelectTrigger>
              <SelectContent>
                {assets.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                    {a.ticker_symbol ? ` (${a.ticker_symbol})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Amount + frequency */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ri-amount">Amount (AUD)</Label>
              <Input
                id="ri-amount"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                placeholder="200.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ri-freq">Frequency</Label>
              <Select value={frequency} onValueChange={(v) => setFrequency(v as Frequency)}>
                <SelectTrigger id="ri-freq">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FREQUENCIES.map((f) => (
                    <SelectItem key={f} value={f}>
                      {FREQUENCY_LABEL[f]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Anchor date */}
          <div className="space-y-1.5">
            <Label htmlFor="ri-anchor">Anchor date (next-due-date is computed from this)</Label>
            <Input
              id="ri-anchor"
              type="date"
              value={anchorDate}
              onChange={(e) => setAnchorDate(e.target.value)}
            />
          </div>

          {/* Merchant pattern */}
          <div className="space-y-1.5">
            <Label htmlFor="ri-merchant">Merchant pattern</Label>
            <Input
              id="ri-merchant"
              type="text"
              placeholder="e.g. PEARLER"
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
            />
            {filteredSuggestions.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {filteredSuggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setMerchant(s)}
                    className="text-[10px] px-2 py-1 rounded-full hover:opacity-80 transition-opacity cursor-pointer"
                    style={{
                      backgroundColor: "var(--pastel-blue-light)",
                      color: "var(--pastel-blue-dark)",
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            <p className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>
              Substring match (case-insensitive). Pick the most distinctive
              part of the description Up Bank shows.
            </p>
          </div>

          {/* Active toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm" style={{ color: "var(--text-primary)" }}>
              Active (auto-detect contributions)
            </span>
          </label>

          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
                style={{
                  backgroundColor: "var(--pastel-coral-light)",
                  color: "var(--pastel-coral-dark)",
                }}
              >
                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                {error}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving} className="cursor-pointer">
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={saving} className="cursor-pointer">
            {saving && <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />}
            {isEditing ? "Save changes" : "Create rule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
