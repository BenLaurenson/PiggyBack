import Link from "next/link";
import { Github, Heart, Coffee } from "lucide-react";

const GITHUB_URL = "https://github.com/BenLaurenson/PiggyBack";

export function LandingFooter() {
  return (
    <footer className="py-8 px-4 border-t border-border-light">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2.5">
            <span className="font-[family-name:var(--font-nunito)] font-extrabold text-text-dark">
              PiggyBack
            </span>
          </div>
          <nav className="flex flex-wrap items-center justify-center gap-6">
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary hover:text-text-dark transition-colors duration-200 inline-flex items-center gap-1 cursor-pointer"
            >
              <Github className="w-3.5 h-3.5" />
              GitHub
            </a>
            <Link
              href="/#features"
              className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary hover:text-text-dark transition-colors duration-200 cursor-pointer"
            >
              Features
            </Link>
            <Link
              href="/docs"
              className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary hover:text-text-dark transition-colors duration-200 cursor-pointer"
            >
              Documentation
            </Link>
            <Link
              href="/about"
              className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary hover:text-text-dark transition-colors duration-200 cursor-pointer"
            >
              About
            </Link>
            <a
              href="https://buymeacoffee.com/benlaurenson"
              target="_blank"
              rel="noopener noreferrer"
              className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary hover:text-text-dark transition-colors duration-200 inline-flex items-center gap-1 cursor-pointer"
            >
              <Coffee className="w-3.5 h-3.5" />
              Support
            </a>
            <Link
              href="/privacy"
              className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary hover:text-text-dark transition-colors duration-200 cursor-pointer"
            >
              Privacy
            </Link>
            <Link
              href="/terms"
              className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary hover:text-text-dark transition-colors duration-200 cursor-pointer"
            >
              Terms
            </Link>
          </nav>
          <div className="flex flex-col items-center md:items-end gap-1">
            <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-tertiary inline-flex items-center gap-1.5">
              Made with <Heart className="w-3.5 h-3.5 text-brand-coral fill-brand-coral" /> in Perth
            </p>
            <p className="font-[family-name:var(--font-dm-sans)] text-xs text-text-tertiary">
              Not affiliated with Up Bank
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
