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
import { Loader2 } from "lucide-react";

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

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push("/home");
    router.refresh();
  };

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
              Welcome back!
            </CardTitle>
            <CardDescription className="font-[family-name:var(--font-dm-sans)] text-base text-text-secondary mt-2">
              Sign in to continue your savings journey
            </CardDescription>
          </div>
        </CardHeader>
        <form onSubmit={handleLogin}>
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
                className="h-12 rounded-xl border-2 font-[family-name:var(--font-dm-sans)]"
              />
              <div className="flex justify-end mt-1">
                <Link
                  href="/auth/forgot-password"
                  className="text-sm font-[family-name:var(--font-dm-sans)] hover:underline"
                  style={{ color: 'var(--pastel-blue-dark)' }}
                >
                  Forgot password?
                </Link>
              </div>
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
                  Signing in...
                </>
              ) : (
                "Sign in"
              )}
            </Button>
            <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary text-center">
              Don&apos;t have an account?{" "}
              <Link href="/signup" className="text-brand-coral-hover hover:text-hover-text font-bold hover:underline">
                Sign up
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
