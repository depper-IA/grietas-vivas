/**
 * DamageReportCard — Card de reporte de dano con tokens semanticos dark-first.
 *
 * Reemplaza al antiguo `ReportCard.tsx` (light-mode Tailwind) usando el
 * vocabulario de diseno del slice 1 (tokens) y las primitivas del slice 2
 * (SeverityBadge + SyncStatusIndicator). Caracteristicas:
 *
 *   - Contenedor de imagen con aspect-ratio 4/3 fijo: previene CLS durante
 *     la carga (el skeleton ocupa exactamente las dimensiones finales).
 *   - Telemtria alineada verticalmente con `font-mono tabular-nums`:
 *     ancho de grieta (mm), confianza AI (%), GPS, timestamp ISO.
 *   - SeverityBadge (3 niveles: Leve / Moderado / Critico) integrado
 *     mediante el adaptador `mapRiskLevelToSeverity`.
 *   - SyncStatusIndicator (4 estados: synced / pending / syncing / error)
 *     para reflejar reconciliacion IndexedDB <-> Supabase.
 *   - Micro-interacciones GPU-accelerated: `transition-all duration-150`
 *     con curva canonica `cubic-bezier(0.16, 1, 0.3, 1)`.
 *   - Cero emojis por diseno (iconografia Lucide).
 *
 * Ref: spec `visual-redesign-core` (Damage Assessment Cards, Zero CLS,
 *      No Emojis in UI, Tabular Numerals for Metric Data).
 * Ref: design `DamageReportCard` (slice 3, work unit 3).
 */

import { ImageIcon, Loader2, MapPin, Ruler, ShieldCheck } from 'lucide-react';
import type { RiskLevel } from '@/lib/ai/types';
import { mapRiskLevelToSeverity } from '@/lib/ui/severity';
import { SeverityBadge } from '@/components/ui/SeverityBadge';
import {
  SyncStatusIndicator,
  type SyncState,
} from '@/components/ui/SyncStatusIndicator';

/** Props publicas del componente. */
export interface DamageReportCardProps {
  /** Identificador unico del reporte (para keys y aria-labelledby). */
  id: string;
  /** URL de la imagen capturada; null mientras se carga o si falla. */
  imageUrl: string | null;
  /** Texto alternativo descriptivo para la imagen (accesibilidad). */
  imageAlt: string;
  /** Nivel de riesgo AI original (4 niveles) — se mapea al UI SeverityLevel. */
  riskLevel: RiskLevel;
  /** Estado de sincronizacion IndexedDB <-> Supabase. */
  syncState: SyncState;
  /** Cantidad de elementos pendientes de sync (solo aplica a state='pending'). */
  pendingSyncCount?: number;
  /** Ancho de la grieta en milimetros (dato opcional del analisis). */
  crackWidthMm?: number;
  /** Confianza AI en porcentaje entero 0-100 (dato opcional del analisis). */
  confidencePercent?: number;
  /** Timestamp ISO 8601 del momento de captura. */
  createdAtIso: string;
  /** Latitud GPS (opcional). */
  gpsLatitude?: number | null;
  /** Longitud GPS (opcional). */
  gpsLongitude?: number | null;
  /** Etiqueta de clasificacion estructural (opcional). */
  classificationLabel?: string;
  /** Cuando es true, muestra skeleton en lugar de la imagen. */
  loading?: boolean;
  /** Callback opcional al hacer click sobre el card (ej. abrir detalle). */
  onClick?: (id: string) => void;
  /** Clases Tailwind adicionales para override externo. */
  className?: string;
}

/** Locale canonico para formatear fechas en espanol. */
const LOCALE_ES_CO = 'es-CO';

/**
 * Formatea un timestamp ISO 8601 a un string legible en espanol colombiano.
 * Si el input es invalido, devuelve el string crudo (degradacion graceful).
 */
