export function StepNumber({ n }: { n: number }) {
  return (
    <span className="flex-shrink-0 w-8 h-8 rounded-full bg-brand-coral text-white font-[family-name:var(--font-nunito)] font-bold text-sm flex items-center justify-center">
      {n}
    </span>
  );
}
