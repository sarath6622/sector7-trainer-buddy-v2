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
      className={`${inter.variable} ${jetbrainsMono.variable} ${chakraPetch.variable} h-dvh antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Preload splash letter images — fetched in parallel before JS runs */}
        {['s', 'e', 'c', 't', 'o', 'r', '7'].map((l) => (
          <link key={l} rel="preload" as="image" href={`/splash-vector/${l}.png`} />
        ))}
        <link rel="preload" as="image" href="/splash-vector/gym-crossfit.png" />
      </head>
      <body className="min-h-dvh flex flex-col">
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
