import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Partnership membership record from the database.
 */
export interface PartnershipMembership {
  partnership_id: string;
  user_id: string;
  role?: string;
}

/**
 * Result of verifying partnership membership.
 */
export type PartnershipVerificationResult =
  | { valid: true; membership: PartnershipMembership }
  | { valid: false; membership?: undefined };

/**
 * Verify that a user is a member of a specific partnership.
 *
 * This is a shared utility to replace inline partnership checks
 * scattered across multiple API routes. It queries the
 * partnership_members table for the user+partnership combination.
 *
 * @param supabase - Supabase client instance
 * @param userId - The user ID to verify
 * @param partnershipId - The partnership ID to check membership in
 * @returns { valid: true, membership } if user is a member, { valid: false } otherwise
 */
export async function verifyPartnershipMembership(
  supabase: SupabaseClient,
  userId: string,
  partnershipId: string
): Promise<PartnershipVerificationResult> {
  const { data: membership, error } = await supabase
    .from("partnership_members")
    .select("partnership_id, user_id, role")
    .eq("user_id", userId)
    .eq("partnership_id", partnershipId)
    .maybeSingle();

  if (error || !membership) {
    return { valid: false };
  }

  return {
    valid: true,
    membership: membership as PartnershipMembership,
  };
}
