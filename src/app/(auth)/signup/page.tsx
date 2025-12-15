"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Nunito, DM_Sans } from "next/font/google";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle2 } from "lucide-react";

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

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName,
        },
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL || window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
  };

  if (success) {
    return (
      <div className={`mint min-h-screen flex items-center justify-center p-4 ${nunito.variable} ${dmSans.variable}`}>
        {/* Floating decorations */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
          <div className="absolute top-20 left-[10%] animate-float-slow">
            <span className="text-4xl opacity-40">✨</span>
          </div>
          <div className="absolute top-40 right-[15%] animate-float-delayed">
            <span className="text-3xl opacity-30">💌</span>
          </div>
          <div className="absolute bottom-[30%] left-[15%] animate-float">
            <span className="text-2xl opacity-30">📧</span>
          </div>
          <div className="absolute bottom-[20%] right-[10%] animate-float-slow">
            <span className="text-4xl opacity-40">🎉</span>
          </div>
        </div>

        <Card className="w-full max-w-md relative z-10 bg-surface-white-60 backdrop-blur-sm border-2 border-border-white-80 shadow-2xl">
          <CardHeader className="text-center space-y-4 pt-8">
            <div className="flex justify-center">
              <div className="relative w-32 h-32">
                <div className="absolute inset-0 bg-accent-teal-light rounded-[2rem] blur-2xl"></div>
                <div className="relative w-full h-full flex items-center justify-center">
                  <CheckCircle2 className="h-24 w-24 text-accent-teal" strokeWidth={2.5} />
                </div>
              </div>
            </div>
            <div>
              <CardTitle className="font-[family-name:var(--font-nunito)] text-3xl font-black text-text-primary">
                Check your email!
              </CardTitle>
              <CardDescription className="font-[family-name:var(--font-dm-sans)] text-base text-text-secondary mt-2">
                We&apos;ve sent a confirmation link to<br />
                <strong className="text-text-medium">{email}</strong>
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="text-center px-8">
            <p className="font-[family-name:var(--font-dm-sans)] text-text-secondary">
              Click the link in your email to verify your account and get started with PiggyBack.
            </p>
          </CardContent>
          <CardFooter className="px-8 pb-8">
            <Button
              variant="outline"
              className="w-full h-12 rounded-xl font-[family-name:var(--font-nunito)] font-bold border-2"
              onClick={() => router.push("/login")}
            >
              Back to login
            </Button>
          </CardFooter>
        </Card>

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

  return (
    <div className={`mint min-h-screen flex items-center justify-center p-4 ${nunito.variable} ${dmSans.variable}`}>
      {/* Floating decorations */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-20 left-[10%] animate-float-slow">
          <span className="text-4xl opacity-40">✨</span>
        </div>
        <div className="absolute top-40 right-[15%] animate-float-delayed">
          <span className="text-3xl opacity-30">🪙</span>
        </div>
        <div className="absolute bottom-[30%] left-[15%] animate-float">
          <span className="text-2xl opacity-30">💰</span>
        </div>
        <div className="absolute bottom-[20%] right-[10%] animate-float-slow">
          <span className="text-4xl opacity-40">💕</span>
        </div>
      </div>

      <Card className="w-full max-w-md relative z-10 bg-surface-white-60 backdrop-blur-sm border-2 border-border-white-80 shadow-2xl">
        <CardHeader className="text-center space-y-4 pt-8">
          <div className="flex justify-center">
            <div className="relative w-32 h-32">
              <Image
                src="/PiggyBackIcon.png"
                alt="PiggyBack"
                fill
                className="object-contain"
                priority
              />
            </div>
          </div>
          <div>
            <CardTitle className="font-[family-name:var(--font-nunito)] text-3xl font-black text-text-primary">
              Join PiggyBack
            </CardTitle>
            <CardDescription className="font-[family-name:var(--font-dm-sans)] text-base text-text-secondary mt-2">
              Start your savings journey together
            </CardDescription>
          </div>
        </CardHeader>
        <form onSubmit={handleSignup}>
          <CardContent className="space-y-4 px-8">
            {error && (
              <div className="p-4 text-sm bg-error-light border-2 border-error-border rounded-xl text-error-text">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="displayName" className="font-[family-name:var(--font-nunito)] font-bold text-text-medium">
                Display Name
              </Label>
              <Input
                id="displayName"
                type="text"
                placeholder="What should we call you?"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                disabled={loading}
                className="h-12 rounded-xl border-2 font-[family-name:var(--font-dm-sans)]"
              />
            </div>
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
            <div className="space-y-2">
              <Label htmlFor="password" className="font-[family-name:var(--font-nunito)] font-bold text-text-medium">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                minLength={6}
                className="h-12 rounded-xl border-2 font-[family-name:var(--font-dm-sans)]"
              />
              <p className="text-xs font-[family-name:var(--font-dm-sans)] text-text-tertiary">
                Must be at least 6 characters
              </p>
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
                  Creating account...
                </>
              ) : (
                "Create account"
              )}
            </Button>
            <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary text-center">
              Already have an account?{" "}
              <Link href="/login" className="text-brand-coral-hover hover:text-hover-text font-bold hover:underline">
                Sign in
              </Link>
            </p>
          </CardFooter>
        </form>
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
