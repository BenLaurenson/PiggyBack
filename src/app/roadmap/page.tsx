import { Nunito, DM_Sans } from "next/font/google";
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

export const metadata = {
  title: "Roadmap — PiggyBack",
  description:
    "What's shipping now, what's next, and what's later. Public so you can see what you're getting into.",
};

interface Item {
  title: string;
  body: string;
}

const NOW: Item[] = [
  {
    title: "Up Bank API alignment + capability adds",
    body:
      "Typed errors, Retry-After handling, chunked-window transaction sync, single source of truth for Up types, defensive category insert when Up adds new categories, transaction notes / deep-link / attachment indicators surfaced from Up, real /tags listing for the activity tag picker, webhook delivery logs in admin tooling.",
  },
  {
    title: "Bug-fix sprint",
    body:
      "Budget→transaction linking, activity field overrides that survive re-syncs, goals progress formula and AI-suggested tasks, 2Up partner-split rules wired through to budgets, AEDT/AEST/AWST display.",
  },
  {
    title: "Hosted onboarding",
    body:
      "Sign in with Google, automatic provisioning of your Supabase project (Sydney region) and Vercel deployment, custom subdomain assignment, billing on Stripe at A$19/month.",
  },
];

const NEXT: Item[] = [
  {
    title: "FIRE tracking",
    body:
      "Net worth + savings rate + projected FI date with configurable safe withdrawal rate. The 'what if' simulator.",
  },
  {
    title: "Recurring investments",
    body:
      "Define a recurring investment, detect matching transactions, contribution-vs-growth breakdown, roll up into net worth.",
  },
  {
    title: "Tags on goals and investments",
    body:
      "The same tag system that already exists on transactions, extended polymorphically.",
  },
  {
    title: "Penny self-improvements",
    body:
      "Reorder Penny's tools by which ones users actually invoke. Trim the tools nobody uses; strengthen the ones that drive the experience.",
  },
];

const LATER: Item[] = [
  {
    title: "Up Home / mortgage / offset",
    body:
      "Track mortgage balance, interest rate, offset utilization. Whole new product surface — needs its own design pass.",
  },
  {
    title: "Receipt attachments",
    body:
      "We already surface a paperclip icon when Up has an attachment. Fetching and displaying the receipt itself comes next.",
  },
  {
    title: "iOS / Android app",
    body:
      "Web-first today. Mobile is on the table once the hosted platform is stable and we have data on what users actually open on phones.",
  },
];

function Column({ heading, color, items }: { heading: string; color: string; items: Item[] }) {
  return (
    <div className="rounded-3xl bg-surface-white-60 border border-border-light p-6 md:p-8">
      <div className="flex items-center gap-2 mb-6">
        <span className={`w-2.5 h-2.5 rounded-full ${color}`} />
        <h2 className="font-[family-name:var(--font-nunito)] font-black text-xl text-text-primary uppercase tracking-wide">
          {heading}
        </h2>
      </div>
      <ul className="space-y-5">
        {items.map((item) => (
          <li key={item.title}>
            <h3 className="font-[family-name:var(--font-nunito)] font-bold text-base text-text-primary mb-1.5">
              {item.title}
            </h3>
            <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary leading-relaxed">
              {item.body}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function RoadmapPage() {
  return (
    <div className={`mint min-h-screen ${nunito.variable} ${dmSans.variable}`}>
      <LandingHeader />

      <section className="pt-16 md:pt-24 pb-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <p className="font-[family-name:var(--font-nunito)] font-bold text-sm text-brand-coral-hover uppercase tracking-wider mb-2">
              Public roadmap
            </p>
            <h1 className="font-[family-name:var(--font-nunito)] text-4xl md:text-5xl font-black text-text-primary mb-4">
              What we&apos;re building
            </h1>
            <p className="font-[family-name:var(--font-dm-sans)] text-base md:text-lg text-text-label max-w-2xl mx-auto">
              Three columns: <strong>Now</strong> is on a branch or about to
              merge. <strong>Next</strong> is queued after the current sprint
              ships. <strong>Later</strong> is committed to but not started.
              Priorities change as users tell us what they want.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            <Column heading="Now" color="bg-brand-coral" items={NOW} />
            <Column heading="Next" color="bg-accent-amber" items={NEXT} />
            <Column heading="Later" color="bg-accent-teal" items={LATER} />
          </div>

          <p className="text-center mt-10 font-[family-name:var(--font-dm-sans)] text-sm text-text-tertiary">
            See something missing? Open an issue at{" "}
            <a
              href="https://github.com/BenLaurenson/PiggyBack/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-coral hover:underline"
            >
              github.com/BenLaurenson/PiggyBack
            </a>
            .
          </p>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
