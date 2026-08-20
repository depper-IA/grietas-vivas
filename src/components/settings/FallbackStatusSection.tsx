'use client';

/**
 * Fallback Status Section — Tarjetas del modo servidor/emergencia.
 *
 * Muestra las 3 capas de fallback que la app usa cuando el usuario NO
 * tiene BYOK configurado:
 *   1. NVIDIA NIM (Primario) — MiniMax M3 Vision
 *   2. OpenRouter (Secundario) — Gemma 3 Vision Free
 *   3. Motor Heurístico Offline (NSR-10) — supervivencia sin red
 *
 * Componente puramente presentacional, sin estado ni props. Extraido de
 * `settings/page.tsx` (sdd/improve-project 2.3) para reducir la pagina
 * de 730 LOC a un orquestador de ~120 LOC.
 */

import { Zap, Server, ShieldCheck, Sparkles } from 'lucide-react';

export function FallbackStatusSection() {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-text-primary">
            Modelos de Emergencia del Servidor (Gratuitos &amp; Sin Clave)
          </h2>
          <p className="text-xs text-text-muted mt-0.5">
            Disponibilidad garantizada y conmutación automática de tres capas
          </p>
        </div>
        <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-status-minor/20 text-status-minor-fg border border-status-minor-border/40 shrink-0">
          Activo
        </span>
      </div>

      <div className="grid gap-3">
        {/* 1. NVIDIA NIM (Primario) */}
        <div className="rounded-2xl border border-border-default bg-surface-1 p-4 sm:p-5 shadow-sm space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-brand-accent/15 flex items-center justify-center text-brand-accent shrink-0">
                <Zap className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-text-primary">
                    NVIDIA NIM (MiniMax M3 Vision)
                  </p>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-accent/20 text-brand-accent border border-brand-accent/30">
                    Principal
                  </span>
                </div>
                <p className="text-xs font-mono text-text-muted mt-0.5">
                  minimaxai/minimax-m3 · Servidor principal ultrarrápido
                </p>
              </div>
            </div>
          </div>
          <p className="text-xs text-text-secondary leading-relaxed">
            Servidor principal ultrarrápido para análisis visual y clasificación de patrones sísmicos. Se utiliza por defecto en todos los análisis mientras haya conexión.
          </p>
        </div>

        {/* 2. OpenRouter (Secundario) */}
        <div className="rounded-2xl border border-border-default bg-surface-1 p-4 sm:p-5 shadow-sm space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-brand-accent/10 flex items-center justify-center text-brand-accent shrink-0">
                <Server className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-text-primary">
                    OpenRouter (Gemma 3 Vision Free)
                  </p>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-surface-3 text-text-secondary border border-border-default">
                    Fallback 1
                  </span>
                </div>
                <p className="text-xs font-mono text-text-muted mt-0.5">
                  google/gemma-3-4b-it:free · Visión comunitaria
                </p>
              </div>
            </div>
          </div>
          <p className="text-xs text-text-secondary leading-relaxed">
            Fallback secundario sin costo. Se activa automáticamente si el servidor principal experimenta sobrecarga, alta latencia o agotamiento de cuota.
          </p>
        </div>

        {/* 3. Motor Heurístico Offline (NSR-10) */}
        <div className="rounded-2xl border border-border-default bg-surface-1 p-4 sm:p-5 shadow-sm space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-red-100 flex items-center justify-center text-red-800 shrink-0">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-text-primary">
                    Motor Heurístico de Emergencia (Offline / NSR-10)
                  </p>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-950 border border-red-300">
                    Local Offline
                  </span>
                </div>
                <p className="text-xs font-mono text-text-muted mt-0.5">
                  Matriz FEMA 306 / NSR-10 · 100% en dispositivo
                </p>
              </div>
            </div>
          </div>
          <p className="text-xs text-text-secondary leading-relaxed">
            Modo de supervivencia local sin conexión. Si se cae la red celular o los servidores fallan, la app ejecuta un triaje pericial determinista inmediato protegiendo la vida del ciudadano.
          </p>
        </div>
      </div>

      {/* Explicación de conmutación */}
      <div className="rounded-xl border border-border-subtle bg-surface-2/60 p-3.5 text-xs text-text-secondary leading-relaxed flex items-start gap-2.5">
        <Sparkles className="h-4 w-4 text-brand-accent shrink-0 mt-0.5" />
        <span>
          <strong>Conmutación inteligente:</strong> Si estás online, el análisis se procesa con NVIDIA NIM. Si falla, pasa a OpenRouter. Si no hay internet o ambos fallan, el motor offline genera el triaje al instante en tu teléfono.
        </span>
      </div>
    </section>
  );
}
