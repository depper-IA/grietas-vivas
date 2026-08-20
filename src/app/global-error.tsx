'use client';

import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { useEffect } from 'react';
import { MotionButton } from '@/components/ui/MotionButton';

/**
 * Error UI raíz para todo /app (next.js root error boundary).
 *
 * Captura excepciones no manejadas en layouts, suspense, render del
 * root layout o navegaciones críticas. Esta es la última línea de defensa
 * para que el usuario nunca vea una pantalla blanca en blanco durante una
 * emergencia sísmica.
 *
 * Diseño: minimalista, mobile-first, con tres acciones claras:
 *   - Reintentar (reset())
 *   - Volver a la vista anterior (history.back)
 *   - Ir al inicio (window.location)
 */

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('[Grietas Vivas] Root error boundary:', error);
  }, [error]);

  const handleGoHome = () => {
    window.location.href = '/';
  };

  return (
    <html lang="es" suppressHydrationWarning>
      <body suppressHydrationWarning>
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
                Algo salió mal
              </h1>
              <p className="text-sm text-text-secondary leading-relaxed">
                La aplicación encontró un error inesperado. Tu sesión de
                triaje no fue afectada y tu progreso local está seguro.
              </p>
            </div>

            {/* Caja de diagnóstico técnico */}
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
                aria-label="Reintentar cargar la aplicación"
                className="flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-2xl bg-brand-cta px-6 text-base font-bold text-white shadow-lg shadow-brand-cta/30 hover:bg-brand-cta/90 active:scale-[0.98] touch-manipulation focus:outline-none focus:ring-4 focus:ring-brand-accent focus:ring-offset-2 focus:ring-offset-surface-0"
              >
                <RefreshCw className="h-5 w-5 shrink-0" aria-hidden="true" />
                <span>Reintentar</span>
              </MotionButton>

              <MotionButton
                onClick={handleGoHome}
                aria-label="Ir al inicio"
                className="flex min-h-[48px] items-center justify-center gap-2 rounded-2xl border border-border-default bg-surface-0 px-4 text-sm font-semibold text-text-primary hover:border-brand-accent hover:bg-surface-1 active:scale-[0.98] touch-manipulation focus:outline-none focus:ring-2 focus:ring-brand-accent"
              >
                <Home className="h-4 w-4" aria-hidden="true" />
                <span>Ir al inicio</span>
              </MotionButton>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
