'use client';

import { Suspense, useEffect, useState, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { TvDashboard } from '@/components/tv/TvDashboard';

const TOKEN_STORAGE_KEY = 'sector7.tv.token';

export default function TvPage() {
  return (
    <Suspense fallback={<FullScreenMessage title="Loading…" />}>
      <TvPageInner />
    </Suspense>
  );
}

function TvPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const captured = useRef(false);

  // Capture ?token=... once, persist to localStorage, then clean the URL.
  // setState-in-effect is intentional: we need browser-only APIs (localStorage,
  // URLSearchParams from the router) that can't run during SSR.
  useEffect(() => {
    if (captured.current) return;
    captured.current = true;

    const urlToken = searchParams.get('token');
    if (urlToken) {
      localStorage.setItem(TOKEN_STORAGE_KEY, urlToken);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setToken(urlToken);
      router.replace('/tv');
    } else {
      const stored = localStorage.getItem(TOKEN_STORAGE_KEY);
      setToken(stored);
    }
    setHydrated(true);
  }, [searchParams, router]);

  if (!hydrated) {
    return <FullScreenMessage title="Loading…" />;
  }

  if (!token) {
    return (
      <FullScreenMessage
        title="No device token"
        subtitle="Open this page with ?token=... from the admin → TV Devices screen."
      />
    );
  }

  return <TvDashboard token={token} />;
}

function FullScreenMessage({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 px-12 text-center">
      <div className="text-6xl font-bold tracking-tight">{title}</div>
      {subtitle && <div className="text-2xl text-zinc-400 max-w-3xl">{subtitle}</div>}
    </div>
  );
}
