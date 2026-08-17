import dynamic from 'next/dynamic';
import { BottomNav } from '@/components/navigation/BottomNav';

const ConnectivityIndicator = dynamic(
  () =>
    import('@/components/sync/ConnectivityIndicator').then(
      (mod) => mod.ConnectivityIndicator
    ),
  { ssr: false }
);

const SyncStatus = dynamic(
  () =>
    import('@/components/sync/SyncStatus').then((mod) => mod.SyncStatus),
  { ssr: false }
);

export default function ProtectedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-[100dvh] pb-[calc(5rem+env(safe-area-inset-bottom))] bg-surface-0 text-text-primary">
      <ConnectivityIndicator />
      {children}
      <SyncStatus />
      <BottomNav />
    </div>
  );
}
