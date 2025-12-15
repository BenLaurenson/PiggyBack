"use client";

import { useEffect } from "react";
import { ErrorDisplay } from "@/components/ui/error-display";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return <ErrorDisplay variant="error" error={error} reset={reset} />;
}
