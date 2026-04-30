"use client";

/**
 * Activity-overrides UI surface, embedded inside the transaction-detail
 * modal. Lets the user edit merchant display name, subtitle, and the two
 * exclude toggles. Saves via the upsertActivityOverride server action.
 *
 * Distinct from the existing recategorize / share-override / notes flows;
 * those each have their own action and dedicated UI surface.
 */

import { useState, useTransition } from "react";
import { Loader2, Save, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { upsertActivityOverride } from "@/app/actions/activity-overrides";

export interface ActivityOverrideShape {
  merchant_display_name: string | null;
  subtitle: string | null;
  exclude_from_budget: boolean | null;
  exclude_from_net_worth: boolean | null;
}

interface Props {
  transactionId: string;
  /** The current activity_overrides row for this transaction, if any. */
  initial: ActivityOverrideShape | null;
  /** The bank-supplied default merchant name, used as placeholder/reset value. */
  bankMerchant: string;
}

export function ActivityOverrideSection({ transactionId, initial, bankMerchant }: Props) {
  const [merchantDisplayName, setMerchantDisplayName] = useState(
    initial?.merchant_display_name ?? ""
  );
  const [subtitle, setSubtitle] = useState(initial?.subtitle ?? "");
  const [excludeFromBudget, setExcludeFromBudget] = useState(
    initial?.exclude_from_budget ?? false
  );
  const [excludeFromNetWorth, setExcludeFromNetWorth] = useState(
    initial?.exclude_from_net_worth ?? false
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSave = () => {
    setError(null);
    startTransition(async () => {
      const result = await upsertActivityOverride({
        transactionId,
        merchantDisplayName: merchantDisplayName.trim() || null,
        subtitle: subtitle.trim() || null,
        excludeFromBudget: excludeFromBudget || null,
        excludeFromNetWorth: excludeFromNetWorth || null,
      });
      if (result.error) {
        setError(result.error);
      } else {
        // Soft refresh — let the page re-fetch its data.
        window.location.reload();
      }
    });
  };

  const handleReset = () => {
    setMerchantDisplayName("");
    setSubtitle("");
    setExcludeFromBudget(false);
    setExcludeFromNetWorth(false);
  };

  const hasChanges =
    (merchantDisplayName.trim() || null) !== (initial?.merchant_display_name ?? null) ||
    (subtitle.trim() || null) !== (initial?.subtitle ?? null) ||
    excludeFromBudget !== (initial?.exclude_from_budget ?? false) ||
    excludeFromNetWorth !== (initial?.exclude_from_net_worth ?? false);

  return (
    <div className="mb-4 p-4 rounded-2xl" style={{ backgroundColor: "var(--pastel-mint-light)" }}>
      <div className="flex items-center justify-between mb-3">
        <p
          className="font-[family-name:var(--font-nunito)] font-bold text-xs uppercase tracking-wider"
          style={{ color: "var(--pastel-mint-dark)" }}
        >
          Display & budget overrides
        </p>
        {initial && (
          <span
            className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
            style={{ backgroundColor: "var(--pastel-mint)", color: "var(--pastel-mint-dark)" }}
          >
            Edited
          </span>
        )}
      </div>

      {error && (
        <div
          className="p-2 rounded-lg mb-3 text-xs"
          style={{ backgroundColor: "var(--error-light)", color: "var(--error)" }}
        >
          {error}
        </div>
      )}

      <div className="space-y-3">
        {/* Merchant display name */}
        <div>
          <label
            htmlFor="override-merchant"
            className="block font-[family-name:var(--font-dm-sans)] text-xs mb-1"
            style={{ color: "var(--text-tertiary)" }}
          >
            Merchant name (overrides &ldquo;{bankMerchant}&rdquo;)
          </label>
          <Input
            id="override-merchant"
            placeholder={bankMerchant}
            value={merchantDisplayName}
            onChange={(e) => setMerchantDisplayName(e.target.value)}
            className="text-sm"
          />
        </div>

        {/* Subtitle */}
        <div>
          <label
            htmlFor="override-subtitle"
            className="block font-[family-name:var(--font-dm-sans)] text-xs mb-1"
            style={{ color: "var(--text-tertiary)" }}
          >
            Subtitle (optional, second line under merchant)
          </label>
          <Input
            id="override-subtitle"
            placeholder="e.g. Date night with Nikita"
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            className="text-sm"
          />
        </div>

        {/* Exclude from budget */}
        <div className="flex items-center justify-between pt-1">
          <div>
            <label
              htmlFor="override-budget"
              className="block font-[family-name:var(--font-dm-sans)] text-sm cursor-pointer"
              style={{ color: "var(--text-primary)" }}
            >
              Exclude from budget
            </label>
            <p
              className="font-[family-name:var(--font-dm-sans)] text-xs"
              style={{ color: "var(--text-tertiary)" }}
            >
              Stays in your activity list, hidden from budget spend.
            </p>
          </div>
          <Switch
            id="override-budget"
            checked={excludeFromBudget}
            onCheckedChange={setExcludeFromBudget}
          />
        </div>

        {/* Exclude from net worth */}
        <div className="flex items-center justify-between">
          <div>
            <label
              htmlFor="override-networth"
              className="block font-[family-name:var(--font-dm-sans)] text-sm cursor-pointer"
              style={{ color: "var(--text-primary)" }}
            >
              Exclude from net worth
            </label>
            <p
              className="font-[family-name:var(--font-dm-sans)] text-xs"
              style={{ color: "var(--text-tertiary)" }}
            >
              For one-off transfers, business expenses, etc.
            </p>
          </div>
          <Switch
            id="override-networth"
            checked={excludeFromNetWorth}
            onCheckedChange={setExcludeFromNetWorth}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button
            onClick={handleSave}
            disabled={!hasChanges || isPending}
            className="flex-1"
            size="sm"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
            Save overrides
          </Button>
          {(initial || hasChanges) && (
            <Button onClick={handleReset} variant="outline" size="sm" disabled={isPending}>
              <RotateCcw className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
