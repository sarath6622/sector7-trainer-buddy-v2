'use client';

import { useEffect, Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import NProgress from 'nprogress';

// Configure once — thin bar, no spinner (we have skeletons for that)
NProgress.configure({ showSpinner: false, trickleSpeed: 200, minimum: 0.08 });

function Inner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Stop bar whenever the route settles
  useEffect(() => {
    NProgress.done();
  }, [pathname, searchParams]);

  // Start bar on any internal link tap/click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const anchor = (e.target as HTMLElement).closest('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href) return;
      // Skip external, hash-only, mailto, tel links
      if (
        href.startsWith('http') ||
        href.startsWith('//') ||
        href.startsWith('#') ||
        href.startsWith('mailto') ||
        href.startsWith('tel')
      )
        return;
      if (anchor.target === '_blank') return;
      // Skip if same page (no navigation will happen)
      const targetPath = href.split('?')[0];
      if (targetPath === pathname) return;
      NProgress.start();
    }

    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [pathname]);

  return null;
}

// Wrap in Suspense because useSearchParams needs it in App Router
export function NavigationProgress() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}
