import { CheckCircle2, AlertTriangle } from "lucide-react";

export function InfoBox({
  children,
  variant = "info",
}: {
  children: React.ReactNode;
  variant?: "info" | "warning";
}) {
  return (
    <div
      className={`rounded-xl border p-4 flex gap-3 text-sm ${
        variant === "warning"
          ? "bg-amber-50 border-amber-200 text-amber-900"
          : "bg-accent-teal-light/50 border-accent-teal/20 text-text-medium"
      }`}
    >
      {variant === "warning" ? (
        <AlertTriangle className="w-5 h-5 flex-shrink-0 text-amber-600 mt-0.5" />
      ) : (
        <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-accent-teal mt-0.5" />
      )}
      <div className="font-[family-name:var(--font-dm-sans)]">{children}</div>
    </div>
  );
}
