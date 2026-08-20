'use client';

/**
 * ProgressionTimeline — Timeline visual con puntos de riesgo.
 *
 * Muestra una linea de tiempo con los analisis de un hogar/cluster
 * ordenados cronologicamente. Cada punto representa un analisis con su
 * nivel de riesgo codificado por color.
 */

import type { RiskLevel } from '@/lib/ai/types';

interface TimelineEntry {
  id: string;
  date: string;
  riskLevel: RiskLevel;
}

interface ProgressionTimelineProps {
  entries: TimelineEntry[];
  className?: string;
}

function getRiskColor(risk: RiskLevel): string {
  switch (risk) {
    case 'critical':
      return 'bg-status-critical ring-status-critical';
    case 'high':
      return 'bg-orange-500 ring-orange-500';
    case 'medium':
      return 'bg-yellow-500 ring-yellow-500';
    case 'low':
      return 'bg-emerald-500 ring-emerald-500';
    default:
      return 'bg-text-muted ring-text-muted';
  }
}

function getRiskLabel(risk: RiskLevel): string {
  switch (risk) {
    case 'critical':
      return 'Critico';
    case 'high':
      return 'Alto';
    case 'medium':
      return 'Medio';
    case 'low':
      return 'Bajo';
    default:
      return 'Desconocido';
  }
}

export function ProgressionTimeline({ entries, className = '' }: ProgressionTimelineProps) {
  if (entries.length === 0) {
    return (
      <div className={`text-center py-4 ${className}`}>
        <p className="text-sm text-text-muted">Sin analisis registrados</p>
      </div>
    );
  }

  const sortedEntries = [...entries].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  return (
    <div className={`space-y-3 ${className}`}>
      <h4 className="text-xs font-bold uppercase tracking-wider text-text-muted">
        Historial de Analisis
      </h4>
      <div className="relative pl-6">
        <div className="absolute left-2 top-2 bottom-2 w-0.5 bg-border-default" aria-hidden="true" />
        <ol className="space-y-4">
          {sortedEntries.map((entry, index) => {
            const isLatest = index === sortedEntries.length - 1;
            return (
              <li key={entry.id} className="relative flex items-start gap-3">
                <div
                  className={`absolute left-[-18px] h-4 w-4 rounded-full ring-2 ring-surface-0 ${getRiskColor(entry.riskLevel)} ${
                    isLatest ? 'scale-125' : ''
                  }`}
                  aria-hidden="true"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <time className="text-xs text-text-secondary" dateTime={entry.date}>
                      {new Date(entry.date).toLocaleDateString('es-CO', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </time>
                    <span
                      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${getRiskColor(entry.riskLevel)} text-white`}
                    >
                      {getRiskLabel(entry.riskLevel)}
                    </span>
                  </div>
                  {isLatest && (
                    <p className="text-[10px] text-brand-accent font-medium mt-0.5">Actual</p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
