import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono, Chakra_Petch } from 'next/font/google';
import { Toaster } from 'sonner';
import { Providers } from '@/components/Providers';
import { NavigationProgress } from '@/components/layout/NavigationProgress';
import { PWAInstallPrompt } from '@/components/layout/PWAInstallPrompt';
import { SplashScreen } from '@/components/layout/SplashScreen';
import { SplashGate } from '@/components/layout/SplashGate';
import './globals.css';

const inter = Inter({
  variable: '--font-sans',
  subsets: ['latin'],
});

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const chakraPetch = Chakra_Petch({
  variable: '--font-logo',
  subsets: ['latin'],
  weight: ['400', '600', '700'],
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#1a1a1a',
  // Tells Android Chrome to shrink the layout viewport when the virtual
  // keyboard opens, so bottom-pinned elements (e.g. session rest-timer pill)
  // stay above the keyboard instead of being overlaid by it.
  interactiveWidget: 'resizes-content',
};

export const metadata: Metadata = {
  title: 'Sector 7',
  description: 'Gym Member Management & PT Session Platform',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Sector 7',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} ${chakraPetch.variable} h-[var(--app-height)] antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* TEMP viewport-debug logger (remove once the iOS cold-start layout
            bug is closed). Buffers a timestamped timeline of viewport
            geometry — screen/inner/visualViewport heights, safe-area insets
            (via env() probe), scrollY, --app-height — plus every relevant
            event, starting pre-paint. Read it later from Safari remote Web
            Inspector: window.__S7VV_DUMP(). Always buffers in memory only;
            persists to localStorage('s7-vv-log') across reloads when
            localStorage('s7-vv-debug')==='1'. Must run before the sizing
            script below so the first snapshot is pristine. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t0=Date.now(),buf=[],probe=null;try{probe=document.createElement('div');probe.style.cssText='position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)';document.documentElement.appendChild(probe)}catch(e){}function snap(ev){if(buf.length>=400)return;var v=window.visualViewport,cs=null;try{cs=probe?getComputedStyle(probe):null}catch(e){}buf.push({t:Date.now()-t0,ev:ev,sw:screen.width,sh:screen.height,iw:window.innerWidth,ih:window.innerHeight,ch:document.documentElement.clientHeight,vvh:v?Math.round(v.height*10)/10:null,vvot:v?v.offsetTop:null,sy:Math.round(window.scrollY),sat:cs?cs.paddingTop:null,sab:cs?cs.paddingBottom:null,ah:document.documentElement.style.getPropertyValue('--app-height')||null,dm:navigator.standalone||(window.matchMedia&&matchMedia('(display-mode: standalone)').matches)?'standalone':'browser'});try{if(localStorage.getItem('s7-vv-debug')==='1')localStorage.setItem('s7-vv-log',JSON.stringify(buf))}catch(e){}}window.__S7VV=buf;window.__S7VV_DUMP=function(){return JSON.stringify(buf)};snap('init');['DOMContentLoaded','load','pageshow','pagehide','orientationchange','resize','visibilitychange'].forEach(function(e){window.addEventListener(e,function(){snap(e)})});window.addEventListener('scroll',function(){snap('doc-scroll')},{passive:true});if(window.visualViewport){window.visualViewport.addEventListener('resize',function(){snap('vv-resize')});window.visualViewport.addEventListener('scroll',function(){snap('vv-scroll')})}var n=0,iv=setInterval(function(){snap('poll');if(++n>=24)clearInterval(iv)},250)})();`,
          }}
        />
        {/* Keep --app-height synced to the real on-screen height. On iOS
            standalone cold start the whole viewport geometry (layout viewport,
            100dvh, even visualViewport.height) settles a few frames after
            first paint with no resize event, so any value sampled pre-paint
            can be safe-area-short. iOS installed PWAs are always exactly
            fullscreen, so in iOS standalone mode use screen dimensions — correct
            from t=0 and immune to keyboard-driven vv shrinkage (session pages
            handle the keyboard via useKeyboardInset instead). Android standalone
            is NOT fullscreen (status/navigation bars sit outside the viewport,
            so screen.height overshoots and pushes the tab bar off-screen) and
            doesn't have the cold-start bug — it uses the visualViewport path
            like in-browser, with a short settle poll to catch silent
            corrections. Must run inline before first paint. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var d=document.documentElement;var ios=/iP(hone|ad|od)/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);var sa=ios&&(navigator.standalone||(window.matchMedia&&matchMedia('(display-mode: standalone)').matches));function s(){if(sa){var l=matchMedia('(orientation: landscape)').matches;d.style.setProperty('--app-height',(l?Math.min(screen.width,screen.height):Math.max(screen.width,screen.height))+'px');return}var v=window.visualViewport;if(!v)return;d.style.setProperty('--app-height',v.height+'px')}s();if(window.visualViewport){window.visualViewport.addEventListener('resize',s)}window.addEventListener('orientationchange',s);window.addEventListener('pageshow',s);var n=0;var iv=setInterval(function(){s();if(++n>=10)clearInterval(iv)},150)})();`,
          }}
        />
        {/* Preload splash letter images — fetched in parallel before JS runs */}
        {['s', 'e', 'c', 't', 'o', 'r', '7'].map((l) => (
          <link key={l} rel="preload" as="image" href={`/splash-vector/${l}.png`} />
        ))}
        <link rel="preload" as="image" href="/splash-vector/fitness.png" />
        <link rel="preload" as="image" href="/splash-vector/gym-crossfit.png" />
      </head>
      <body className="min-h-[var(--app-height)] flex flex-col">
        <SplashScreen />
        <NavigationProgress />
        <SplashGate>
          <Providers>{children}</Providers>
          <PWAInstallPrompt />
        </SplashGate>
        <Toaster
          position="bottom-right"
          toastOptions={{
            className: '!bg-card !text-foreground !border-border !ring-1 !ring-border/50',
          }}
          richColors
          closeButton
        />
      </body>
    </html>
  );
}
