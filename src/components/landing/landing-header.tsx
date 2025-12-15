import Link from "next/link";
import Image from "next/image";
import { Github } from "lucide-react";

const GITHUB_URL = "https://github.com/BenLaurenson/PiggyBack";

export function LandingHeader() {
  return (
    <header className="sticky top-0 z-50 backdrop-blur-xl bg-background/90 border-b border-border-light">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group cursor-pointer">
          <Image
            src="/images/piggyback-icon.png"
            alt=""
            width={28}
            height={28}
            className="object-contain transition-transform duration-200 group-hover:scale-110"
          />
          <span className="font-[family-name:var(--font-nunito)] text-xl font-extrabold text-text-dark">
            PiggyBack
          </span>
        </Link>
        <nav className="hidden md:flex items-center gap-6">
          <Link
            href="/#features"
            className="font-[family-name:var(--font-dm-sans)] text-sm text-text-label hover:text-text-subtle transition-colors duration-200 cursor-pointer"
          >
            Features
          </Link>
          <Link
            href="/#how-it-works"
            className="font-[family-name:var(--font-dm-sans)] text-sm text-text-label hover:text-text-subtle transition-colors duration-200 cursor-pointer"
          >
            How It Works
          </Link>
          <Link
            href="/about"
            className="font-[family-name:var(--font-dm-sans)] text-sm text-text-label hover:text-text-subtle transition-colors duration-200 cursor-pointer"
          >
            About
          </Link>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-[family-name:var(--font-dm-sans)] text-sm text-text-label hover:text-text-subtle transition-colors duration-200 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Github className="w-4 h-4" />
            GitHub
          </a>
        </nav>
        <div className="flex items-center gap-3">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:inline-flex font-[family-name:var(--font-nunito)] font-semibold text-sm text-text-label hover:text-text-subtle border border-border-medium hover:border-border-strong px-4 py-2 rounded-full transition-all duration-200 items-center gap-1.5 cursor-pointer"
          >
            <Github className="w-4 h-4" />
            View on GitHub
          </a>
          <Link
            href="/docs"
            className="font-[family-name:var(--font-nunito)] font-bold text-sm bg-brand-coral hover:bg-brand-coral-dark text-white px-5 py-2.5 rounded-full transition-all duration-200 hover:scale-105 hover:shadow-lg hover:shadow-shadow-coral cursor-pointer"
          >
            Deploy Now
          </Link>
        </div>
      </div>
    </header>
  );
}
