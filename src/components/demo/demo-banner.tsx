"use client";

import { ExternalLink } from "lucide-react";

const GITHUB_URL = "https://github.com/BenLaurenson/PiggyBack";

export function DemoBanner() {
  return (
    <div className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-amber-500/90 px-4 py-2 text-sm font-medium text-amber-950 backdrop-blur-sm">
      <span>
        You&apos;re viewing a demo with sample data. Changes won&apos;t be saved.
      </span>
      <a
        href={GITHUB_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 rounded-md bg-amber-950/10 px-2 py-0.5 text-xs font-semibold transition-colors hover:bg-amber-950/20"
      >
        Deploy your own
        <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}
