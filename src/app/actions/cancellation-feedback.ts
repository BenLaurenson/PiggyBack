"use server";

/**
 * Phase 4 instrumentation: cancellation_feedback.
 *
 * Captures the free-text "anything we should know?" entry from the
 * /account/cancel confirmation page, persists it to the cancellation_feedback
 * table, and emails the operator (email@benlaurenson.dev) via Resend if
 * RESEND_API_KEY is configured. Falls back to a structured console.log so
 * self-hosters without Resend still see the feedback in their logs.
 */

import { createClient } from "@/utils/supabase/server";
import { z } from "zod/v4";
import { safeErrorMessage } from "@/lib/safe-error";

const FeedbackSchema = z.object({
  reason: z.string().max(64).optional().nullable(),
  feedback: z.string().min(1).max(4000),
});

const OPERATOR_EMAIL = "email@benlaurenson.dev";

export interface SubmitCancellationFeedbackResult {
  success: boolean;
  error?: string;
}

/**
 * Email the operator. Best-effort: returns the result of the send so the
 * caller can log it, but never throws.
 */
async function sendOperatorEmail(params: {
  userEmail: string | null;
  userId: string | null;
  reason: string | null;
  feedback: string;
}): Promise<{ ok: boolean; via: "resend" | "console" }> {
  const apiKey = process.env.RESEND_API_KEY;
  const subject = `[PiggyBack] Cancellation feedback from ${params.userEmail ?? "anonymous"}`;
  const body = [
    `User ID: ${params.userId ?? "(none)"}`,
    `User email: ${params.userEmail ?? "(none)"}`,
    `Stripe reason: ${params.reason ?? "(not provided)"}`,
    "",
    "Feedback:",
    params.feedback,
  ].join("\n");

  if (!apiKey) {
    // No Resend configured — log to console so it's still visible in
    // Vercel/Docker logs.
    console.log(
      JSON.stringify({
        level: "cancellation_feedback",
        timestamp: new Date().toISOString(),
        to: OPERATOR_EMAIL,
        subject,
        body,
      })
    );
    return { ok: true, via: "console" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL ?? "PiggyBack <noreply@piggyback.finance>",
        to: [OPERATOR_EMAIL],
        subject,
        text: body,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.warn(
        JSON.stringify({
          level: "warn",
          source: "cancellation_feedback",
          msg: "resend send non-2xx",
          status: res.status,
        })
      );
      return { ok: false, via: "resend" };
    }
    return { ok: true, via: "resend" };
  } catch (err) {
    console.warn(
      JSON.stringify({
        level: "warn",
        source: "cancellation_feedback",
        msg: "resend send failed",
        error: err instanceof Error ? err.message : String(err),
      })
    );
    return { ok: false, via: "resend" };
  }
}

export async function submitCancellationFeedback(
  input: { reason?: string | null; feedback: string }
): Promise<SubmitCancellationFeedbackResult> {
  const parsed = FeedbackSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error:
        "Please share at least a few words (or leave the field blank to skip).",
    };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: "Not authenticated" };
    }

    const { error } = await supabase.from("cancellation_feedback").insert({
      user_id: user.id,
      email: user.email ?? null,
      reason: parsed.data.reason ?? null,
      feedback: parsed.data.feedback,
    });

    if (error) {
      return {
        success: false,
        error: safeErrorMessage(error, "Failed to save feedback"),
      };
    }

    // Email the operator (best-effort)
    void sendOperatorEmail({
      userEmail: user.email ?? null,
      userId: user.id,
      reason: parsed.data.reason ?? null,
      feedback: parsed.data.feedback,
    });

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: safeErrorMessage(err, "Failed to submit feedback"),
    };
  }
}
