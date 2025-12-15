"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Calendar, Loader2, Search, PenLine, ArrowLeft, CheckCircle, Plus } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { IncomeFromTransaction, type IncomeFromTransactionHandle } from "@/components/settings/income-from-transaction";
import { AddIncomeManual } from "@/components/settings/add-income-manual";
import { getIncomeSources } from "@/app/actions/income-sources";

interface IncomeStepProps {
  userId: string;
  onNext: () => void;
  onComplete: () => void;
}

interface IncomeSourceSummary {
  id: string;
  name: string;
  amount_cents: number;
  frequency?: string;
}

type View = "choice" | "from-transaction" | "manual";

export function IncomeStep({ userId, onNext, onComplete }: IncomeStepProps) {
  const [view, setView] = useState<View>("choice");
  const [accountIds, setAccountIds] = useState<string[]>([]);
  const [partnershipId, setPartnershipId] = useState<string | undefined>();
  const [addedSources, setAddedSources] = useState<IncomeSourceSummary[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const transactionRef = useRef<IncomeFromTransactionHandle>(null);

  useEffect(() => {
    const loadData = async () => {
      const supabase = createClient();

      // Get user's accounts
      const { data: accounts } = await supabase
        .from("accounts")
        .select("id")
        .eq("user_id", userId)
        .eq("is_active", true);

      setAccountIds(accounts?.map(a => a.id) || []);

      // Get partnership
      const { data: membership } = await supabase
        .from("partnership_members")
        .select("partnership_id")
        .eq("user_id", userId)
        .maybeSingle();

      if (membership) {
        setPartnershipId(membership.partnership_id);
      }

      // Load existing income sources
      const result = await getIncomeSources(userId);
      if (result.success && result.data.length > 0) {
        setAddedSources(result.data.map((s: any) => ({
          id: s.id,
          name: s.name,
          amount_cents: s.amount_cents,
          frequency: s.frequency,
        })));
      }

      setLoadingData(false);
    };

    loadData();
  }, [userId]);

  const handleIncomeAdded = (newIncome?: { id: string; name: string; amount_cents: number; frequency?: string }) => {
    if (newIncome) {
      setAddedSources(prev => [...prev, newIncome]);
    }
    setView("choice");
  };

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(Math.abs(cents) / 100);
  };

  const handleContinue = () => {
    if (addedSources.length > 0) {
      onComplete();
    } else {
      onNext();
    }
  };

  if (loadingData) {
    return (
      <div className="text-center py-12">
        <Loader2 className="h-8 w-8 animate-spin mx-auto" style={{ color: "var(--pastel-yellow)" }} />
      </div>
    );
  }

  // "From Transaction" view
  if (view === "from-transaction") {
    return (
      <div className="space-y-4">
        <button
          onClick={() => {
            transactionRef.current?.resetToSearch();
            setView("choice");
          }}
          className="flex items-center gap-1 text-sm font-[family-name:var(--font-dm-sans)]"
          style={{ color: "var(--text-secondary)" }}
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <IncomeFromTransaction
          ref={transactionRef}
          userId={userId}
          accountIds={accountIds}
          partnershipId={partnershipId}
          onSuccess={handleIncomeAdded}
        />
      </div>
    );
  }

  // "Manual" view
  if (view === "manual") {
    return (
      <div className="space-y-4">
        <button
          onClick={() => setView("choice")}
          className="flex items-center gap-1 text-sm font-[family-name:var(--font-dm-sans)]"
          style={{ color: "var(--text-secondary)" }}
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <AddIncomeManual
          userId={userId}
          partnershipId={partnershipId}
          onSuccess={handleIncomeAdded}
        />
      </div>
    );
  }

  // Choice view
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="p-4 rounded-full w-16 h-16 mx-auto flex items-center justify-center" style={{ backgroundColor: "var(--pastel-yellow-light)" }}>
          <Calendar className="h-8 w-8" style={{ color: "var(--pastel-yellow-dark)" }} />
        </div>
        <h2 className="text-xl font-[family-name:var(--font-nunito)] font-bold" style={{ color: "var(--text-primary)" }}>
          Set up your income
        </h2>
        <p className="font-[family-name:var(--font-dm-sans)]" style={{ color: "var(--text-secondary)" }}>
          {accountIds.length > 0
            ? "Find your salary in synced transactions, or enter it manually"
            : "Enter your income details to power budgets and projections"
          }
        </p>
      </div>

      {/* Added income sources */}
      {addedSources.length > 0 && (
        <div className="space-y-2 max-w-sm mx-auto">
          {addedSources.map((source) => (
            <div
              key={source.id}
              className="flex items-center gap-3 p-3 rounded-xl border"
              style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
            >
              <CheckCircle className="h-5 w-5 flex-shrink-0" style={{ color: "var(--pastel-mint)" }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-[family-name:var(--font-nunito)] font-bold truncate" style={{ color: "var(--text-primary)" }}>
                  {source.name}
                </p>
                <p className="text-xs font-[family-name:var(--font-dm-sans)]" style={{ color: "var(--text-tertiary)" }}>
                  {formatCurrency(source.amount_cents)} / {source.frequency || "month"}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div className="space-y-3 max-w-sm mx-auto">
        {accountIds.length > 0 && (
          <Button
            onClick={() => setView("from-transaction")}
            variant="outline"
            className="w-full h-14 rounded-xl font-[family-name:var(--font-nunito)] font-bold justify-start gap-3 border-2"
          >
            <div className="p-2 rounded-lg" style={{ backgroundColor: "var(--pastel-blue-light)" }}>
              <Search className="h-4 w-4" style={{ color: "var(--pastel-blue-dark)" }} />
            </div>
            <div className="text-left">
              <div style={{ color: "var(--text-primary)" }}>From Transaction</div>
              <div className="text-xs font-normal" style={{ color: "var(--text-tertiary)" }}>
                Find in your synced transactions
              </div>
            </div>
          </Button>
        )}

        <Button
          onClick={() => setView("manual")}
          variant="outline"
          className="w-full h-14 rounded-xl font-[family-name:var(--font-nunito)] font-bold justify-start gap-3 border-2"
        >
          <div className="p-2 rounded-lg" style={{ backgroundColor: "var(--pastel-yellow-light)" }}>
            <PenLine className="h-4 w-4" style={{ color: "var(--pastel-yellow-dark)" }} />
          </div>
          <div className="text-left">
            <div style={{ color: "var(--text-primary)" }}>Manual Entry</div>
            <div className="text-xs font-normal" style={{ color: "var(--text-tertiary)" }}>
              Enter your salary details manually
            </div>
          </div>
        </Button>

        {addedSources.length > 0 && (
          <div className="pt-2">
            <Button
              onClick={handleContinue}
              className="w-full rounded-xl font-[family-name:var(--font-nunito)] font-bold"
              style={{ backgroundColor: "var(--pastel-yellow)", color: "white" }}
            >
              Continue
            </Button>
          </div>
        )}

        <Button
          onClick={handleContinue}
          variant="ghost"
          className="w-full rounded-xl font-[family-name:var(--font-dm-sans)] text-sm"
          style={{ color: "var(--text-tertiary)" }}
        >
          {addedSources.length > 0 ? "Add more later" : "Skip for now"}
        </Button>
      </div>
    </div>
  );
}
