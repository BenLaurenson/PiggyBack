"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Nunito, DM_Sans } from "next/font/google";
import { createClient } from "@/utils/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Plus,
  Edit as EditIcon,
  Trash2,
  Check,
  Clock,
  Loader2,
  Repeat,
} from "lucide-react";
import { IncomeFromTransaction } from "@/components/settings/income-from-transaction";
import { AddIncomeManual } from "@/components/settings/add-income-manual";
import { AddIncomeOneOff } from "@/components/settings/add-income-oneoff";
import { getIncomeSources, getManualPartnerIncomeSources, deleteIncomeSource, markOneOffReceived } from "@/app/actions/income-sources";

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

interface IncomeSource {
  id: string;
  user_id: string;
  name: string;
  source_type: 'recurring-salary' | 'one-off';
  one_off_type?: string;
  amount_cents: number;
  frequency?: string;
  last_pay_date?: string;
  next_pay_date?: string;
  expected_date?: string;
  received_date?: string;
  is_received?: boolean;
  is_active: boolean;
}

export default function IncomeSettingsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const fromBudget = searchParams?.get("from") === "budget";

  // State
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [partnershipId, setPartnershipId] = useState<string | null>(null);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [accountIds, setAccountIds] = useState<string[]>([]);

  // Income sources
  const [yourIncomeSources, setYourIncomeSources] = useState<IncomeSource[]>([]);
  const [partnerIncomeSources, setPartnerIncomeSources] = useState<IncomeSource[]>([]);

  // Manual partner
  const [hasManualPartner, setHasManualPartner] = useState(false);
  const [manualPartnerName, setManualPartnerName] = useState("");

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [addModalView, setAddModalView] = useState<'choose' | 'transaction' | 'manual' | 'oneoff'>('choose');
  const [addingForPartner, setAddingForPartner] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Edit mode
  const [editingSource, setEditingSource] = useState<IncomeSource | null>(null);

  const supabase = createClient();

  // Load data
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setUserId(user.id);

      // Get user's accounts
      const { data: accounts } = await supabase
        .from("accounts")
        .select("id")
        .eq("user_id", user.id)
        .eq("is_active", true);

      const acctIds = accounts?.map(a => a.id) || [];
      setAccountIds(acctIds);

      // Get partnership
      const { data: membership } = await supabase
        .from("partnership_members")
        .select("partnership_id")
        .eq("user_id", user.id)
        .maybeSingle();

      let pshipId = null;
      let partnerUserId = null;
      if (membership) {
        pshipId = membership.partnership_id;
        setPartnershipId(pshipId);

        // Get partner
        const { data: members } = await supabase
          .from("partnership_members")
          .select("user_id")
          .eq("partnership_id", membership.partnership_id)
          .neq("user_id", user.id);

        if (members && members.length > 0) {
          partnerUserId = members[0].user_id;
          setPartnerId(partnerUserId);
        }
      }

      // Load YOUR income sources
      const yourResult = await getIncomeSources(user.id);
      if (yourResult.success) {
        setYourIncomeSources(yourResult.data as any);
      }

      // Load PARTNER income sources
      if (pshipId) {
        if (partnerUserId) {
          // Real partner: load their income sources
          const actualPartnerResult = await getIncomeSources(partnerUserId);
          if (actualPartnerResult.success && actualPartnerResult.data.length > 0) {
            setPartnerIncomeSources(actualPartnerResult.data as any);
          }
        } else {
          // No real partner — check for manual partner
          const { data: partnership } = await supabase
            .from("partnerships")
            .select("manual_partner_name")
            .eq("id", pshipId)
            .maybeSingle();

          if (partnership?.manual_partner_name) {
            setHasManualPartner(true);
            setManualPartnerName(partnership.manual_partner_name);
            const manualResult = await getManualPartnerIncomeSources(pshipId);
            if (manualResult.success) {
              setPartnerIncomeSources(manualResult.data as any);
            }
          }
        }
      }
    } catch (error) {
      console.error("Failed to load income data:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(cents / 100);
  };

  const formatDate = (dateString?: string | null) => {
    if (!dateString) return "Not set";
    return new Date(dateString).toLocaleDateString("en-AU", { month: "short", day: "numeric", year: "numeric" });
  };

  const handleDelete = async (id: string) => {
    // Optimistic UI update
    setYourIncomeSources(prev => prev.filter(s => s.id !== id));
    setPartnerIncomeSources(prev => prev.filter(s => s.id !== id));

    const result = await deleteIncomeSource(id);
    if (!result.success) {
      console.error('Failed to delete income source:', result.error);
      loadData(); // Reload on error
    }
  };

  const handleMarkReceived = async (id: string) => {
    const result = await markOneOffReceived(id);
    if (result.success) {
      loadData();
    }
  };

  const openAddModal = (forPartner = false) => {
    setAddingForPartner(forPartner);
    setAddModalView('choose');
    setShowAddModal(true);
  };

  if (loading) {
    return (
      <div className={`p-4 md:p-6 lg:p-8 max-w-4xl mx-auto ${nunito.variable} ${dmSans.variable}`}>
        <div className="text-center py-12">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-brand-coral" />
        </div>
      </div>
    );
  }

  return (
    <div className={`p-4 md:p-6 lg:p-8 max-w-4xl mx-auto ${nunito.variable} ${dmSans.variable}`}>
      {/* Header */}
      <div className="space-y-1 mb-6">
        <Link
          href={fromBudget ? "/budget" : "/settings"}
          className="text-sm font-[family-name:var(--font-dm-sans)] text-text-secondary hover:text-text-primary flex items-center gap-1 mb-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to {fromBudget ? "Budget" : "Settings"}
        </Link>
        <h1 className="font-[family-name:var(--font-nunito)] text-3xl font-black text-text-primary">
          Income Settings
        </h1>
        <p className="font-[family-name:var(--font-dm-sans)] text-text-secondary">
          Manage your salary and income sources
        </p>
      </div>

      {/* Your Income Card */}
      <Card className="bg-surface-white-60 backdrop-blur-sm border-2 border-border-white-80 shadow-lg mb-6">
        <CardContent className="pt-6">
          <h2 className="font-[family-name:var(--font-nunito)] text-lg font-bold text-text-primary mb-4">
            Your Income Sources
          </h2>

          {yourIncomeSources.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-4xl mb-4 opacity-20">💰</div>
              <p className="font-[family-name:var(--font-nunito)] font-bold text-lg mb-2 text-text-primary">
                No income sources yet
              </p>
              <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary">
                Add your first income source to start tracking
              </p>
            </div>
          ) : (
            <div className="space-y-3 mb-4">
              {yourIncomeSources.map((source) => (
                <div
                  key={source.id}
                  className="p-4 rounded-xl border-2 border-border hover:shadow-md transition-all"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-[family-name:var(--font-nunito)] font-bold text-text-primary">
                          {source.name}
                        </p>
                        {source.source_type === 'one-off' && (
                          <Badge variant="outline" className="font-[family-name:var(--font-dm-sans)] text-xs">
                            {source.one_off_type || 'One-off'}
                          </Badge>
                        )}
                        {source.source_type === 'one-off' && !source.is_received && (
                          <Clock className="w-4 h-4 text-text-secondary" />
                        )}
                        {(source.source_type === 'recurring-salary' || source.is_received) && (
                          <Check className="w-4 h-4 text-accent-teal" />
                        )}
                      </div>
                      <p className="font-[family-name:var(--font-nunito)] font-bold text-xl text-text-primary mb-1">
                        {formatCurrency(source.amount_cents)}
                      </p>
                      <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary">
                        {source.source_type === 'recurring-salary' ? (
                          <>
                            <span className="capitalize">{source.frequency}</span> • Last: {formatDate(source.last_pay_date)} • Next: {formatDate(source.next_pay_date)}
                          </>
                        ) : (
                          <>
                            {source.is_received ? `Received: ${formatDate(source.received_date)}` : `Expected: ${formatDate(source.expected_date)}`}
                          </>
                        )}
                      </p>
                    </div>
                    <div className="flex gap-2 flex-col sm:flex-row">
                      {source.source_type === 'one-off' && !source.is_received && (
                        <Button
                          size="sm"
                          className="font-[family-name:var(--font-dm-sans)] text-xs bg-accent-teal hover:bg-accent-teal/90"
                          onClick={() => handleMarkReceived(source.id)}
                        >
                          ✓ Received
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingSource(source);
                          setAddingForPartner(false);
                          setShowEditModal(true);
                        }}
                      >
                        <EditIcon className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setDeleteConfirmId(source.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <Button
            className="w-full h-12 rounded-xl font-[family-name:var(--font-nunito)] font-bold bg-brand-coral hover:bg-brand-coral-dark hover:scale-105 transition-all"
            onClick={() => openAddModal(false)}
          >
            <Plus className="w-5 h-5 mr-2" />
            Add Income Source
          </Button>
        </CardContent>
      </Card>

      {/* Partner Income Card */}
      {partnershipId && (partnerId || hasManualPartner) && (
        <Card className="bg-surface-white-60 backdrop-blur-sm border-2 border-border-white-80 shadow-lg">
          <CardContent className="pt-6">
            <h2 className="font-[family-name:var(--font-nunito)] text-lg font-bold text-text-primary mb-4">
              {hasManualPartner ? `${manualPartnerName}'s Income Sources` : "Partner's Income Sources"}
            </h2>

            {partnerIncomeSources.length === 0 ? (
              <div className="text-center py-8">
                <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary">
                  No partner income sources added yet
                </p>
              </div>
            ) : (
              <div className="space-y-3 mb-4">
                {partnerIncomeSources.map((source) => (
                  <div
                    key={source.id}
                    className="p-4 rounded-xl border-2 border-border hover:shadow-md transition-all"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1">
                        <p className="font-[family-name:var(--font-nunito)] font-bold text-text-primary mb-1">
                          {source.name}
                        </p>
                        <p className="font-[family-name:var(--font-nunito)] font-bold text-xl text-text-primary mb-1">
                          {formatCurrency(source.amount_cents)}
                        </p>
                        <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary">
                          <span className="capitalize">{source.frequency}</span> • Last: {formatDate(source.last_pay_date)} • Next: {formatDate(source.next_pay_date)}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingSource(source);
                            setAddingForPartner(true);
                            setShowEditModal(true);
                          }}
                        >
                          <EditIcon className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setDeleteConfirmId(source.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <Button
              className="w-full h-12 rounded-xl font-[family-name:var(--font-nunito)] font-bold bg-brand-coral hover:bg-brand-coral-dark hover:scale-105 transition-all"
              onClick={() => openAddModal(true)}
            >
              <Plus className="w-5 h-5 mr-2" />
              Add Partner Income
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Add Income Modal */}
      <Dialog open={showAddModal} onOpenChange={(open) => {
        setShowAddModal(open);
        if (!open) {
          setAddModalView('choose');
          setAddingForPartner(false);
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-[family-name:var(--font-nunito)] text-2xl font-black">
              Add Income Source {addingForPartner && <Badge className="ml-2">Partner</Badge>}
            </DialogTitle>
            <DialogDescription className="font-[family-name:var(--font-dm-sans)]">
              {addModalView === 'choose' ? 'Choose how to add your income' : 'Fill in the details below'}
            </DialogDescription>
          </DialogHeader>

          {addModalView === 'choose' ? (
            <div className="space-y-3">
              {/* Hide "From Transaction" for manual partners (no bank data) */}
              {!(addingForPartner && hasManualPartner) && (
                <button
                  onClick={() => setAddModalView('transaction')}
                  className="w-full p-4 text-left rounded-xl border-2 border-border hover:border-brand-coral hover:bg-brand-coral/5 transition-all"
                >
                  <div className="font-[family-name:var(--font-nunito)] font-bold text-text-primary mb-1">
                    🏦 From Transaction
                  </div>
                  <div className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary">
                    Automatically detect from your bank transactions
                  </div>
                </button>
              )}
              <button
                onClick={() => setAddModalView('manual')}
                className="w-full p-4 text-left rounded-xl border-2 border-border hover:border-brand-coral hover:bg-brand-coral/5 transition-all"
              >
                <div className="font-[family-name:var(--font-nunito)] font-bold text-text-primary mb-1">
                  ✍️ Manual Entry
                </div>
                <div className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary">
                  Enter salary details manually
                </div>
              </button>
              <button
                onClick={() => setAddModalView('oneoff')}
                className="w-full p-4 text-left rounded-xl border-2 border-border hover:border-brand-coral hover:bg-brand-coral/5 transition-all"
              >
                <div className="font-[family-name:var(--font-nunito)] font-bold text-text-primary mb-1">
                  💰 One-off Income
                </div>
                <div className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary">
                  Track tax refunds, bonuses, or one-time payments
                </div>
              </button>
            </div>
          ) : addModalView === 'transaction' ? (
            <IncomeFromTransaction
              userId={addingForPartner ? partnerId! : userId!}
              accountIds={accountIds}
              partnershipId={partnershipId || undefined}
              onSuccess={() => {
                setShowAddModal(false);
                loadData();
              }}
            />
          ) : addModalView === 'manual' ? (
            <AddIncomeManual
              userId={addingForPartner && partnerId ? partnerId : userId!}
              partnershipId={partnershipId!}
              existingSource={null}
              isManualPartnerIncome={addingForPartner && hasManualPartner}
              onSuccess={() => {
                setShowAddModal(false);
                loadData();
              }}
            />
          ) : (
            <AddIncomeOneOff
              userId={addingForPartner && partnerId ? partnerId : userId!}
              partnershipId={partnershipId!}
              existingSource={null}
              isManualPartnerIncome={addingForPartner && hasManualPartner}
              onSuccess={() => {
                setShowAddModal(false);
                loadData();
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Income Modal */}
      <Dialog open={showEditModal} onOpenChange={(open) => {
        setShowEditModal(open);
        if (!open) setEditingSource(null);
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-[family-name:var(--font-nunito)] text-2xl font-black">
              Edit Income Source {addingForPartner && <Badge className="ml-2">Partner</Badge>}
            </DialogTitle>
            <DialogDescription className="font-[family-name:var(--font-dm-sans)]">
              Update your income details
            </DialogDescription>
          </DialogHeader>
          {editingSource?.source_type === 'recurring-salary' ? (
            <AddIncomeManual
              userId={editingSource?.user_id || userId!}
              partnershipId={partnershipId!}
              existingSource={editingSource}
              onSuccess={() => {
                setShowEditModal(false);
                setEditingSource(null);
                loadData();
              }}
            />
          ) : (
            <AddIncomeOneOff
              userId={editingSource?.user_id || userId!}
              partnershipId={partnershipId!}
              existingSource={editingSource as any}
              onSuccess={() => {
                setShowEditModal(false);
                setEditingSource(null);
                loadData();
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmId !== null} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-[family-name:var(--font-nunito)] text-2xl font-bold text-error">
              Delete Income Source?
            </DialogTitle>
            <DialogDescription className="font-[family-name:var(--font-dm-sans)]">
              This will permanently remove this income source from your tracking. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmId(null)}
              disabled={deleting}
              className="rounded-xl font-[family-name:var(--font-nunito)] font-bold border-2"
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!deleteConfirmId) return;
                setDeleting(true);
                await handleDelete(deleteConfirmId);
                setDeleting(false);
                setDeleteConfirmId(null);
              }}
              disabled={deleting}
              className="rounded-xl font-[family-name:var(--font-nunito)] font-bold bg-error hover:bg-error/90"
            >
              {deleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
