"use client";

import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Home, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";

interface ErrorDisplayProps {
  variant: "error" | "not-found";
  error?: Error & { digest?: string };
  reset?: () => void;
  title?: string;
  description?: string;
  emoji?: string;
  showBackButton?: boolean;
  showHomeButton?: boolean;
  homeHref?: string;
}

const defaults = {
  error: {
    emoji: "😵",
    title: "Oops! Something went wrong",
    description:
      "We hit an unexpected bump. This has been logged and we\u2019ll look into it.",
  },
  "not-found": {
    emoji: "🔍",
    title: "Page not found",
    description:
      "The page you\u2019re looking for doesn\u2019t exist or may have been moved.",
  },
};

export function ErrorDisplay({
  variant,
  error,
  reset,
  title,
  description,
  emoji,
  showBackButton = true,
  showHomeButton = true,
  homeHref = "/home",
}: ErrorDisplayProps) {
  const router = useRouter();
  const d = defaults[variant];

  const resolvedEmoji = emoji || d.emoji;
  const resolvedTitle = title || d.title;
  const resolvedDescription = description || d.description;

  const bgColor =
    variant === "error" ? "var(--pastel-coral)" : "var(--pastel-blue)";

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-4">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="w-full max-w-md"
      >
        <Card
          className="border-0 shadow-lg rounded-2xl overflow-hidden"
          style={{ backgroundColor: "var(--surface-elevated)" }}
        >
          <CardContent className="pt-10 pb-8 px-8 text-center">
            {/* Emoji with pastel circle background */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{
                type: "spring",
                stiffness: 200,
                damping: 15,
                delay: 0.15,
              }}
              className="mx-auto mb-6 flex items-center justify-center"
            >
              <div
                className="w-24 h-24 rounded-full flex items-center justify-center"
                style={{ backgroundColor: bgColor, opacity: 0.15 }}
              />
              <span
                className="absolute text-6xl"
                style={{ lineHeight: 1 }}
              >
                {resolvedEmoji}
              </span>
            </motion.div>

            {/* Text */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.25, duration: 0.3 }}
            >
              <h2
                className="font-[family-name:var(--font-nunito)] font-bold text-xl mb-2"
                style={{ color: "var(--text-primary)" }}
              >
                {resolvedTitle}
              </h2>
              <p
                className="font-[family-name:var(--font-dm-sans)] text-sm mb-8 leading-relaxed"
                style={{ color: "var(--text-secondary)" }}
              >
                {resolvedDescription}
              </p>
            </motion.div>

            {/* Action buttons */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.3 }}
              className="flex items-center justify-center gap-3 flex-wrap"
            >
              {showBackButton && (
                <Button
                  variant="outline"
                  onClick={() => router.back()}
                  className="rounded-xl font-[family-name:var(--font-nunito)] font-bold gap-2 hover:scale-105 transition-all"
                  style={{
                    borderColor: "var(--border)",
                    color: "var(--text-primary)",
                  }}
                >
                  <ArrowLeft className="h-4 w-4" />
                  Go Back
                </Button>
              )}
              {showHomeButton && (
                <a href={homeHref}>
                  <Button
                    className="rounded-xl font-[family-name:var(--font-nunito)] font-bold gap-2 shadow-lg hover:shadow-xl hover:scale-105 transition-all border-0"
                    style={{
                      backgroundColor: "var(--pastel-blue)",
                      color: "white",
                    }}
                  >
                    <Home className="h-4 w-4" />
                    Dashboard
                  </Button>
                </a>
              )}
              {variant === "error" && reset && (
                <Button
                  onClick={reset}
                  className="rounded-xl font-[family-name:var(--font-nunito)] font-bold gap-2 shadow-lg hover:shadow-xl hover:scale-105 transition-all border-0"
                  style={{
                    backgroundColor: "var(--pastel-coral)",
                    color: "white",
                  }}
                >
                  <RefreshCw className="h-4 w-4" />
                  Try Again
                </Button>
              )}
            </motion.div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
