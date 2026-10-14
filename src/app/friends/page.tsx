import { Nunito, DM_Sans } from "next/font/google";
import type { Metadata } from "next";
import { LandingHeader } from "@/components/landing/landing-header";
import { LandingFooter } from "@/components/landing/landing-footer";

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

export const metadata: Metadata = {
  alternates: { canonical: "/friends" },
  title: "Friends - PiggyBack",
  description:
    "Friends of PiggyBack: VerticalAI, AI receptionists for Australian businesses, and Yabbie, an AI receptionist app. Both made in Perth.",
};

const FRIENDS = [
  {
    name: "VerticalAI",
    url: "https://verticalai.com.au",
    label: "verticalai.com.au",
    body: "VerticalAI builds AI receptionists for Australian businesses, from Perth. Its agent answers calls on the business's own number at any hour, takes bookings and puts urgent callers through.",
  },
  {
    name: "Yabbie",
    url: "https://www.yabbie.ai",
    label: "yabbie.ai",
    body: "Yabbie is an AI receptionist app for small businesses. It answers calls, captures leads and books appointments. Yabbie is in development and has a waitlist.",
  },
] as const;

export default function FriendsPage() {
  return (
    <div className={`mint min-h-screen ${nunito.variable} ${dmSans.variable}`}>
      <LandingHeader />

      <main className="max-w-3xl mx-auto px-4 py-16">
        <h1 className="font-[family-name:var(--font-nunito)] text-4xl font-black text-text-primary mb-12">
          Friends
        </h1>

        <div className="space-y-6 font-[family-name:var(--font-dm-sans)] text-text-medium leading-relaxed">
          {FRIENDS.map((f) => (
            <section
              key={f.name}
              className="bg-surface-white-60 rounded-2xl border-2 border-border-white-80 p-6 md:p-8"
            >
              <h2 className="font-[family-name:var(--font-nunito)] text-2xl font-bold text-text-primary mb-3">
                <a
                  href={f.url}
                  target="_blank"
                  rel="noopener"
                  className="hover:text-brand-coral-hover transition-colors duration-200 cursor-pointer"
                >
                  {f.name}
                </a>
              </h2>
              <p className="mb-4">{f.body}</p>
              <a
                href={f.url}
                target="_blank"
                rel="noopener"
                className="text-sm text-brand-coral-hover hover:underline cursor-pointer"
              >
                {f.label}
              </a>
            </section>
          ))}
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}
