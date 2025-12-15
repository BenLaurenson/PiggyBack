/**
 * PiggyBack Logo - Solid Pastel Theme
 * Simple, clean wordmark in coral for warmth and approachability
 */

export function PiggyBackLogo({ className = "", size = "default" }: { className?: string; size?: "small" | "default" | "large" }) {
  const sizeClasses = {
    small: "text-xl",
    default: "text-2xl",
    large: "text-4xl"
  };

  return (
    <h1
      className={`font-[family-name:var(--font-nunito)] ${sizeClasses[size]} font-black tracking-tight ${className}`}
      style={{ color: 'var(--pastel-coral-dark)' }}
    >
      PiggyBack
    </h1>
  );
}

