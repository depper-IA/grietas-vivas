'use client';

/**
 * ClusterCard — Card mostrando estado, tendencia y ultimo reporte de cada hogar.
 *
 * Agrupa los reportes de un mismo hogar (cluster ~111m) y muestra:
 * - Estado actual (peor riesgo del cluster)
 * - Tendencia (comparando ultimos 2 vs 2 anteriores)
 * - Ultimo analisis con fecha
 */

import Link from 'next/link';
import { TrendingUp, TrendingDown, Minus, ChevronRight } from 'lucide-react';
import type { RiskLevel } from '@/lib/ai/types';
import { ProgressionTimeline } from './ProgressionTimeline';

type TrendDirection = 'worsening' | 'improving' | 'stable';

interface ClusterEntry {
  id: string;
  date: string;
  riskLevel: RiskLevel;
}

interface ClusterCardProps {
  clusterId: string;
  entries: ClusterEntry[];
  className?: string;
}

function getWorstRisk(entries: ClusterEntry[]): RiskLevel {
  const riskOrder: RiskLevel[] = ['critical', 'high', 'medium', 'low'];
  let worst: RiskLevel = 'low';
  for (const entry of entries) {
    const idx = riskOrder.indexOf(entry.riskLevel as RiskLevel);
    const worstIdx = riskOrder.indexOf(worst);
    if (idx < worstIdx) {
      worst = entry.riskLevel as RiskLevel;
    }
  }
  return worst;
}

function calculateTrend(entries: ClusterEntry[]): TrendDirection {
  if (entries.length < 2) return 'stable';

  const sorted = [...entries].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  const recent = sorted.slice(0, 2);
  const previous = sorted.slice(2, 4);

  if (recent.length === 0 || previous.length === 0) return 'stable';

  const riskOrder: RiskLevel[] = ['critical', 'high', 'medium', 'low'];

  const avgRecent =
    recent.reduce((sum, e) => sum + riskOrder.indexOf(e.riskLevel as RiskLevel), 0) /
    recent.length;
  const avgPrevious =
    previous.reduce((sum, e) => sum + riskOrder.indexOf(e.riskLevel as RiskLevel), 0) /
    previous.length;

  if (avgRecent < avgPrevious) return 'worsening';
  if (avgRecent > avgPrevious) return 'improving';
  return 'stable';
}

function getRiskColor(risk: RiskLevel): string {
  switch (risk) {
    case 'critical':
      return 'text-status-critical bg-status-critical/10 border-status-critical/30';
    case 'high':
      return 'text-orange-500 bg-orange-500/10 border-orange-500/30';
    case 'medium':
      return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/30';
    case 'low':
      return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/30';
    default:
      return 'text-text-muted bg-surface-2 border-border-default';
  }
}

function getTrendIcon(trend: TrendDirection) {
  switch (trend) {
    case 'worsening':
      return <TrendingUp className="h-4 w-4 text-status-critical" aria-hidden="true" />;
    case 'improving':
      return <TrendingDown className="h-4 w-4 text-emerald-500" aria-hidden="true" />;
    case 'stable':
      return <Minus className="h-4 w-4 text-text-muted" aria-hidden="true" />;
  }
}

function getTrendLabel(trend: TrendDirection): string {
  switch (trend) {
    case 'worsening':
      return 'Empeorando';
    case 'improving':
      return 'Mejorando';
    case 'stable':
      return 'Estable';
  }
}

export function ClusterCard({ clusterId, entries, className = '' }: ClusterCardProps) {
  if (entries.length === 0) {
    return null;
  }

  const sorted = [...entries].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  const worstRisk = getWorstRisk(entries);
  const trend = calculateTrend(entries);
  const latestEntry = sorted[0];

  const latestDate = new Date(latestEntry.date).toLocaleDateString('es-CO', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div
      className={`rounded-2xl border border-border-default bg-surface-1 p-4 shadow-sm space-y-3 ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getRiskColor(worstRisk)}`}
            >
              {worstRisk.toUpperCase()}
            </span>
            <span className="text-[10px] text-text-muted">
              {entries.length} analisis
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {getTrendIcon(trend)}
            <span className="text-xs font-medium text-text-secondary">
              {getTrendLabel(trend)}
            </span>
          </div>
        </div>
        <Link
          href={`/reports?cluster=${clusterId}`}
          className="flex items-center gap-1 text-xs font-semibold text-brand-accent hover:underline shrink-0"
          aria-label={`Ver todos los analisis del hogar ${clusterId}`}
        >
          <span>Ver mas</span>
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>

      <div className="border-t border-border-subtle pt-3">
        <ProgressionTimeline entries={entries.slice(0, 4)} />
      </div>

      <div className="text-[10px] text-text-muted">
        Ultimo analisis: <time dateTime={latestEntry.date}>{latestDate}</time>
      </div>
    </div>
  );
}
