"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

/**
 * Invisible client component that listens for Supabase auth state changes.
 *
 * Handles:
 * - SIGNED_OUT: redirect to /login (e.g. session expired, signed out in another tab)
 * - TOKEN_REFRESHED: no action needed (Supabase SDK handles token rotation)
 * - USER_UPDATED: refresh the page to pick up profile/metadata changes
 */
export function AuthStateListener() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        // Session expired or user signed out in another tab
        router.push("/login");
      } else if (event === "USER_UPDATED") {
        // Profile or metadata changed — refresh server data
        router.refresh();
      }
      // TOKEN_REFRESHED: handled automatically by Supabase SDK
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

  return null;
}
