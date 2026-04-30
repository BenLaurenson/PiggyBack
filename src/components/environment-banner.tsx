/**
 * Renders a sticky banner at the top of every page when the deployment is
 * NOT production. Set NEXT_PUBLIC_ENVIRONMENT to "staging" or "dev" on the
 * Vercel project to make it visible.
 *
 * Production deployments leave NEXT_PUBLIC_ENVIRONMENT unset (or set it to
 * "production" / blank) so this component renders nothing.
 */

const ENV = process.env.NEXT_PUBLIC_ENVIRONMENT;

const STYLES: Record<string, { bg: string; label: string }> = {
  staging: { bg: "bg-amber-500", label: "STAGING — test data only, do not connect a real Up PAT" },
  dev: { bg: "bg-purple-600", label: "DEV — local-style preview deployment" },
};

export function EnvironmentBanner() {
  if (!ENV || ENV === "production") return null;
  const style = STYLES[ENV] ?? { bg: "bg-red-600", label: ENV.toUpperCase() };

  return (
    <div
      className={`fixed top-0 inset-x-0 z-50 ${style.bg} text-white text-center text-xs font-bold py-1 px-2 tracking-wide`}
      style={{ fontFamily: "ui-monospace, SFMono-Regular, monospace" }}
      role="status"
      aria-live="polite"
    >
      {style.label}
    </div>
  );
}
