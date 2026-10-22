'use client';

import { Suspense, useEffect, useState } from 'react';
/* eslint-disable @next/next/no-img-element */
import { signIn, signOut } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff, Loader2, Lock, LogIn } from 'lucide-react';
import { SURFACE_COOKIE, defaultPathFor } from '@/lib/roles';
import {
  ACCESS_BLOCKED_COPY,
  isAccessBlockedReason,
  type AccessBlockedReason,
} from '@/lib/access-blocked';

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]!) : null;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl');
  const reasonParam = searchParams.get('reason');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // ADR-055: right password, but the member has left (or staff was deactivated).
  // Sign in stays disabled until they edit the email, so they can't keep retrying.
  const [blocked, setBlocked] = useState<AccessBlockedReason | null>(
    isAccessBlockedReason(reasonParam) ? reasonParam : null,
  );

  // Arrived here because access was revoked mid-session: drop the stale cookie.
  useEffect(() => {
    if (isAccessBlockedReason(reasonParam)) void signOut({ redirect: false });
  }, [reasonParam]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (isAccessBlockedReason(result?.error)) {
        setBlocked(result.error);
        setLoading(false);
        return;
      }

      if (result?.error) {
        setError('Invalid email or password');
        setLoading(false);
        return;
      }

      // Fetch user to get role for redirect
      const meResponse = await fetch('/api/auth/me');
      if (meResponse.ok) {
        const { data } = await meResponse.json();
        const roles = (data.user.roles as string[] | undefined) ?? [data.user.role as string];
        const redirectTo = callbackUrl ?? defaultPathFor(roles, readCookie(SURFACE_COOKIE)) ?? '/';
        router.push(redirectTo);
        router.refresh();
      } else {
        router.push('/');
        router.refresh();
      }
    } catch {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  return (
    <div className="dark flex min-h-[var(--app-height)] w-full bg-zinc-950 text-white">
      {/* Left — brand panel (desktop only) */}
      <div className="hidden lg:flex lg:w-[45%] items-center justify-center relative overflow-hidden border-r border-white/[0.06]">
        {/* Gradient glow behind logo */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[400px] w-[400px] rounded-full bg-primary/[0.07] blur-[120px]" />

        <div className="relative z-10 flex flex-col items-center gap-6 px-12 text-center">
          <img src="/sector7-logo.png" alt="Sector 7" width={220} className="drop-shadow-lg" />
          <div className="space-y-2 max-w-[280px]">
            <p className="text-lg font-medium text-white/80">Train smarter. Manage better.</p>
            <p className="text-sm text-zinc-500 leading-relaxed">
              Personal training management, scheduling, and client progress — all in one place.
            </p>
          </div>
        </div>
      </div>

      {/* Right — login form */}
      <div
        className="relative z-10 flex min-h-[var(--app-height)] flex-1 flex-col items-center justify-center px-6"
        style={{
          paddingTop: 'max(2rem, env(safe-area-inset-top))',
          paddingBottom: 'max(2rem, env(safe-area-inset-bottom))',
        }}
      >
        <div className="w-full max-w-[360px]">
          {/* Mobile logo — compact, closer to form */}
          <div className="flex flex-col items-center mb-8 lg:hidden">
            <img src="/sector7-logo.png" alt="Sector 7" width={140} className="drop-shadow-lg" />
          </div>

          {/* Form card */}
          <div className="rounded-2xl border border-white/[0.08] bg-zinc-900/80 p-7 space-y-6">
            {/* Header */}
            <div className="space-y-1.5 text-center lg:text-left">
              <h1 className="text-xl font-bold tracking-tight text-white">Sign in to Sector 7</h1>
              <p className="text-sm text-zinc-500">Enter your credentials to continue</p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label
                  htmlFor="email"
                  className="text-xs font-medium text-zinc-400 uppercase tracking-wider"
                >
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@sector7.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setBlocked(null);
                  }}
                  required
                  autoComplete="email"
                  className="h-11 rounded-xl border-white/[0.08] bg-white/[0.04] text-white placeholder:text-zinc-600 focus-visible:border-primary/50 focus-visible:ring-primary/20"
                />
              </div>

              <div className="space-y-1.5">
                <Label
                  htmlFor="password"
                  className="text-xs font-medium text-zinc-400 uppercase tracking-wider"
                >
                  Password
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="h-11 pr-10 rounded-xl border-white/[0.08] bg-white/[0.04] text-white placeholder:text-zinc-600 focus-visible:border-primary/50 focus-visible:ring-primary/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400 transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {blocked && (
                <div
                  role="alert"
                  className="flex gap-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3.5 py-3"
                >
                  <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-amber-300">
                      {ACCESS_BLOCKED_COPY[blocked].title}
                    </p>
                    <p className="text-xs leading-relaxed text-amber-200/80">
                      {ACCESS_BLOCKED_COPY[blocked].body}
                    </p>
                  </div>
                </div>
              )}

              {error && (
                <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-3 py-2.5 text-sm text-red-400">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                className="w-full h-11 gap-2 rounded-xl text-sm font-semibold"
                disabled={loading || blocked !== null}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  <>
                    <LogIn className="h-4 w-4" />
                    Sign in
                  </>
                )}
              </Button>
            </form>
          </div>

          {/* Footer */}
          <p className="mt-4 text-center text-xs text-zinc-700">
            Sector 7 Fitness &middot; Gym & CrossFit
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
