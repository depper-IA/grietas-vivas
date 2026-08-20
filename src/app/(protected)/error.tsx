'use client';

import { AlertTriangle, RefreshCw, Home, ArrowLeft } from 'lucide-react';
import { useEffect } from 'react';
import { MotionButton } from '@/components/ui/MotionButton';

/**
 * Error UI para rutas dentro de (protected).
 * Captura crashes de renderizado, hydration mismatch y excepciones
 * durante el ciclo de vida del cliente.
 *
 * Diseño: minimalista táctil (CTA >= 48px) para que el usuario
 * pueda recuperar la sesión sin frustración durante un sismo.
 */

export default function ProtectedError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log en consola para diagnóstico en campo con un equipo bloqueado
    // eslint-disable-next-line no-console
    console.error('[Grietas Vivas] Protected route error:', error);
  }, [error]);

  const handleGoHome = () => {
    window.location.href = '/';
  };

  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      window.history.back();
    } else {
      handleGoHome();
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-surface-0 px-6 py-10 text-text-primary">
      <div className="w-full max-w-md text-center space-y-6">
        {/* Icono de alerta */}
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-status-critical/10 border border-status-critical/30">
          <AlertTriangle
            className="h-10 w-10 text-status-critical"
            aria-hidden="true"
          />
        </div>

        {/* Titulo y descripcion */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-text-primary">
            No se pudo mostrar la página
          </h1>
          <p className="text-sm text-text-secondary leading-relaxed">
            Ocurrió un error inesperado al renderizar esta vista. La sesión
            de captura no fue afectada y tu progreso local está seguro.
          </p>
        </div>

        {/* Caja de diagnóstico técnico (oculta para usuario final en producción) */}
        {error?.digest && (
          <div className="rounded-xl border border-border-default bg-surface-1 p-3 text-left">
            <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1">
              ID de seguimiento
            </p>
            <code className="text-xs font-mono text-text-secondary break-all">
              {error.digest}
            </code>
          </div>
        )}

        {/* Acciones */}
        <div className="flex flex-col gap-3 pt-2">
          <MotionButton
            onClick={reset}
            aria-label="Reintentar cargar la vista"
            className="flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-2xl bg-brand-cta px-6 text-base font-bold text-white shadow-lg shadow-brand-cta/30 hover:bg-brand-cta/90 active:scale-[0.98] touch-manipulation focus:outline-none focus:ring-4 focus:ring-brand-accent focus:ring-offset-2 focus:ring-offset-surface-0"
          >
            <RefreshCw className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span>Reintentar</span>
          </MotionButton>

          <div className="grid grid-cols-2 gap-3">
            <MotionButton
              onClick={handleBack}
              aria-label="Volver a la vista anterior"
              className="flex min-h-[48px] items-center justify-center gap-2 rounded-2xl border border-border-default bg-surface-0 px-4 text-sm font-semibold text-text-primary hover:border-brand-accent hover:bg-surface-1 active:scale-[0.98] touch-manipulation focus:outline-none focus:ring-2 focus:ring-brand-accent"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>Atrás</span>
            </MotionButton>

            <MotionButton
              onClick={handleGoHome}
              aria-label="Ir al inicio"
              className="flex min-h-[48px] items-center justify-center gap-2 rounded-2xl border border-border-default bg-surface-0 px-4 text-sm font-semibold text-text-primary hover:border-brand-accent hover:bg-surface-1 active:scale-[0.98] touch-manipulation focus:outline-none focus:ring-2 focus:ring-brand-accent"
            >
              <Home className="h-4 w-4" aria-hidden="true" />
              <span>Inicio</span>
            </MotionButton>
          </div>
        </div>
      </div>
    </div>
  );
}