function formatTimestampEsCo(isoString: string): string {
  try {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return isoString;
    return date.toLocaleString(LOCALE_ES_CO, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

/**
 * Formatea una coordenada GPS a string con 3 decimales (precision ~111m).
 * Si el valor es null o invalido, devuelve null para omitir el chip.
 */
function formatCoordinate(value: number | null | undefined): string | null {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return null;
  }
  return value.toFixed(3);
}

/**
 * DamageReportCard — composicion publica del card de reporte.
 *
 * Renderiza un `<article>` con landmark accesible (`aria-labelledby`)
 * que agrupa: thumbnail, badge de severidad, telemetria y estado de sync.
 */
export function DamageReportCard({
  id,
  imageUrl,
  imageAlt,
  riskLevel,
  syncState,
  pendingSyncCount,
  crackWidthMm,
  confidencePercent,
  createdAtIso,
  gpsLatitude,
  gpsLongitude,
  classificationLabel,
  loading = false,
  onClick,
  className = '',
}: DamageReportCardProps) {
  const severity = mapRiskLevelToSeverity(riskLevel);
  const titleId = `damage-report-title-${id}`;
  const timestamp = formatTimestampEsCo(createdAtIso);
  const latStr = formatCoordinate(gpsLatitude);
  const lonStr = formatCoordinate(gpsLongitude);
  const hasGps = latStr !== null && lonStr !== null;

  const isInteractive = typeof onClick === 'function';
  const handleClick = () => onClick?.(id);
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (!isInteractive) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleClick();
    }
  };

  return (
    <article
      data-testid="damage-report-card"
      aria-labelledby={titleId}
      onClick={isInteractive ? handleClick : undefined}
      onKeyDown={handleKeyDown}
      tabIndex={isInteractive ? 0 : undefined}
      role={isInteractive ? 'button' : undefined}
      className={[
        'group flex flex-col overflow-hidden rounded-lg border bg-surface-2 text-text-primary',
        'border-border-default',
        'transition-all duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]',
        isInteractive
          ? 'cursor-pointer hover:border-border-strong focus:outline-none focus:ring-2 focus:ring-brand-accent'
          : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* Thumbnail con aspect-ratio 4/3 fijo (CLS = 0) */}
      <div
        data-testid="damage-report-thumbnail"
        className="relative aspect-[4/3] w-full overflow-hidden bg-surface-3"
      >
        {loading || !imageUrl ? (
          <SkeletonPlaceholder />
        ) : (
          <img
            src={imageUrl}
            alt={imageAlt}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        )}

        {/* Badge de clasificacion superpuesto (esquina superior izquierda) */}
        {classificationLabel && !loading && (
          <span
            data-testid="damage-report-classification"
            className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md border border-border-default bg-surface-0/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-secondary backdrop-blur"
          >
            <ShieldCheck className="h-3 w-3" aria-hidden="true" />
            {classificationLabel}
          </span>
        )}

        {/* Severity badge superpuesto (esquina superior derecha) */}
        {!loading && (
          <div className="absolute right-2 top-2">
            <SeverityBadge level={severity} size="sm" />
          </div>
        )}
      </div>

      {/* Cuerpo del card: telemetria + sync status */}
      <div className="flex flex-col gap-3 p-4">
        {/* Encabezado accesible (invisible) — referencia para aria-labelledby */}
        <h3 id={titleId} className="sr-only">
          Reporte de daño con severidad {severity}
        </h3>

        {/* Chips de telemetria */}
        <div
          className="flex flex-wrap gap-2"
          aria-label="Telemetría del reporte"
        >
          {crackWidthMm !== undefined && crackWidthMm !== null && (
            <TelemetryChip
              testId="damage-report-width"
              icon={<Ruler className="h-3.5 w-3.5" aria-hidden="true" />}
              label="Ancho"
              value={`${crackWidthMm.toFixed(1)} mm`}
            />
          )}

          {confidencePercent !== undefined && confidencePercent !== null && (
            <TelemetryChip
              testId="damage-report-confidence"
              icon={<ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />}
              label="Confianza"
              value={`${Math.round(confidencePercent)}%`}
            />
          )}

          {hasGps && (
            <TelemetryChip
              testId="damage-report-gps"
              icon={<MapPin className="h-3.5 w-3.5" aria-hidden="true" />}
              label="GPS"
              value={`${latStr}, ${lonStr}`}
            />
          )}
        </div>

        {/* Footer: timestamp + sync indicator */}
        <div className="flex items-center justify-between gap-2">
          <time
            data-testid="damage-report-timestamp"
            dateTime={createdAtIso}
            className="text-xs text-text-muted tabular-nums"
          >
            {timestamp}
          </time>

          <SyncStatusIndicator
            state={syncState}
            pendingCount={pendingSyncCount}
          />
        </div>
      </div>
    </article>
  );
}

/** Props del chip de telemetria individual. */
interface TelemetryChipProps {
  testId: string;
  icon: React.ReactNode;
  label: string;
  value: string;
}

/**
 * Chip compacto para un dato de telemetria. Mantiene el valor con
 * `font-mono tabular-nums` para alineacion vertical entre cards.
 */
function TelemetryChip({ testId, icon, label, value }: TelemetryChipProps) {
  return (
    <span
      data-testid={testId}
      aria-label={`${label}: ${value}`}
      className={[
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-1',
        'border-border-subtle bg-surface-1',
        'font-mono tabular-nums text-xs text-text-primary',
      ].join(' ')}
    >
      {icon}
      <span>{value}</span>
    </span>
  );
}

/**
 * Skeleton placeholder mientras la imagen carga. Mantiene el aspect-ratio
 * 4/3 del contenedor padre y expone `aria-busy` para tecnologias asistivas.
 */
function SkeletonPlaceholder() {
  return (
    <div
      data-testid="damage-report-skeleton"
      aria-busy="true"
      aria-label="Cargando imagen del reporte"
      className="flex h-full w-full items-center justify-center bg-surface-3"
    >
      <div className="flex flex-col items-center gap-2 text-text-muted">
        <Loader2
          className="h-8 w-8 animate-spin opacity-60"
          aria-hidden="true"
        />
        <ImageIcon className="h-4 w-4 opacity-40" aria-hidden="true" />
      </div>
    </div>
  );
}
