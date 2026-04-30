"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, Loader2 } from "lucide-react";
import { submitCancellationFeedback } from "@/app/actions/cancellation-feedback";

interface CancelFeedbackFormProps {
  initialReason: string | null;
}

export function CancelFeedbackForm({ initialReason }: CancelFeedbackFormProps) {
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedback.trim()) {
      setError("Please share at least a few words, or use the Skip button.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const res = await submitCancellationFeedback({
      reason: initialReason,
      feedback: feedback.trim(),
    });
    setSubmitting(false);
    if (!res.success) {
      setError(res.error ?? "Failed to send feedback");
      return;
    }
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <Card>
        <CardContent className="py-8 text-center space-y-4">
          <CheckCircle2 className="h-12 w-12 mx-auto text-green-600" />
          <h2 className="font-[family-name:var(--font-nunito)] text-xl font-bold">
            Thank you
          </h2>
          <p className="font-[family-name:var(--font-dm-sans)] text-text-secondary">
            Your feedback has been sent through to the team. It really does help.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        {initialReason && (
          <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary">
            Stripe shared this reason: <strong>{initialReason}</strong>
          </p>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <Textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Anything we should know? What didn't work for you?"
            rows={5}
            disabled={submitting}
            maxLength={4000}
          />
          {error && (
            <p className="text-sm text-red-600 font-[family-name:var(--font-dm-sans)]">
              {error}
            </p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              disabled={submitting}
              onClick={() => setSubmitted(true)}
            >
              Skip
            </Button>
            <Button type="submit" disabled={submitting || !feedback.trim()}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                "Send feedback"
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
