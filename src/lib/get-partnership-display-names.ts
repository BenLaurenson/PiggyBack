import type { SupabaseClient } from "@supabase/supabase-js";
import { getDisplayName } from "@/lib/user-display";

export interface PartnershipDisplayNames {
  /** Display name for the requesting user. Always populated. */
  userDisplayName: string;
  /** Display name for the partner — real partner profile, manual partner, or null when solo. */
  partnerDisplayName: string | null;
  /** auth.users.id of the partner — null when solo or partner is manual. */
  partnerUserId: string | null;
  /** Whether the partner is a `manual_partner_name` on partnerships (vs. a real linked account). */
  partnerIsManual: boolean;
}

/**
 * Resolve partner-aware display names for the requesting user and their partner.
 *
 * Resolution order for the partner side:
 *   1. Real partnership member (any other user_id in the partnership) → that user's
 *      profile display_name. Falls back to email local-part if display_name is null.
 *   2. Manual partner → partnerships.manual_partner_name (e.g. "Sarah").
 *   3. None → returns `null` for partnerDisplayName (solo user).
 *
 * Used to label the per-partner sub-lines in the 2Up budget view and the AI Split
 * Analysis card on /home with real names, never hard-coded "User A / User B".
 */
export async function getPartnershipDisplayNames(
  supabase: SupabaseClient,
  partnershipId: string,
  userId: string,
  selfFallbackName: string,
): Promise<PartnershipDisplayNames> {
  const userDisplayName = selfFallbackName;

  // Fetch partner profile (any other partnership_members row).
  const { data: members } = await supabase
    .from("partnership_members")
    .select("user_id, profiles(display_name, id)")
    .eq("partnership_id", partnershipId)
    .neq("user_id", userId)
    .limit(1);

  const partner = members?.[0] as
    | { user_id: string; profiles: { display_name: string | null; id: string } | null }
    | undefined;

  if (partner) {
    const profile = partner.profiles;
    return {
      userDisplayName,
      partnerDisplayName: getDisplayName(profile?.display_name, null, null) || "Partner",
      partnerUserId: partner.user_id,
      partnerIsManual: false,
    };
  }

  // No real partner — fall back to manual_partner_name.
  const { data: partnership } = await supabase
    .from("partnerships")
    .select("manual_partner_name")
    .eq("id", partnershipId)
    .maybeSingle();

  const manualName = partnership?.manual_partner_name as string | null | undefined;
  return {
    userDisplayName,
    partnerDisplayName: manualName ?? null,
    partnerUserId: null,
    partnerIsManual: true,
  };
}
