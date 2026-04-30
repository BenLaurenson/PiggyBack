import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { CancelFeedbackForm } from "@/components/account/cancel-feedback-form";

/**
 * /account/cancel — confirmation page after a Stripe Customer Portal
 * cancellation. Stripe redirects users back here after they confirm
 * (the Customer Portal is configured to use this URL via the
 * `flow_data[after_completion]` setting; see docs/observability.md).
 *
 * Stripe also passes the cancellation reason via the ?reason= query
 * parameter when the operator has enabled cancellation reasons in the
 * Customer Portal config.
 */
export default async function CancelConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const reason = params.reason ?? null;

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-2xl mx-auto space-y-6">
      <div className="space-y-2">
        <h1 className="font-[family-name:var(--font-nunito)] text-3xl font-black text-text-primary">
          Sorry to see you go
        </h1>
        <p className="font-[family-name:var(--font-dm-sans)] text-text-secondary">
          Your subscription will end at the close of the current billing
          period. Anything we should know? It really helps us improve.
        </p>
      </div>

      <CancelFeedbackForm initialReason={reason} />
    </div>
  );
}
