/**
 * ReportCard — Wrapper de compatibilidad sobre `DamageReportCard`.
 *
 * Conserva la API previa (`ReportCardData` + Link wrapper para routing)
 * mientras delega el renderizado visual al componente moderno del slice 3
 * (tokens dark-first, badges semanticos, sin emojis).
 *
 * Migracion interna:
 *   - RiskLevel (4 niveles AI) -> SeverityLevel via mapRiskLevelToSeverity
 *   - syncState sintetizado desde `status` y `isOfflineCached`
 *   - GPS y ancho de grieta: opcionales (degradacion graceful)
 *
 * Sera eliminado en un proximo corte cuando los consumers importen
 * `DamageReportCard` directamente. Ver changelog `visual-redesign-core`.
 *
 * Ref: spec `visual-redesign-core` (Damage Assessment Cards).
 */

import Link from 'next/link';
import { Trash2 } from 'lucide-react';
import type { RiskLevel } from '@/lib/ai/types';
import { DamageReportCard } from './DamageReportCard';
import type { SyncState } from '@/components/ui/SyncStatusIndicator';

export interface ReportCardData {
  id: string;
  riskLevel: RiskLevel;
  createdAt: string;
  status: string;
  analysisText?: string;
  /** URL de la miniatura o imagen de la captura */
  imageUrl?: string | null;
  /** Whether this report comes from local cache (offline) */
  isOfflineCached?: boolean;
  /** Ancho de grieta en mm (opcional, del analisis AI). */
  crackWidthMm?: number | null;
  /** Confianza AI 0-1 (se convierte a porcentaje). */
  analysisConfidence?: number | null;
  /** Latitud GPS (opcional). */
  gpsLatitude?: number | null;
  /** Longitud GPS (opcional). */
  gpsLongitude?: number | null;
}

interface ReportCardProps {
  report: ReportCardData;
  onDelete?: (id: string) => void;
}

/** Mapea estado + offline-cached a uno de los 4 estados de SyncState. */
function deriveSyncState(report: ReportCardData): SyncState {
  if (report.isOfflineCached) return 'pending';
  switch (report.status) {
    case 'pending':
      return 'pending';
    case 'syncing':
      return 'syncing';
    case 'error':
    case 'failed':
      return 'error';
    case 'analyzed':
    case 'report_generated':
    default:
      return 'synced';
  }
}

export function ReportCard({ report, onDelete }: ReportCardProps) {
  const syncState = deriveSyncState(report);
  const confidencePercent =
    typeof report.analysisConfidence === 'number' && report.analysisConfidence >= 0
      ? Math.round(report.analysisConfidence * 100)
      : undefined;

  return (
    <li className="relative group">
      <Link
        href={`/reports/${report.id}`}
        className="block focus:outline-none focus:ring-2 focus:ring-brand-accent focus:ring-offset-2 focus:ring-offset-surface-0 rounded-lg"
        aria-label={`Ver reporte del ${report.createdAt}, nivel de riesgo ${report.riskLevel}`}
        style={{ textDecoration: 'none' }}
      >
        <DamageReportCard
          id={report.id}
          imageUrl={report.imageUrl ?? null}
          imageAlt={report.analysisText ?? 'Reporte de daño estructural'}
          riskLevel={report.riskLevel}
          syncState={syncState}
          crackWidthMm={report.crackWidthMm ?? undefined}
          confidencePercent={confidencePercent}
          createdAtIso={report.createdAt}
          gpsLatitude={report.gpsLatitude ?? undefined}
          gpsLongitude={report.gpsLongitude ?? undefined}
        />
      </Link>

      {onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDelete(report.id);
          }}
          aria-label={`Eliminar reporte del ${report.createdAt}`}
          title="Eliminar reporte"
          className="absolute top-2.5 right-2.5 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-surface-1/90 text-text-muted hover:text-status-critical-fg hover:bg-surface-2 border border-border-default opacity-80 group-hover:opacity-100 transition-all shadow-md focus:outline-none focus:ring-2 focus:ring-status-critical-border"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </li>
  );
}
