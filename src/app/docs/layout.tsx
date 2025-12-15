import { Nunito, DM_Sans } from "next/font/google";
import { LandingHeader } from "@/components/landing/landing-header";
import { LandingFooter } from "@/components/landing/landing-footer";
import { DocSidebar } from "./_components/doc-sidebar";

const nunito = Nunito({
  subsets: ["latin"],
  variable: "--font-nunito",
  weight: ["400", "600", "700", "800", "900"],
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  weight: ["400", "500"],
});

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`mint min-h-screen ${nunito.variable} ${dmSans.variable}`}>
      <LandingHeader />
      <div className="flex min-h-[calc(100vh-57px)]">
        <DocSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <main className="flex-1 w-full px-6 py-10 md:px-10 lg:px-16">
            {children}
          </main>
          <LandingFooter />
        </div>
      </div>
    </div>
  );
}
