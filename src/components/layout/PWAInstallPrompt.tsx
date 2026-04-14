'use client';

import { useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const DISMISSED_KEY = 's7:pwa-install-dismissed';

function isDismissed() {
  try {
    return sessionStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isIOS() {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isInStandaloneMode() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches;
}

type PromptKind = 'none' | 'native' | 'ios';

function resolveInitialKind(): PromptKind {
  if (typeof window === 'undefined') return 'none';
  if (isInStandaloneMode()) return 'none';
  if (isDismissed()) return 'none';
  if (isIOS()) return 'ios';
  return 'none'; // updated to 'native' by beforeinstallprompt event
}

export function PWAInstallPrompt() {
  const [promptKind, setPromptKind] = useState<PromptKind>(resolveInitialKind);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    // iOS path is already resolved via lazy initializer — only wire up native prompt
    if (promptKind === 'ios') return;

    const handler = (e: Event) => {
      e.preventDefault();
      if (isDismissed()) return; // respect the user's dismissal
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setPromptKind('native');
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, [promptKind]);

  function dismiss() {
    try {
      sessionStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      // ignore storage errors (private browsing, etc.)
    }
    setPromptKind('none');
  }

  async function install() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setPromptKind('none');
    }
    setDeferredPrompt(null);
  }

  if (promptKind === 'none') return null;

  return (
    <div
      className={cn(
        'fixed bottom-0 left-0 right-0 z-50 px-4 pb-safe',
        'animate-in slide-in-from-bottom-4 duration-300',
      )}
      style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
    >
      <div className="mx-auto max-w-sm rounded-2xl border border-border/60 bg-card shadow-2xl shadow-black/40 ring-1 ring-border/30">
        <div className="flex items-start gap-3 p-4">
          {/* Icon */}
          <div className="shrink-0 flex h-10 w-10 items-center justify-center rounded-xl bg-[#E8652C]/15">
            <Download className="h-5 w-5 text-[#E8652C]" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold leading-snug">Install Sector 7</p>
            {promptKind === 'ios' ? (
              <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                Tap <Share className="inline h-3 w-3 mb-0.5" /> the <strong>Share</strong> button,
                then <strong>Add to Home Screen</strong> for the best experience.
              </p>
            ) : (
              <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                Add to your home screen for faster access and offline support.
              </p>
            )}

            {/* CTA — only for non-iOS (iOS shows manual instructions) */}
            {promptKind === 'native' && (
              <button
                onClick={install}
                className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-[#E8652C] px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 active:opacity-75"
              >
                <Download className="h-3 w-3" />
                Install app
              </button>
            )}
          </div>

          {/* Dismiss */}
          <button
            onClick={dismiss}
            className="shrink-0 rounded-lg p-1 text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Dismiss install prompt"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
