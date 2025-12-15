"use client";

import Image from "next/image";
import { Button } from "@/components/ui/button";
import { ChevronRight, User, CreditCard, Calendar, Brain } from "lucide-react";

interface WelcomeStepProps {
  onNext: () => void;
}

export function WelcomeStep({ onNext }: WelcomeStepProps) {
  return (
    <div className="text-center space-y-6">
      <div className="relative w-24 h-24 mx-auto">
        <Image src="/images/mascot/penny-ai-avatar.png" alt="PiggyBack" fill sizes="96px" className="object-contain" />
      </div>
      <div className="space-y-2">
        <h2 className="text-2xl font-[family-name:var(--font-nunito)] font-bold" style={{ color: "var(--text-primary)" }}>
          Welcome to PiggyBack!
        </h2>
        <p className="font-[family-name:var(--font-dm-sans)]" style={{ color: "var(--text-secondary)" }}>
          Let&apos;s get you set up. Most steps are optional — complete what matters to you.
        </p>
      </div>
      <div className="pt-4 space-y-3 text-left max-w-sm mx-auto">
        {[
          { icon: User, label: "Set up your profile" },
          { icon: CreditCard, label: "Connect your UP Bank account" },
          { icon: Calendar, label: "Configure your income" },
          { icon: Brain, label: "Set up AI assistant" },
        ].map(({ icon: Icon, label }) => (
          <div key={label} className="flex items-center gap-3 text-sm font-[family-name:var(--font-dm-sans)]" style={{ color: "var(--text-primary)" }}>
            <div className="p-2 rounded-lg" style={{ backgroundColor: "var(--surface)" }}>
              <Icon className="h-4 w-4" />
            </div>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <Button onClick={onNext} size="lg" className="mt-6 rounded-xl font-[family-name:var(--font-nunito)] font-bold" style={{ backgroundColor: "var(--pastel-coral)", color: "white" }}>
        Get Started <ChevronRight className="h-4 w-4 ml-2" />
      </Button>
    </div>
  );
}
