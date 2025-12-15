"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Flame, ArrowRight } from "lucide-react";
import Link from "next/link";

export function FireSetupPrompt() {
  return (
    <Card
      className="border-0 shadow-sm"
      style={{ backgroundColor: "var(--surface-elevated)" }}
    >
      <CardContent className="py-12 flex flex-col items-center text-center">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
          style={{ backgroundColor: "rgba(249, 115, 22, 0.1)" }}
        >
          <Flame className="w-8 h-8 text-orange-500" />
        </div>
        <h2
          className="text-xl font-bold font-[family-name:var(--font-nunito)] mb-2"
          style={{ color: "var(--text-primary)" }}
        >
          Plan Your Financial Independence
        </h2>
        <p
          className="text-sm max-w-md mb-6"
          style={{ color: "var(--text-secondary)" }}
        >
          Set up your FIRE profile to see when you could retire early. We'll use
          your transaction data to calculate your FIRE number using the
          Australian two-bucket strategy (super + outside super).
        </p>
        <Link href="/settings/fire">
          <Button className="bg-orange-500 hover:bg-orange-600 text-white">
            Set Up FIRE Plan
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
