import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-surface-0 px-4 py-8 sm:px-6 sm:py-12 text-text-primary pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] overflow-x-hidden">
      {/* Background glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-brand-accent/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-md">
        <div className="mb-6 text-center">
          <Link href="/" className="inline-flex items-center justify-center gap-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-accent" aria-label="Ir al inicio de Grietas Vivas">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-2 border border-border-strong shadow-md transition-transform active:scale-95">
              <ShieldCheck className="h-6 w-6 text-brand-accent" aria-hidden="true" />
            </div>
          </Link>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-text-primary">Grietas Vivas</h1>
          <p className="mt-1 text-xs font-medium text-brand-accent uppercase tracking-wider">
            Triaje Estructural Post-Sismo
          </p>
        </div>
        <div className="rounded-2xl border border-border-default bg-surface-1 p-6 sm:p-8 shadow-2xl">
          {children}
        </div>
      </div>
    </div>
  );
}
