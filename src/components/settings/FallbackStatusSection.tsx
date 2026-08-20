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
 * Tambien muestra el contador de intentos gratuitos y un banner de advertencia
 * cuando quedan 1 o 0 intentos disponibles.
 */

import { useEffect, useState } from 'react';
import { Zap, Server, ShieldCheck, Sparkles, AlertTriangle, Settings } from 'lucide-react';
import { createBrowserSupabaseClient } from '@/lib/db/supabase';

const MAX_FALLBACK_PER_WEEK = 5;

interface FallbackUsage {
  used: number;
  resetAt: string | null;
}

export function FallbackStatusSection() {
  const [usage, setUsage] = useState<FallbackUsage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchUsage() {
      const supabase = createBrowserSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('users')
        .select('fallback_attempts_used, fallback_attempts_reset_at')
        .eq('id', user.id)
        .single();

      if (error || !data) {
        setUsage({ used: 0, resetAt: null });
      } else {
        setUsage({
          used: data.fallback_attempts_used ?? 0,
          resetAt: data.fallback_attempts_reset_at,
        });
      }
      setLoading(false);
    }

    void fetchUsage();
  }, []);

  const remaining = usage ? MAX_FALLBACK_PER_WEEK - usage.used : MAX_FALLBACK_PER_WEEK;
  const isWarning = remaining <= 1 && remaining > 0;
  const isCritical = remaining <= 0;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-text-primary">
            Modelos de Emergencia del Servidor (Gratuitos &amp; Sin Clave)
          </h2>
          <p className="text-xs text-text-muted mt-0.5">
            Disponibilidad garantizada y conmutacion automatica de tres capas
          </p>
        </div>
        <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-status-minor/20 text-status-minor-fg border border-status-minor-border/40 shrink-0">
          Activo
        </span>
      </div>

      {/* Contador de intentos gratuitos */}
      {!loading && (
        <div className="rounded-2xl border border-border-default bg-surface-1 p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-text-primary">
                Analisis gratuitos esta semana
              </span>
              {isWarning && !isCritical && (
                <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden="true" />
              )}
              {isCritical && (
                <AlertTriangle className="h-4 w-4 text-status-critical" aria-hidden="true" />
              )}
            </div>
            <span className="text-sm font-bold text-text-primary">
              {usage?.used ?? 0}/{MAX_FALLBACK_PER_WEEK}
            </span>
          </div>

          {/* Barra de progreso con 5 segmentos */}
          <div className="flex gap-1.5" aria-label={`${remaining} intentos restantes`}>
            {Array.from({ length: MAX_FALLBACK_PER_WEEK }).map((_, i) => {
              const isFilled = i < (usage?.used ?? 0);
              return (
                <div
                  key={i}
                  className={`h-2 flex-1 rounded-full transition-colors ${
                    isFilled
                      ? isCritical
                        ? 'bg-status-critical'
                        : isWarning
                        ? 'bg-amber-500'
                        : 'bg-brand-accent'
                      : 'bg-surface-2 border border-border-default'
                  }`}
                />
              );
            })}
          </div>

          {/* Banner de advertencia */}
          {isWarning && !isCritical && (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-300/50 bg-amber-50/70 p-3 text-xs text-amber-900">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" aria-hidden="true" />
              <span>
                Queda {remaining} intento{remaining !== 1 ? 's' : ''} gratuito{remaining !== 1 ? 's' : ''} esta semana.
              </span>
            </div>
          )}

          {isCritical && (
            <div className="flex items-start gap-2.5 rounded-xl border border-status-critical-border/50 bg-status-critical/10 p-3 text-xs text-status-critical">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                Has agotado los {MAX_FALLBACK_PER_WEEK} analisis gratuitos de esta semana.
              </span>
            </div>
          )}

          {/* Enlace a configuracion BYOK */}
          <div className="flex justify-end">
            <a
              href="/settings?tab=byok"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-accent hover:underline"
            >
              <Settings className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Configurar clave propia para analisis ilimitados</span>
            </a>
          </div>
        </div>
      )}

      {loading && (
        <div className="rounded-2xl border border-border-default bg-surface-1 p-4 shadow-sm">
          <div className="flex gap-1.5">
            {Array.from({ length: MAX_FALLBACK_PER_WEEK }).map((_, i) => (
              <div
                key={i}
                className="h-2 flex-1 rounded-full bg-surface-2 border border-border-default animate-pulse"
              />
            ))}
          </div>
        </div>
      )}

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
                  minimaxai/minimax-m3 - Servidor principal ultrarrapido
                </p>
              </div>
            </div>
          </div>
          <p className="text-xs text-text-secondary leading-relaxed">
            Servidor principal ultrarrapido para analisis visual y clasificacion de patrones sismicos. Se utiliza por defecto en todos los analisis mientras haya conexion.
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
                  google/gemma-3-4b-it:free - Vision comunitaria
                </p>
              </div>
            </div>
          </div>
          <p className="text-xs text-text-secondary leading-relaxed">
            Fallback secundario sin costo. Se activa automaticamente si el servidor principal experimenta sobrecarga, alta latencia o agotamiento de cuota.
          </p>
        </div>

        {/* 3. Motor Heuristico Offline (NSR-10) */}
        <div className="rounded-2xl border border-border-default bg-surface-1 p-4 sm:p-5 shadow-sm space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-red-100 flex items-center justify-center text-red-800 shrink-0">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-text-primary">
                    Motor Heuristico de Emergencia (Offline / NSR-10)
                  </p>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-950 border border-red-300">
                    Local Offline
                  </span>
                </div>
                <p className="text-xs font-mono text-text-muted mt-0.5">
                  Matriz FEMA 306 / NSR-10 - 100% en dispositivo
                </p>
              </div>
            </div>
          </div>
          <p className="text-xs text-text-secondary leading-relaxed">
            Modo de supervivencia local sin conexion. Si se cae la red celular o los servidores fallan, la app ejecuta un triaje pericial determinista inmediato protegiendo la vida del ciudadano.
          </p>
        </div>
      </div>

      {/* Explicacion de conmutacion */}
      <div className="rounded-xl border border-border-subtle bg-surface-2/60 p-3.5 text-xs text-text-secondary leading-relaxed flex items-start gap-2.5">
        <Sparkles className="h-4 w-4 text-brand-accent shrink-0 mt-0.5" aria-hidden="true" />
        <span>
          <strong>Conmutacion inteligente:</strong> Si estas online, el analisis se procesa con NVIDIA NIM. Si falla, pasa a OpenRouter. Si no hay internet o ambos fallan, el motor offline genera el triaje al instante en tu telefono.
        </span>
      </div>
    </section>
  );
}
