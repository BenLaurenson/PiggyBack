"use client";

import { useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Loader2, Mail } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { Nunito, DM_Sans } from "next/font/google";

const nunito = Nunito({
  subsets: ["latin"],
  variable: "--font-nunito",
  weight: ["600", "700", "800"]
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  weight: ["400", "500"]
});

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || window.location.origin}/update-password`,
    });

    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }

    setLoading(false);
  };

  return (
    <div className={`mint min-h-screen flex items-center justify-center p-4 ${nunito.variable} ${dmSans.variable}`}>
      {/* Floating decorations */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-20 left-[10%] animate-float-slow">
          <span className="text-4xl opacity-40">🔐</span>
        </div>
        <div className="absolute top-40 right-[15%] animate-float-delayed">
          <span className="text-3xl opacity-30">✨</span>
        </div>
        <div className="absolute bottom-[30%] left-[15%] animate-float">
          <span className="text-2xl opacity-30">📧</span>
        </div>
        <div className="absolute bottom-[20%] right-[10%] animate-float-slow">
          <span className="text-4xl opacity-40">🐷</span>
        </div>
      </div>

      <Card className="w-full max-w-md relative z-10 bg-surface-white-60 backdrop-blur-sm border-2 border-border-white-80 shadow-2xl">
        <CardHeader className="text-center space-y-4 pt-8">
          <div className="flex justify-center">
            <div className="relative w-24 h-24">
              <Image
                src="/PiggyBackIcon.png"
                alt="PiggyBack"
                fill
                className="object-contain"
                priority
              />
            </div>
          </div>
          {!sent ? (
            <div>
              <CardTitle className="font-[family-name:var(--font-nunito)] text-3xl font-black text-text-primary">
                Forgot Password?
              </CardTitle>
              <CardDescription className="font-[family-name:var(--font-dm-sans)] text-base text-text-secondary mt-2">
                No worries! Enter your email and we&apos;ll send you a reset link.
              </CardDescription>
            </div>
          ) : (
            <div>
              <div className="w-20 h-20 mx-auto mb-4 rounded-full flex items-center justify-center bg-pastel-mint-light">
                <Mail className="h-10 w-10 text-pastel-mint-dark" />
              </div>
              <CardTitle className="font-[family-name:var(--font-nunito)] text-2xl font-black text-text-primary">
                Check your inbox!
              </CardTitle>
              <CardDescription className="font-[family-name:var(--font-dm-sans)] text-base text-text-secondary mt-2">
                We&apos;ve sent a password reset link to <strong className="text-brand-coral">{email}</strong>
              </CardDescription>
            </div>
          )}
        </CardHeader>

        {!sent ? (
          <form onSubmit={handleReset}>
            <CardContent className="space-y-4 px-8">
              {error && (
                <div className="p-4 text-sm bg-error-light border-2 border-error-border rounded-xl text-error-text">
                  {error}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email" className="font-[family-name:var(--font-nunito)] font-bold text-text-medium">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                  className="h-12 rounded-xl border-2 font-[family-name:var(--font-dm-sans)]"
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-6 px-8 pb-8 pt-6">
              <Button
                type="submit"
                className="w-full h-12 rounded-xl font-[family-name:var(--font-nunito)] font-bold text-base bg-brand-coral hover:bg-brand-coral-dark transition-all hover:scale-105 hover:shadow-lg hover:shadow-shadow-coral"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Sending...
                  </>
                ) : (
                  "Send Reset Link"
                )}
              </Button>
              <Link
                href="/login"
                className="inline-flex items-center justify-center gap-2 text-sm font-[family-name:var(--font-dm-sans)] text-text-secondary hover:text-brand-coral-hover hover:underline transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to login
              </Link>
            </CardFooter>
          </form>
        ) : (
          <CardFooter className="flex flex-col gap-4 px-8 pb-8 pt-2">
            <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-tertiary text-center">
              Didn&apos;t receive the email? Check your spam folder or try again.
            </p>
            <Button
              onClick={() => setSent(false)}
              variant="outline"
              className="w-full h-12 rounded-xl font-[family-name:var(--font-nunito)] font-bold text-base border-2 hover:bg-pastel-mint-light transition-all"
            >
              Try another email
            </Button>
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 text-sm font-[family-name:var(--font-dm-sans)] text-text-secondary hover:text-brand-coral-hover hover:underline transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to login
            </Link>
          </CardFooter>
        )}
      </Card>

      {/* Custom animations */}
      <style jsx global>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-20px) rotate(5deg); }
        }
        @keyframes float-slow {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-15px) rotate(-3deg); }
        }
        @keyframes float-delayed {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-25px) rotate(8deg); }
        }
        .animate-float {
          animation: float 4s ease-in-out infinite;
        }
        .animate-float-slow {
          animation: float-slow 6s ease-in-out infinite;
        }
        .animate-float-delayed {
          animation: float-delayed 5s ease-in-out infinite 1s;
        }
      `}</style>
    </div>
  );
}
