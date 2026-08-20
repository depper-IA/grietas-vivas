import Link from 'next/link';
import { Home, SearchX } from 'lucide-react';
import { MotionButton } from '@/components/ui/MotionButton';

/**
 * 404 not-found UI para toda la app.
 * Captura URLs inválidas que no matchean ninguna ruta.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-surface-0 px-6 py-10 text-text-primary">
      <div className="w-full max-w-md text-center space-y-6">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-surface-2 border border-border-default">
          <SearchX className="h-10 w-10 text-text-muted" aria-hidden="true" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-text-primary">
            Página no encontrada
          </h1>
          <p className="text-sm text-text-secondary leading-relaxed">
            La ruta solicitada no existe o fue movida. Verifica la URL o
            vuelve al inicio para reanudar el triaje sísmico.
          </p>
        </div>

        <Link
          href="/"
          aria-label="Volver al inicio"
          className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-brand-cta px-6 text-base font-bold text-white shadow-lg shadow-brand-cta/30 hover:bg-brand-cta/90 active:scale-[0.98] touch-manipulation focus:outline-none focus:ring-4 focus:ring-brand-accent focus:ring-offset-2 focus:ring-offset-surface-0"
        >
          <Home className="h-5 w-5" aria-hidden="true" />
          <span>Volver al inicio</span>
        </Link>
      </div>
    </div>
  );
}
