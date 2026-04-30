import { redirect } from "next/navigation";
import { isFireEnabled } from "@/lib/feature-flags";

/**
 * /settings/fire is the FIRE configuration screen — hidden until the FIRE
 * feature ships in full. See /roadmap.
 */
export default function FireSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isFireEnabled()) {
    redirect("/roadmap");
  }
  return <>{children}</>;
}
