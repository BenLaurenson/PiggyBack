"use client";

import { motion } from "framer-motion";

interface PlanHealthRingProps {
  score: number; // 0-100
  size?: number;
}

export function PlanHealthRing({ score, size = 120 }: PlanHealthRingProps) {
  const strokeWidth = Math.max(6, Math.round(size * 0.08));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  const scoreFontSize = Math.max(12, Math.round(size * 0.2));
  const labelFontSize = Math.max(8, Math.round(size * 0.085));

  const getColor = (s: number) => {
    if (s >= 80) return "var(--pastel-mint)";
    if (s >= 50) return "var(--pastel-yellow)";
    return "var(--pastel-coral)";
  };

  const getLabel = (s: number) => {
    if (s >= 80) return "Healthy";
    if (s >= 50) return "Fair";
    return "Needs Work";
  };

  return (
    <div className="relative flex items-center justify-center flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--surface)"
          strokeWidth={strokeWidth}
        />
        {/* Animated fill */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={getColor(score)}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, ease: "easeOut", delay: 0.3 }}
        />
      </svg>
      {/* Center content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="font-black font-[family-name:var(--font-nunito)] leading-none"
          style={{ color: "var(--text-primary)", fontSize: scoreFontSize }}
        >
          {score}
        </span>
        <span
          className="font-medium font-[family-name:var(--font-dm-sans)] leading-tight"
          style={{ color: "var(--text-tertiary)", fontSize: labelFontSize }}
        >
          {getLabel(score)}
        </span>
      </div>
    </div>
  );
}
