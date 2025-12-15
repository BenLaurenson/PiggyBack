export function OptionCard({
  option,
  color,
  children,
}: {
  option: "A" | "B";
  color: "blue" | "green";
  children: React.ReactNode;
}) {
  const borderColor = color === "blue" ? "border-l-blue-500" : "border-l-emerald-500";
  const badgeBg = color === "blue" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700";
  const label = option === "A" ? "Hosted Supabase" : "Local Supabase";

  return (
    <div className={`rounded-xl border border-border-light ${borderColor} border-l-4 bg-surface-elevated p-5`}>
      <div className="flex items-center gap-2 mb-3">
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full font-[family-name:var(--font-nunito)] ${badgeBg}`}>
          Option {option}: {label}
        </span>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}
