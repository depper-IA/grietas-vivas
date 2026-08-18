import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Grietas Vivas - Triaje Estructural Post-Sismo',
  description:
    'PWA para triaje preliminar de grietas post-sismo asistido por IA en edificaciones afectadas',
  manifest: '/manifest.webmanifest',
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
    <html lang="es">
      <body
        suppressHydrationWarning
        className="min-h-[100dvh] bg-surface-0 text-text-primary antialiased selection:bg-brand-accent/20 selection:text-brand-accent overflow-x-hidden"
      >
        {children}
      </body>
    </html>
  );
}
