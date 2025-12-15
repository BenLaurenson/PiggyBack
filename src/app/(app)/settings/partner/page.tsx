"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Nunito, DM_Sans } from "next/font/google";
import { createClient } from "@/utils/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, Users, UserPlus, Trash2, Pencil, Info } from "lucide-react";
import { saveManualPartner, removeManualPartner, getManualPartnerInfo, type ManualPartnerData } from "@/app/actions/partner";

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

export default function PartnerPage() {
  const [partners, setPartners] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [manualPartner, setManualPartner] = useState<ManualPartnerData | null>(null);
  const [showManualForm, setShowManualForm] = useState(false);
  const [removing, setRemoving] = useState(false);

  // Form fields
  const [formName, setFormName] = useState("");
  const [formDob, setFormDob] = useState("");
  const [formRetirementAge, setFormRetirementAge] = useState("");
  const [formSuperBalance, setFormSuperBalance] = useState("");
  const [formSuperRate, setFormSuperRate] = useState("11.5");

  const supabase = createClient();

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Get user's partnership and real partners
    const { data: membership } = await supabase
      .from("partnership_members")
      .select(`
        partnership_id,
        role,
        partnerships(name)
      `)
      .eq("user_id", user.id)
      .maybeSingle();

    if (membership) {
      const { data: members } = await supabase
        .from("partnership_members")
        .select(`
          user_id,
          role,
          profiles(display_name, avatar_url, email:id)
        `)
        .eq("partnership_id", membership.partnership_id)
        .neq("user_id", user.id);

      setPartners(members || []);
    }

    // Load manual partner info
    const manualResult = await getManualPartnerInfo();
    if (manualResult.success && manualResult.data) {
      setManualPartner(manualResult.data);
      populateForm(manualResult.data);
    }

    setLoading(false);
  }

  function populateForm(data: ManualPartnerData) {
    setFormName(data.name);
    setFormDob(data.date_of_birth || "");
    setFormRetirementAge(data.target_retirement_age?.toString() || "");
    setFormSuperBalance(data.super_balance_cents ? (data.super_balance_cents / 100).toFixed(2) : "");
    setFormSuperRate(data.super_contribution_rate?.toString() || "11.5");
  }

  const handleSaveManualPartner = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const result = await saveManualPartner({
      name: formName,
      date_of_birth: formDob || null,
      target_retirement_age: formRetirementAge ? parseInt(formRetirementAge) : null,
      super_balance_cents: formSuperBalance ? Math.round(parseFloat(formSuperBalance) * 100) : 0,
      super_contribution_rate: formSuperRate ? parseFloat(formSuperRate) : 11.5,
    });

    if (!result.success) {
      setError(result.error || "Failed to save partner");
    } else {
      setManualPartner({
        name: formName,
        date_of_birth: formDob || null,
        target_retirement_age: formRetirementAge ? parseInt(formRetirementAge) : null,
        super_balance_cents: formSuperBalance ? Math.round(parseFloat(formSuperBalance) * 100) : 0,
        super_contribution_rate: formSuperRate ? parseFloat(formSuperRate) : 11.5,
      });
      setShowManualForm(false);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    }

    setSaving(false);
  };

  const handleRemoveManualPartner = async () => {
    setRemoving(true);
    setError(null);

    const result = await removeManualPartner();

    if (!result.success) {
      setError(result.error || "Failed to remove partner");
    } else {
      setManualPartner(null);
      setShowManualForm(false);
      setFormName("");
      setFormDob("");
      setFormRetirementAge("");
      setFormSuperBalance("");
      setFormSuperRate("11.5");
    }

    setRemoving(false);
  };

  const hasRealPartner = partners.length > 0;

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
        <Link href="/settings" className="text-sm font-[family-name:var(--font-dm-sans)] text-text-secondary hover:text-text-primary flex items-center gap-1 mb-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Settings
        </Link>
        <h1 className="font-[family-name:var(--font-nunito)] text-3xl font-black text-text-primary">
          Partner
        </h1>
        <p className="font-[family-name:var(--font-dm-sans)] text-text-secondary">
          Manage your partner for shared budgeting
        </p>
      </div>

      {error && (
        <div className="p-4 text-sm bg-error-light border-2 border-error-border rounded-xl text-error-text mb-6">
          {error}
        </div>
      )}

      {success && (
        <div className="p-4 text-sm bg-accent-teal-light border-2 border-accent-teal-border rounded-xl text-accent-teal mb-6">
          Partner saved successfully!
        </div>
      )}

      {/* Current Partner (linked via 2Up) */}
      {hasRealPartner && (
        <Card className="bg-surface-white-60 backdrop-blur-sm border-2 border-border-white-80 shadow-lg mb-6">
          <CardHeader>
            <CardTitle className="font-[family-name:var(--font-nunito)] text-xl font-bold text-text-primary flex items-center gap-2">
              <Users className="h-5 w-5" />
              Linked Partner
            </CardTitle>
            <CardDescription className="font-[family-name:var(--font-dm-sans)]">
              Connected via shared 2Up account
            </CardDescription>
          </CardHeader>
          <CardContent>
            {partners.map((partner: any) => (
              <div key={partner.user_id} className="flex items-center justify-between p-4 rounded-2xl bg-secondary border border-border-white-60">
                <div className="flex items-center gap-3">
                  <Avatar className="h-12 w-12">
                    <AvatarFallback className="font-[family-name:var(--font-nunito)] font-bold bg-brand-coral/20 text-brand-coral-hover">
                      {partner.profiles?.display_name?.charAt(0) || "P"}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-[family-name:var(--font-nunito)] font-bold text-text-primary">
                      {partner.profiles?.display_name || "Partner"}
                    </p>
                    <Badge className="bg-accent-teal-light text-accent-teal border-0 font-[family-name:var(--font-nunito)] font-bold text-xs rounded-lg mt-1">
                      {partner.role}
                    </Badge>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Manual Partner Card (when exists and no real partner) */}
      {!hasRealPartner && manualPartner && !showManualForm && (
        <Card className="bg-surface-white-60 backdrop-blur-sm border-2 border-border-white-80 shadow-lg mb-6">
          <CardHeader>
            <CardTitle className="font-[family-name:var(--font-nunito)] text-xl font-bold text-text-primary flex items-center gap-2">
              <Users className="h-5 w-5" />
              Manual Partner
            </CardTitle>
            <CardDescription className="font-[family-name:var(--font-dm-sans)]">
              Partner added manually (not using PiggyBack)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-4 rounded-2xl bg-secondary border border-border-white-60">
              <div className="flex items-center gap-3">
                <Avatar className="h-12 w-12">
                  <AvatarFallback className="font-[family-name:var(--font-nunito)] font-bold bg-accent-purple/20 text-accent-purple">
                    {manualPartner.name.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-[family-name:var(--font-nunito)] font-bold text-text-primary">
                    {manualPartner.name}
                  </p>
                  <Badge className="bg-accent-purple/10 text-accent-purple border-0 font-[family-name:var(--font-nunito)] font-bold text-xs rounded-lg mt-1">
                    Manual
                  </Badge>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { populateForm(manualPartner); setShowManualForm(true); }}
                  className="rounded-xl font-[family-name:var(--font-nunito)] font-bold"
                >
                  <Pencil className="h-4 w-4 mr-1" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRemoveManualPartner}
                  disabled={removing}
                  className="rounded-xl font-[family-name:var(--font-nunito)] font-bold text-error-text hover:bg-error-light"
                >
                  {removing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
                  Remove
                </Button>
              </div>
            </div>

            {/* Quick stats */}
            {(manualPartner.super_balance_cents || manualPartner.date_of_birth || manualPartner.target_retirement_age) && (
              <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-3">
                {manualPartner.date_of_birth && (
                  <div className="p-3 rounded-xl bg-background border border-border-white-60">
                    <p className="font-[family-name:var(--font-dm-sans)] text-xs text-text-secondary">Date of Birth</p>
                    <p className="font-[family-name:var(--font-nunito)] font-bold text-text-primary text-sm">
                      {new Date(manualPartner.date_of_birth).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                )}
                {manualPartner.target_retirement_age && (
                  <div className="p-3 rounded-xl bg-background border border-border-white-60">
                    <p className="font-[family-name:var(--font-dm-sans)] text-xs text-text-secondary">Retirement Age</p>
                    <p className="font-[family-name:var(--font-nunito)] font-bold text-text-primary text-sm">{manualPartner.target_retirement_age}</p>
                  </div>
                )}
                {(manualPartner.super_balance_cents ?? 0) > 0 && (
                  <div className="p-3 rounded-xl bg-background border border-border-white-60">
                    <p className="font-[family-name:var(--font-dm-sans)] text-xs text-text-secondary">Super Balance</p>
                    <p className="font-[family-name:var(--font-nunito)] font-bold text-text-primary text-sm">
                      {new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format((manualPartner.super_balance_cents || 0) / 100)}
                    </p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Manual Partner Form */}
      {!hasRealPartner && (showManualForm || (!manualPartner && !showManualForm)) && (
        <Card className="bg-surface-white-60 backdrop-blur-sm border-2 border-border-white-80 shadow-lg mb-6">
          <CardHeader>
            <CardTitle className="font-[family-name:var(--font-nunito)] text-xl font-bold text-text-primary flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              {manualPartner ? "Edit Manual Partner" : "Add Manual Partner"}
            </CardTitle>
            <CardDescription className="font-[family-name:var(--font-dm-sans)]">
              Track your partner's income even if they don't use PiggyBack
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveManualPartner} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="partnerName" className="font-[family-name:var(--font-nunito)] font-bold text-text-primary">
                  Partner's Name *
                </Label>
                <Input
                  id="partnerName"
                  placeholder="e.g., Jordan"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  required
                  disabled={saving}
                  className="h-12 rounded-xl border-2 font-[family-name:var(--font-dm-sans)]"
                />
              </div>

              <div className="border-t border-border-white-60 pt-4 mt-4">
                <p className="font-[family-name:var(--font-nunito)] font-bold text-sm text-text-secondary mb-3">
                  FIRE Planning (Optional)
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="partnerDob" className="font-[family-name:var(--font-nunito)] font-bold text-text-primary">
                      Date of Birth
                    </Label>
                    <Input
                      id="partnerDob"
                      type="date"
                      value={formDob}
                      onChange={(e) => setFormDob(e.target.value)}
                      disabled={saving}
                      className="h-12 rounded-xl border-2 font-[family-name:var(--font-dm-sans)]"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="retirementAge" className="font-[family-name:var(--font-nunito)] font-bold text-text-primary">
                      Target Retirement Age
                    </Label>
                    <Input
                      id="retirementAge"
                      type="number"
                      placeholder="e.g., 60"
                      value={formRetirementAge}
                      onChange={(e) => setFormRetirementAge(e.target.value)}
                      disabled={saving}
                      className="h-12 rounded-xl border-2 font-[family-name:var(--font-dm-sans)]"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="superBalance" className="font-[family-name:var(--font-nunito)] font-bold text-text-primary">
                      Super Balance
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary">$</span>
                      <Input
                        id="superBalance"
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={formSuperBalance}
                        onChange={(e) => setFormSuperBalance(e.target.value)}
                        disabled={saving}
                        className="pl-7 h-12 rounded-xl border-2 font-[family-name:var(--font-dm-sans)]"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="superRate" className="font-[family-name:var(--font-nunito)] font-bold text-text-primary">
                      Super Contribution Rate
                    </Label>
                    <div className="relative">
                      <Input
                        id="superRate"
                        type="number"
                        step="0.1"
                        placeholder="11.5"
                        value={formSuperRate}
                        onChange={(e) => setFormSuperRate(e.target.value)}
                        disabled={saving}
                        className="h-12 rounded-xl border-2 font-[family-name:var(--font-dm-sans)] pr-8"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary">%</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  type="submit"
                  disabled={saving || !formName.trim()}
                  className="flex-1 h-12 rounded-xl font-[family-name:var(--font-nunito)] font-bold bg-brand-coral hover:bg-brand-coral-dark hover:scale-105 transition-all"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <UserPlus className="h-4 w-4 mr-2" />
                      {manualPartner ? "Update Partner" : "Add Partner"}
                    </>
                  )}
                </Button>
                {manualPartner && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowManualForm(false)}
                    className="h-12 rounded-xl font-[family-name:var(--font-nunito)] font-bold"
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Conflict warning: both real and manual partner */}
      {hasRealPartner && manualPartner && (
        <Card className="bg-warning-light border-2 border-warning-border mb-6">
          <CardContent className="pt-4">
            <h3 className="font-[family-name:var(--font-nunito)] font-bold text-text-primary mb-2">
              Manual partner data still configured
            </h3>
            <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary mb-3">
              Your partner has linked via 2Up, so the manual partner data for "{manualPartner.name}" is no longer needed. Removing it will also deactivate any manual partner income sources.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRemoveManualPartner}
              disabled={removing}
              className="rounded-xl font-[family-name:var(--font-nunito)] font-bold"
            >
              {removing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
              Remove Manual Partner Data
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Info */}
      <Card className="bg-info-light border-2 border-info-border">
        <CardContent className="pt-4">
          <h3 className="font-[family-name:var(--font-nunito)] font-bold text-text-primary mb-2 flex items-center gap-2">
            <Info className="h-4 w-4" />
            How Partner Linking Works
          </h3>
          <ul className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary space-y-1 list-disc list-inside">
            <li>If both partners use PiggyBack with Up Bank, linking happens automatically via shared 2Up accounts</li>
            <li>If your partner doesn't use PiggyBack, add them manually above to track their income in your budget</li>
            <li>Manual partner income will appear in your shared budget view</li>
            <li>If your partner joins later, you can remove the manual data and link via 2Up</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
