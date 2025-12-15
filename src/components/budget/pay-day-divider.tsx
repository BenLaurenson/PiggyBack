"use client";

interface PayDayDividerProps {
  date: string; // ISO date string e.g. "2025-02-20"
  dueBeforePayCents?: number | null;
  className?: string;
}

const formatCurrency = (cents: number) =>
  new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);

export function PayDayDivider({ date, dueBeforePayCents, className }: PayDayDividerProps) {
  const formatted = new Date(date + "T00:00:00").toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  return (
    <div className={`flex items-center gap-2 py-1.5 ${className || ""}`}>
      <div
        className="flex-1 h-px"
        style={{ backgroundColor: "var(--pastel-blue)" }}
      />
      <span
        className="font-[family-name:var(--font-dm-sans)] text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
        style={{
          backgroundColor: "var(--pastel-blue-light)",
          color: "var(--pastel-blue-dark)",
        }}
      >
        Payday {formatted}
        {dueBeforePayCents != null && dueBeforePayCents > 0 && (
          <> &middot; {formatCurrency(dueBeforePayCents)} due before</>
        )}
      </span>
      <div
        className="flex-1 h-px"
        style={{ backgroundColor: "var(--pastel-blue)" }}
      />
    </div>
  );
}
