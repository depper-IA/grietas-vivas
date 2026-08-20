import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ServiceWorkerUpdater } from '@/components/sync/ServiceWorkerUpdater';

export const metadata: Metadata = {
  title: 'Grietas Vivas - Triaje Estructural Post-Sismo',
  description:
    'PWA para triaje preliminar de grietas post-sismo asistido por IA en edificaciones afectadas',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icons/favicon-64.png', type: 'image/png', sizes: '64x64' },
      { url: '/icons/icon-192x192.png', type: 'image/png', sizes: '192x192' },
    ],
    apple: [
      { url: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
      { url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
  themeColor: '#ffffff',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className="min-h-[100dvh] bg-surface-0 text-text-primary antialiased selection:bg-brand-accent/20 selection:text-brand-accent overflow-x-hidden"
      >
        <ServiceWorkerUpdater />
        {children}
      </body>
    </html>
  );
}
