"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Loader2, Save, Trash2 } from "lucide-react";
import { updateInvestment, deleteInvestment } from "@/app/actions/investments";

interface Investment {
  id: string;
  asset_type: string;
  name: string;
  ticker_symbol?: string | null;
  quantity?: number | null;
  purchase_value_cents?: number | null;
  current_value_cents: number;
  notes?: string | null;
}

interface InvestEditClientProps {
  investment: Investment;
}

export function InvestEditClient({ investment }: InvestEditClientProps) {
  const [assetType, setAssetType] = useState<string>(investment.asset_type);
  const [name, setName] = useState(investment.name);
  const [ticker, setTicker] = useState(investment.ticker_symbol || "");
  const [quantity, setQuantity] = useState(investment.quantity?.toString() || "");
  // Store per-unit prices when quantity exists, otherwise total
  const initQty = investment.quantity && investment.quantity > 0 ? investment.quantity : null;
  const [purchasePrice, setPurchasePrice] = useState(
    investment.purchase_value_cents
      ? initQty
        ? (investment.purchase_value_cents / 100 / initQty).toFixed(2)
        : (investment.purchase_value_cents / 100).toFixed(2)
      : ""
  );
  const [currentPrice, setCurrentPrice] = useState(
    initQty
      ? (investment.current_value_cents / 100 / initQty).toFixed(2)
      : (investment.current_value_cents / 100).toFixed(2)
  );
  const [notes, setNotes] = useState(investment.notes || "");
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const qty = quantity ? parseFloat(quantity) : null;
  const hasQty = qty !== null && qty > 0;
  const purchasePriceNum = purchasePrice ? parseFloat(purchasePrice) : null;
  const currentPriceNum = currentPrice ? parseFloat(currentPrice) : null;
  const purchaseTotal = hasQty && purchasePriceNum ? purchasePriceNum * qty : purchasePriceNum;
  const currentTotal = hasQty && currentPriceNum ? currentPriceNum * qty : currentPriceNum;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const qtyVal = quantity ? parseFloat(quantity) : undefined;
    const hasQtyVal = qtyVal !== undefined && qtyVal > 0;
    const currentPer = parseFloat(currentPrice);
    const currentCents = Math.round((hasQtyVal ? currentPer * qtyVal : currentPer) * 100);
    const purchasePer = purchasePrice ? parseFloat(purchasePrice) : undefined;
    const purchaseCents = purchasePer !== undefined
      ? Math.round((hasQtyVal ? purchasePer * qtyVal : purchasePer) * 100)
      : undefined;

    const result = await updateInvestment(investment.id, {
      asset_type: assetType,
      name,
      ticker_symbol: ticker || undefined,
      quantity: qtyVal,
      purchase_value_cents: purchaseCents,
      current_value_cents: currentCents,
      notes: notes || undefined,
    });

    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    router.push("/invest");
    router.refresh();
  };

  const handleDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete ${investment.name}? This action cannot be undone.`)) {
      return;
    }

    setDeleting(true);
    const result = await deleteInvestment(investment.id);

    if (result.error) {
      setError(result.error);
      setDeleting(false);
      return;
    }

    router.push("/invest");
    router.refresh();
  };

  return (
    <>
      {/* Header */}
      <div className="space-y-1 mb-6">
        <Link
          href="/invest"
          className="text-sm font-[family-name:var(--font-dm-sans)] text-text-secondary hover:text-text-primary flex items-center gap-1 mb-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Investing
        </Link>
        <h1 className="font-[family-name:var(--font-nunito)] text-3xl font-black text-text-primary">
          Edit Investment
        </h1>
        <p className="font-[family-name:var(--font-dm-sans)] text-text-secondary">
          Update your asset details
        </p>
      </div>

      <Card
        className="border-0 shadow-lg"
        style={{ backgroundColor: 'var(--surface-elevated)' }}
      >
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div
                className="p-4 text-sm rounded-xl border-2"
                style={{
                  backgroundColor: 'var(--pastel-coral-light)',
                  borderColor: 'var(--pastel-coral)',
                  color: 'var(--pastel-coral-dark)',
                }}
              >
                {error}
              </div>
            )}

            {/* Asset Type */}
            <div className="space-y-2">
              <Label className="font-[family-name:var(--font-nunito)] font-bold text-text-primary">
                Asset Type
              </Label>
              <Select value={assetType} onValueChange={(v: any) => setAssetType(v)}>
                <SelectTrigger className="h-12 rounded-xl border-2 font-[family-name:var(--font-dm-sans)]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="stock">Stock</SelectItem>
                  <SelectItem value="etf">ETF</SelectItem>
                  <SelectItem value="crypto">Cryptocurrency</SelectItem>
                  <SelectItem value="property">Property</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name" className="font-[family-name:var(--font-nunito)] font-bold text-text-primary">
                Asset Name
              </Label>
              <Input
                id="name"
                placeholder="e.g., Vanguard VDHG, Bitcoin, etc."
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={loading}
                className="h-12 rounded-xl border-2 font-[family-name:var(--font-dm-sans)]"
              />
            </div>

            {/* Ticker Symbol */}
            <div className="space-y-2">
              <Label htmlFor="ticker" className="font-[family-name:var(--font-nunito)] font-bold text-text-primary">
                Ticker Symbol (optional)
              </Label>
              <Input
                id="ticker"
                placeholder="e.g., VDHG, BTC"
                value={ticker}
                onChange={(e) => setTicker(e.target.value)}
                disabled={loading}
                className="h-12 rounded-xl border-2 font-[family-name:var(--font-dm-sans)]"
              />
            </div>

            {/* Quantity */}
            <div className="space-y-2">
              <Label htmlFor="quantity" className="font-[family-name:var(--font-nunito)] font-bold text-text-primary">
                Quantity (optional)
              </Label>
              <Input
                id="quantity"
                type="number"
                step="any"
                placeholder="Number of units"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                disabled={loading}
                className="h-12 rounded-xl border-2 font-[family-name:var(--font-dm-sans)]"
              />
            </div>

            {/* Purchase Price */}
            <div className="space-y-2">
              <Label htmlFor="purchasePrice" className="font-[family-name:var(--font-nunito)] font-bold text-text-primary">
                {hasQty ? "Purchase Price per Unit (optional)" : "Purchase Value (optional)"}
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary">$</span>
                <Input
                  id="purchasePrice"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={purchasePrice}
                  onChange={(e) => setPurchasePrice(e.target.value)}
                  disabled={loading}
                  className="pl-7 h-12 rounded-xl border-2 font-[family-name:var(--font-dm-sans)]"
                />
              </div>
              {hasQty && purchaseTotal !== null ? (
                <p className="font-[family-name:var(--font-dm-sans)] text-xs text-text-secondary">
                  {qty.toLocaleString("en-AU")} units &times; ${purchasePriceNum?.toFixed(2)} = <span className="font-medium text-text-primary">${purchaseTotal.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> total
                </p>
              ) : (
                <p className="font-[family-name:var(--font-dm-sans)] text-xs text-text-secondary">
                  What you originally paid{hasQty ? " per unit" : " for this asset"}
                </p>
              )}
            </div>

            {/* Current Price */}
            <div className="space-y-2">
              <Label htmlFor="currentPrice" className="font-[family-name:var(--font-nunito)] font-bold text-text-primary">
                {hasQty ? "Current Price per Unit" : "Current Value"}
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary">$</span>
                <Input
                  id="currentPrice"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={currentPrice}
                  onChange={(e) => setCurrentPrice(e.target.value)}
                  required
                  disabled={loading}
                  className="pl-7 h-12 rounded-xl border-2 font-[family-name:var(--font-dm-sans)]"
                />
              </div>
              {hasQty && currentTotal !== null && (
                <p className="font-[family-name:var(--font-dm-sans)] text-xs text-text-secondary">
                  {qty.toLocaleString("en-AU")} units &times; ${currentPriceNum?.toFixed(2)} = <span className="font-medium text-text-primary">${currentTotal.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> total
                </p>
              )}
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes" className="font-[family-name:var(--font-nunito)] font-bold text-text-primary">
                Notes (optional)
              </Label>
              <Textarea
                id="notes"
                placeholder="Any additional details..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={loading}
                className="rounded-xl border-2 font-[family-name:var(--font-dm-sans)]"
                rows={3}
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4">
              <Button
                type="submit"
                className="flex-1 h-12 rounded-xl font-[family-name:var(--font-nunito)] font-bold border-0 shadow-lg hover:shadow-xl transition-all hover:scale-105"
                style={{
                  backgroundColor: 'var(--pastel-mint)',
                  color: 'white',
                }}
                disabled={loading || deleting}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={handleDelete}
                disabled={loading || deleting}
                className="rounded-xl font-[family-name:var(--font-nunito)] font-bold border-2"
                style={{
                  borderColor: 'var(--pastel-coral)',
                  color: 'var(--pastel-coral-dark)',
                }}
              >
                {deleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
                disabled={loading || deleting}
                className="rounded-xl font-[family-name:var(--font-nunito)] font-bold border-2"
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
