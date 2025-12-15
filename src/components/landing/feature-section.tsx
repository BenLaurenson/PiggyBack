"use client";

import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Image from "next/image";

export interface FeatureSectionProps {
  icon: LucideIcon;
  iconBg: string;
  mascotScene?: string;
  mascotAlt?: string;
  tagline: string;
  accentColor: string;
  title: string;
  description: string;
  highlights: string[];
  visual: React.ReactNode;
  direction?: "left" | "right";
}

export function FeatureSection({
  icon: Icon,
  iconBg,
  mascotScene,
  mascotAlt,
  tagline,
  accentColor,
  title,
  description,
  highlights,
  visual,
  direction = "left",
}: FeatureSectionProps) {
  const isReversed = direction === "right";

  return (
    <section className="py-16 md:py-24 px-4">
      <div className="max-w-6xl mx-auto">
        <div className={`grid md:grid-cols-2 gap-12 lg:gap-16 items-center`}>
          {/* Text side */}
          <motion.div
            initial={{ opacity: 0, x: isReversed ? 30 : -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.5 }}
            className={isReversed ? "md:order-2" : ""}
          >
            {mascotScene ? (
              <Image
                src={`/images/mascot/${mascotScene}`}
                alt={mascotAlt || tagline}
                width={240}
                height={280}
                className="w-24 h-auto max-h-28 object-contain mb-5"
              />
            ) : (
              <div className={`w-12 h-12 ${iconBg} rounded-xl flex items-center justify-center mb-5`}>
                <Icon className="w-6 h-6 text-text-medium" />
              </div>
            )}
            <p className={`font-[family-name:var(--font-nunito)] font-bold text-sm ${accentColor} uppercase tracking-wider mb-2`}>
              {tagline}
            </p>
            <h2 className="font-[family-name:var(--font-nunito)] text-3xl md:text-4xl font-black text-text-primary mb-4">
              {title}
            </h2>
            <p className="font-[family-name:var(--font-dm-sans)] text-text-secondary mb-6 leading-relaxed">
              {description}
            </p>
            <ul className="space-y-3">
              {highlights.map((highlight) => (
                <li
                  key={highlight}
                  className="flex items-start gap-3 font-[family-name:var(--font-dm-sans)] text-sm text-text-medium"
                >
                  <span className="w-5 h-5 bg-brand-coral rounded-full flex items-center justify-center text-white flex-shrink-0 mt-0.5">
                    <ChevronRight className="w-3 h-3" />
                  </span>
                  {highlight}
                </li>
              ))}
            </ul>
          </motion.div>

          {/* Visual side */}
          <motion.div
            initial={{ opacity: 0, x: isReversed ? -30 : 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className={isReversed ? "md:order-1" : ""}
          >
            {visual}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
