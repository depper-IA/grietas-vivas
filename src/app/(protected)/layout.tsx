import { BottomNav } from '@/components/navigation/BottomNav';
import {
  LazyConnectivityIndicator,
  LazySyncStatus,
} from '@/components/sync/LazySyncWidgets';

export default function ProtectedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-[100dvh] pb-[calc(5rem+env(safe-area-inset-bottom))] bg-surface-0 text-text-primary">
      <LazyConnectivityIndicator />
      {children}
      <LazySyncStatus />
      <BottomNav />
    </div>
  );
}
