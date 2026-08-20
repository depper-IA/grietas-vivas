'use client';

import type { HeatmapZone } from '@/app/actions/heatmap';

interface HeatmapStatsProps {
  zones: HeatmapZone[];
}

/**
 * HeatmapStats — Barra de estadisticas globales del mapa de calor.
 * Muestra totales de reportes, porcentajes de severidad y zonas afectadas.
 */
export function HeatmapStats({ zones }: HeatmapStatsProps) {
  const totalReports = zones.reduce((sum, z) => sum + z.reportCount, 0);
  const totalCritical = zones.reduce((sum, z) => sum + z.criticalCount, 0);
  const totalHigh = zones.reduce((sum, z) => sum + z.highCount, 0);
  const totalMedium = zones.reduce((sum, z) => sum + z.mediumCount, 0);
  const totalLow = zones.reduce((sum, z) => sum + z.lowCount, 0);

  const pctCritical = totalReports > 0 ? Math.round((totalCritical / totalReports) * 100) : 0;
  const pctHigh = totalReports > 0 ? Math.round((totalHigh / totalReports) * 100) : 0;

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <StatCard
        label="Total reportes"
        value={totalReports}
        icon={
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        }
      />
      <StatCard
        label="Criticos"
        value={totalCritical}
        valueColor="text-status-critical"
        pct={pctCritical}
        icon={
          <svg className="h-5 w-5 text-status-critical" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        }
      />
      <StatCard
        label="Altos"
        value={totalHigh}
        valueColor="text-status-high"
        pct={pctHigh}
        icon={
          <svg className="h-5 w-5 text-status-high" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        }
      />
      <StatCard
        label="Zonas afectadas"
        value={zones.length}
        icon={
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        }
      />
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: number;
  valueColor?: string;
  pct?: number;
  icon: React.ReactNode;
}

function StatCard({ label, value, valueColor = 'text-text-primary', pct, icon }: StatCardProps) {
  return (
    <div className="rounded-xl border border-border-default bg-surface-1 p-4">
      <div className="flex items-center gap-2 text-text-muted mb-2">
        {icon}
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className={`text-2xl font-bold ${valueColor}`}>{value}</span>
        {pct !== undefined && (
          <span className="text-sm text-text-muted">({pct}%)</span>
        )}
      </div>
    </div>
  );
}
