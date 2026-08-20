'use client';

/**
 * Report Detail Page — Detalle de reporte con tokens semanticos dark-first.
 *
 * Migracion slice 4 (seismic-triage-upgrade):
 *   - PostTriageActionGuide al inicio cuando se puede computar el
 *     TriageOutcome desde pattern + dangerSignals + AI risk level.
 *   - PostTriageActionGuide.renderiza Llamar 123 + checklist en
 *     niveles unsafe/evacuate (R8, R9).
 *   - Patron de la grieta (diagrama SVG + metadata) si esta presente.
 *   - Senales de peligro (lista) si estan presentes.
 *   - Seccion dual-fotos: si hay contextImageStoragePath, muestra
 *     ambas fotos (Detalle + Contexto) lado a lado.
 *
 * Datos legacy: si el reporte no trae pattern/dangerSignals (generado
 * antes del slice 4), se renderiza con el layout legacy + un link
 * "Ver guia de triaje" opcional.
 *
 * Migracion visual aplicada:
 *   - surface-0/2 + text-primary/secondary/muted
 *   - SeverityBadge con aria-label espanol
 *   - iconos Lucide en CTAs (Download, ArrowLeft, RefreshCw)
 *   - tabla de telemetria con font-mono tabular-nums
 *   - estados PDF (idle/generating/ready/error) con tokens semanticos
 *   - PostTriageActionGuide (R8/R9) cuando hay datos de triaje
 *
 * Ref: spec `visual-redesign-core` y `seismic-triage-upgrade` R8/R9.
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Camera,
  Download,
  FileImage,
  RefreshCw,
  FileText,
  Maximize2,
  Trash2,
  Sparkles,
} from 'lucide-react';
import { FormattedAnalysisText } from '@/components/reports/FormattedAnalysisText';
import { ImageZoomModal } from '@/components/ui/ImageZoomModal';
import { ExpertCalibrationSection } from '@/components/reports/ExpertCalibrationSection';
import { createBrowserSupabaseClient } from '@/lib/db/supabase';
import { getCapture, deleteCapture, updateCapture } from '@/lib/db/localDb';
import { generateReport, deleteReport, updateReportAnalysis, type ReportOutput } from '@/app/actions/report';
import { analyzeWithFallback } from '@/app/actions/analysis';
import type { StructuralContext } from '@/lib/ai/structuralPrompt';
import { SeverityBadge } from '@/components/ui/SeverityBadge';
import { PostTriageActionGuide } from '@/components/reports/PostTriageActionGuide';
import { MotionButton } from '@/components/ui/MotionButton';
import { CRACK_DIAGRAMS, CRACK_DIAGRAM_VIEWBOX } from '@/components/capture/crackPatternDiagrams';
import { DANGER_SIGNAL_DEFS } from '@/components/capture/dangerSignals.constants';
import { mapRiskLevelToSeverity } from '@/lib/ui/severity';
import type { RiskLevel } from '@/lib/ai/types';
import {
  evaluateSafetyOverride,
  PATTERN_METADATA,
  type CrackPattern,
  type DangerSignals,
  type TriageOutcome,
} from '@/lib/validation/schemas';
import { formatTimestamp } from './format';

interface ReportDetail {
  id: string;
  riskLevel: RiskLevel;
  analysisText: string;
  analysisConfidence: number | null;
  analysisProvider: string;
  createdAt: string;
  gpsLatitude: number | null;
  gpsLongitude: number | null;
  gpsAccuracy: number | null;
  gpsReliable: boolean;
  sensorMetadata: Record<string, unknown> | null;
  serverTimestamp: string | null;
  localTimestamp: string;
  timestampVerified: boolean;
  imageStoragePath: string | null;
  pdfStoragePath: string | null;
  integrityHash: string | null;
  status: string;
  // Slice 4 (opcional — reportes pre-slice-4 no los traen)
  pattern?: CrackPattern | null;
  dangerSignals?: DangerSignals | null;
  contextImageStoragePath?: string | null;
  inspectionReportId?: string | null;
  imageBlob?: Blob | null;
  contextImageBlob?: Blob | null;
}

type PageState = 'loading' | 'loaded' | 'not_found' | 'error';
type PdfState = 'idle' | 'generating' | 'ready' | 'error';

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function urlToBase64(url: string): Promise<string> {
  const res = await fetch(url);
  const blob = await res.blob();
  return blobToBase64(blob);
}

export default function ReportDetailPage() {
  const params = useParams();
  const router = useRouter();
  const reportId = params.id as string;

  const [report, setReport] = useState<ReportDetail | null>(null);
  const [pageState, setPageState] = useState<PageState>('loading');
  const [pdfState, setPdfState] = useState<PdfState>('idle');
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState('');
  const [isOffline, setIsOffline] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [contextImageUrl, setContextImageUrl] = useState<string | null>(null);
  const [isZoomOpen, setIsZoomOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const handleDeleteReport = async () => {
    setIsDeleting(true);
    setDeleteError('');
    try {
      // 1. Eliminar de IndexedDB local
      try {
        await deleteCapture(reportId);
      } catch {
        // Continuar
      }

      // 2. Si hay red y es reporte remoto, intentar borrar de Supabase
      if (navigator.onLine && !reportId.startsWith('local-')) {
        try {
          await deleteReport({ reportId });
        } catch {
          // Degradación graceful
        }
      }

      router.push('/reports');
    } catch {
      setDeleteError('Ocurrió un error inesperado al eliminar el reporte.');
      setIsDeleting(false);
    }
  };

  const fetchReport = useCallback(async () => {
    setPageState('loading');
    const online = navigator.onLine;
    setIsOffline(!online);

    if (online) {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data, error } = await supabase
          .from('reports')
          .select('*')
          .eq('id', reportId)
          .single();

        if (error || !data) {
          // Try local cache as fallback
          await loadFromCache();
          return;
        }

        // Extrae campos del slice 4 desde sensor_metadata (JSONB)
        const sensorMeta =
          (data.sensor_metadata as Record<string, unknown> | null) ?? null;
        const pattern =
          (sensorMeta?.pattern as CrackPattern | undefined) ?? null;
        const dangerSignals =
          (sensorMeta?.dangerSignals as DangerSignals | undefined) ?? null;
        const contextImageStoragePath =
          (sensorMeta?.contextImageStoragePath as string | undefined) ?? null;
        const inspectionReportId =
          (sensorMeta?.inspectionReportId as string | undefined) ?? null;

        const detail: ReportDetail = {
          id: data.id,
          riskLevel: data.risk_level as RiskLevel,
          analysisText: data.analysis_text,
          analysisConfidence: data.analysis_confidence,
          analysisProvider: data.analysis_provider,
          createdAt: data.created_at,
          gpsLatitude: data.gps_latitude,
          gpsLongitude: data.gps_longitude,
          gpsAccuracy: data.gps_accuracy,
          gpsReliable: data.gps_reliable,
          sensorMetadata: sensorMeta,
          serverTimestamp: data.server_timestamp,
          localTimestamp: data.local_timestamp,
          timestampVerified: data.timestamp_verified,
          imageStoragePath: data.image_storage_path,
          pdfStoragePath: data.pdf_storage_path,
          integrityHash: data.integrity_hash,
          status: data.status,
          pattern,
          dangerSignals,
          contextImageStoragePath,
          inspectionReportId,
        };

        setReport(detail);
        setPageState('loaded');

        // If PDF already exists, get signed URL
        if (detail.pdfStoragePath) {
          setPdfState('ready');
          const { data: signedData } = await supabase.storage
            .from('reports')
            .createSignedUrl(detail.pdfStoragePath, 3600); // 1 hour expiry

          if (signedData?.signedUrl) {
            setPdfUrl(signedData.signedUrl);
          }
        }

        // Get image signed URL
        if (detail.imageStoragePath) {
          const { data: imgData } = await supabase.storage
            .from('captures')
            .createSignedUrl(detail.imageStoragePath, 3600);

          if (imgData?.signedUrl) {
            setImageUrl(imgData.signedUrl);
          }
        }

        // Get context image signed URL (slice 4 dual-photo).
        if (detail.contextImageStoragePath) {
          const { data: ctxData } = await supabase.storage
            .from('captures')
            .createSignedUrl(detail.contextImageStoragePath, 3600);

          if (ctxData?.signedUrl) {
            setContextImageUrl(ctxData.signedUrl);
          }
        }
      } catch {
        await loadFromCache();
      }
    } else {
      await loadFromCache();
    }
  }, [reportId]);

  const loadFromCache = async () => {
    try {
      const capture = await getCapture(reportId);
      if (!capture || !capture.analysisResult) {
        setPageState('not_found');
        return;
      }

      const detail: ReportDetail = {
        id: capture.id,
        riskLevel: capture.analysisResult.riskLevel,
        analysisText: capture.analysisResult.description,
        analysisConfidence: capture.analysisResult.confidence,
        analysisProvider: capture.analysisResult.provider,
        createdAt: capture.createdAt,
        gpsLatitude: capture.metadata.gps.latitude,
        gpsLongitude: capture.metadata.gps.longitude,
        gpsAccuracy: capture.metadata.gps.accuracy,
        gpsReliable: capture.metadata.gps.reliable,
        sensorMetadata: capture.metadata.orientation as unknown as Record<string, unknown>,
        serverTimestamp: capture.metadata.timestamp.server,
        localTimestamp: capture.metadata.timestamp.local,
        timestampVerified: capture.metadata.timestamp.verified,
        imageStoragePath: null,
        pdfStoragePath: null,
        integrityHash: null,
        status: 'pending',
        imageBlob: capture.imageBlob,
      };

      // Create object URL for cached image
      if (capture.imageBlob) {
        setImageUrl(URL.createObjectURL(capture.imageBlob));
      }

      setReport(detail);
      setIsOffline(true);
      setPageState('loaded');
    } catch {
      setPageState('not_found');
    }
  };

  const handleGeneratePdf = async () => {
    if (!report) return;

    setPdfState('generating');
    setPdfError('');

    const result = await generateReport({ captureId: report.id });

    if (result.success) {
      const output = result.report as ReportOutput;
      setPdfUrl(output.downloadUrl);
      setPdfState('ready');
      // Update local state
      setReport((prev) =>
        prev
          ? { ...prev, integrityHash: output.integrityHash, pdfStoragePath: output.pdfStoragePath }
          : prev
      );
    } else {
      setPdfError(result.error.message);
      setPdfState('error');
    }
  };

  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const [reanalyzeError, setReanalyzeError] = useState<string | null>(null);

  const handleReanalyzeWithAI = async () => {
    if (!report || isReanalyzing) return;
    setIsReanalyzing(true);
    setReanalyzeError(null);

    try {
      let imageBase64 = '';
      if (report.imageBlob) {
        imageBase64 = await blobToBase64(report.imageBlob);
      } else if (imageUrl) {
        imageBase64 = await urlToBase64(imageUrl);
      }

      if (!imageBase64) {
        throw new Error('No se pudo obtener la imagen para el análisis.');
      }

      let contextImageBase64: string | undefined;
      if (report.contextImageBlob) {
        contextImageBase64 = await blobToBase64(report.contextImageBlob);
      } else if (contextImageUrl) {
        contextImageBase64 = await urlToBase64(contextImageUrl);
      }

      const structCtx = (report.sensorMetadata?.structuralContext as StructuralContext) ?? undefined;

      const aiResult = await analyzeWithFallback({
        imageBase64,
        contextImageBase64,
        structuralContext: structCtx,
      });

      if (!aiResult.success) {
        throw new Error(aiResult.error.error.message || 'El análisis con IA no pudo completarse.');
      }

      const { riskLevel, description, confidence, provider } = aiResult.data;

      // Update local state
      setReport((prev) =>
        prev
          ? {
              ...prev,
              riskLevel: riskLevel as RiskLevel,
              analysisText: description,
              analysisConfidence: confidence,
              analysisProvider: provider || 'ai',
            }
          : prev
      );

      // Update IndexedDB if local capture
      try {
        await updateCapture(report.id, {
          analysisResult: aiResult.data,
        });
      } catch {
        // Ignored if only in cloud
      }

      // Update Supabase if cloud report
      if (report.id && !report.id.startsWith('local-')) {
        await updateReportAnalysis({
          reportId: report.id,
          analysisResult: {
            riskLevel,
            description,
            confidence,
            provider: provider || 'ai',
          },
        });
      }
    } catch (err) {
      setReanalyzeError(err instanceof Error ? err.message : 'Error al re-analizar con IA.');
    } finally {
      setIsReanalyzing(false);
    }
  };

  useEffect(() => {
    fetchReport();

  // Cleanup object URLs on unmount
  return () => {
    if (imageUrl && imageUrl.startsWith('blob:')) {
      URL.revokeObjectURL(imageUrl);
    }
    if (contextImageUrl && contextImageUrl.startsWith('blob:')) {
      URL.revokeObjectURL(contextImageUrl);
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [fetchReport]);

  // Calcula el TriageOutcome si hay datos del slice 4 disponibles.
  // Garantiza pisos de seguridad: si pattern o senales lo indican,
  // el nivel se eleva a evacuate_emergency.
  const triageOutcome: TriageOutcome | null = useMemo(() => {
    if (!report || !report.pattern || !report.dangerSignals) return null;
    return evaluateSafetyOverride(
      report.pattern,
      report.dangerSignals,
      report.riskLevel
    );
  }, [report]);

  if (pageState === 'loading') {
    return (
      <main className="mx-auto max-w-lg px-4 py-8 pt-[max(2rem,env(safe-area-inset-top))] pb-[calc(5rem+env(safe-area-inset-bottom))] overflow-x-hidden">
        <div
          className="flex items-center justify-center py-16"
          aria-live="polite"
        >
          <RefreshCw
            className="h-8 w-8 animate-spin text-brand-accent"
            role="status"
            aria-label="Cargando reporte..."
          />
        </div>
      </main>
    );
  }

  if (pageState === 'not_found') {
    return (
      <main className="mx-auto max-w-lg px-4 py-8 pt-[max(2rem,env(safe-area-inset-top))] pb-[calc(5rem+env(safe-area-inset-bottom))] overflow-x-hidden">
        <div className="rounded-2xl border border-border-default bg-surface-1 p-6 text-center shadow-lg">
          <h1 className="text-xl font-bold text-text-primary">
            Reporte no encontrado
          </h1>
          <p className="mt-2 text-sm text-text-muted">
            Este reporte no existe o no tienes acceso a él.
          </p>
          <button
            onClick={() => router.push('/reports')}
            className="mt-5 min-h-[44px] rounded-xl border border-border-default bg-surface-2 px-5 py-2.5 text-sm font-semibold text-text-primary transition-all duration-150 hover:border-border-strong active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-brand-accent"
          >
            Volver a Reportes
          </button>
        </div>
      </main>
    );
  }

  if (pageState === 'error' || !report) {
    return (
      <main className="mx-auto max-w-lg px-4 py-8 pt-[max(2rem,env(safe-area-inset-top))] pb-[calc(5rem+env(safe-area-inset-bottom))] overflow-x-hidden">
        <div
          className="rounded-2xl border border-status-critical-border bg-surface-1 p-6 text-center shadow-lg"
          role="alert"
        >
          <p className="text-sm font-medium text-status-critical-border">
            Ocurrió un error al cargar este reporte.
          </p>
          <button
            onClick={fetchReport}
            className="mt-4 min-h-[44px] rounded-xl border border-status-critical-border bg-status-critical px-5 py-2.5 text-sm font-semibold text-status-critical-fg transition-opacity duration-150 hover:opacity-90 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-status-critical-border"
          >
            Reintentar
          </button>
        </div>
      </main>
    );
  }

  const severity = mapRiskLevelToSeverity(report.riskLevel);
  const patternMeta = report.pattern ? PATTERN_METADATA[report.pattern] : null;
  const patternDiagram = report.pattern ? CRACK_DIAGRAMS[report.pattern] : null;
  const activeDangerSignals = report.dangerSignals
    ? DANGER_SIGNAL_DEFS.filter((def) => report.dangerSignals?.[def.field] === true)
    : [];

  return (
    <main className="mx-auto max-w-lg px-4 py-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[calc(5rem+env(safe-area-inset-bottom))] overflow-x-hidden">
      {/* Header */}
      <header className="mb-6">
        <button
          onClick={() => router.push('/reports')}
          className="mb-3 inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-2.5 py-1 text-sm font-medium text-text-secondary transition-colors duration-150 hover:text-text-primary hover:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-brand-accent active:scale-95"
          aria-label="Volver a la lista de reportes"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Volver</span>
        </button>
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">
            Detalle del Reporte
          </h1>
          <SeverityBadge level={severity} />
        </div>
        {isOffline && (
          <div
            className="mt-3 rounded-xl border border-brand-accent/30 bg-surface-2 p-3 text-sm text-text-secondary shadow-sm"
            role="alert"
          >
            Sin conexión. Mostrando datos en caché local.
          </div>
        )}
      </header>

      {/* PostTriageActionGuide (R8, R9) cuando hay datos de triaje */}
      {triageOutcome && (
        <section aria-label="Guia post-triaje" className="mb-6">
          <PostTriageActionGuide outcome={triageOutcome} />
        </section>
      )}

      {/* Dual photo gallery (R5, R6) con visor interactivo de zoom */}
      {imageUrl && (
        <section aria-labelledby="image-heading" className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h2 id="image-heading" className="text-sm font-semibold text-text-primary tracking-tight">
              Evidencia Fotográfica
            </h2>
            <button
              type="button"
              onClick={() => setIsZoomOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-accent hover:underline focus:outline-none"
            >
              <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Abrir Visor / Zoom</span>
            </button>
          </div>

          {contextImageUrl ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <figure className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => setIsZoomOpen(true)}
                  aria-label="Ampliar foto de detalle"
                  className="group relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-border-default shadow-md focus:outline-none focus:ring-2 focus:ring-brand-accent text-left"
                >
                  <img
                    src={imageUrl}
                    alt="Foto de detalle de la grieta capturada a 30-50 cm"
                    className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all flex items-center justify-center">
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-surface-0/80 text-white text-xs px-2.5 py-1 rounded-full backdrop-blur-sm inline-flex items-center gap-1 shadow-lg font-medium">
                      <Maximize2 className="h-3 w-3" /> Zoom
                    </span>
                  </div>
                </button>
                <figcaption className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
                  <Camera
                    className="h-3.5 w-3.5 text-triage-monitoring"
                    aria-hidden="true"
                  />
                  <span>Foto de Detalle (30-50 cm)</span>
                </figcaption>
              </figure>

              <figure className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => setIsZoomOpen(true)}
                  aria-label="Ampliar foto de contexto"
                  className="group relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-border-default shadow-md focus:outline-none focus:ring-2 focus:ring-brand-accent text-left"
                >
                  <img
                    src={contextImageUrl}
                    alt="Foto de contexto de la grieta capturada a 2 metros"
                    className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all flex items-center justify-center">
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-surface-0/80 text-white text-xs px-2.5 py-1 rounded-full backdrop-blur-sm inline-flex items-center gap-1 shadow-lg font-medium">
                      <Maximize2 className="h-3 w-3" /> Zoom
                    </span>
                  </div>
                </button>
                <figcaption className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
                  <Camera
                    className="h-3.5 w-3.5 text-triage-habitable"
                    aria-hidden="true"
                  />
                  <span>Foto de Contexto (2 m)</span>
                </figcaption>
              </figure>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsZoomOpen(true)}
              aria-label="Ampliar fotografía de la grieta"
              className="group relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-border-default shadow-md focus:outline-none focus:ring-2 focus:ring-brand-accent block text-left"
            >
              <img
                src={imageUrl}
                alt="Fotografía capturada de la grieta para análisis estructural"
                className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all flex items-center justify-center">
                <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-surface-0/80 text-white text-xs px-3 py-1.5 rounded-full backdrop-blur-sm inline-flex items-center gap-1.5 shadow-lg font-medium">
                  <Maximize2 className="h-3.5 w-3.5" /> Click para ampliar y hacer zoom
                </span>
              </div>
            </button>
          )}

          {/* Modal de Zoom */}
          <ImageZoomModal
            isOpen={isZoomOpen}
            onClose={() => setIsZoomOpen(false)}
            imageUrl={imageUrl}
            contextImageUrl={contextImageUrl}
            title={`Inspección de Imagen — Reporte #${report.id.slice(0, 8)}`}
          />
        </section>
      )}

      {/* Image placeholder si no hay imagen */}
      {!imageUrl && (
        <section aria-labelledby="image-heading" className="mb-6">
          <h2 id="image-heading" className="sr-only">
            Imagen capturada
          </h2>
          <div className="flex aspect-[4/3] w-full items-center justify-center rounded-2xl border border-border-default bg-surface-2 shadow-sm">
            <FileImage
              className="h-12 w-12 text-text-muted opacity-60"
              aria-hidden="true"
            />
          </div>
        </section>
      )}

      {/* Patron de la grieta (R1, R2) si esta presente */}
      {patternMeta && patternDiagram && (
        <section
          aria-labelledby="pattern-heading"
          className="mb-6"
          data-testid="report-pattern-section"
        >
          <h2
            id="pattern-heading"
            className="text-lg font-bold text-text-primary tracking-tight"
          >
            Patron de la grieta
          </h2>
          <div className="mt-3 flex items-stretch gap-3 rounded-2xl border border-border-default bg-surface-1 p-4 shadow-sm sm:p-5">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-border-subtle bg-surface-2">
              <svg
                data-testid={`report-pattern-diagram-${report.pattern}`}
                role="presentation"
                aria-hidden="true"
                focusable="false"
                viewBox={CRACK_DIAGRAM_VIEWBOX}
                preserveAspectRatio="xMidYMid meet"
                className="h-10 w-10 text-text-secondary"
              >
                {patternDiagram.paths.map((p, i) => (
                  <path
                    key={`${report.pattern}-p-${i}`}
                    d={p.d}
                    fill={p.fill ?? 'none'}
                    stroke="currentColor"
                    strokeWidth={p.strokeWidth ?? 0.6}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))}
              </svg>
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <span className="text-base font-semibold text-text-primary">
                {patternMeta.labelEs}
              </span>
              <span className="text-xs uppercase tracking-wide text-text-muted">
                Riesgo base: {patternMeta.riskBaseline}
              </span>
              <p className="mt-1 text-sm leading-snug text-text-secondary">
                {patternMeta.guidanceEs}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Senales de peligro (R3) si hay datos */}
      {report.dangerSignals && activeDangerSignals.length > 0 && (
        <section
          aria-labelledby="signals-heading"
          className="mb-6"
          data-testid="report-signals-section"
        >
          <h2
            id="signals-heading"
            className="text-lg font-bold text-text-primary tracking-tight"
          >
            Senales de peligro detectadas
          </h2>
          <ul className="mt-3 space-y-2" aria-label="Lista de senales detectadas">
            {activeDangerSignals.map((def) => {
              const SignalIcon = def.Icon;
              return (
                <li
                  key={def.field}
                  className="flex items-start gap-3 rounded-xl border border-status-critical-border bg-status-critical/10 p-3"
                >
                  <span
                    aria-hidden="true"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-status-critical-border bg-status-critical/20 text-status-critical-border"
                  >
                    <SignalIcon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="flex flex-1 flex-col">
                    <span className="text-sm font-semibold text-text-primary">
                      {def.labelEs}
                    </span>
                    <span className="text-xs leading-snug text-text-secondary">
                      {def.descriptionEs}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Analysis */}
      <section aria-labelledby="analysis-heading" className="mb-6">
        <div className="flex items-center justify-between gap-2">
          <h2
            id="analysis-heading"
            className="text-lg font-bold text-text-primary tracking-tight"
          >
            Análisis
          </h2>
          <button
            type="button"
            onClick={handleReanalyzeWithAI}
            disabled={isReanalyzing}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-brand-accent/40 bg-surface-1 px-3.5 py-1.5 text-xs font-semibold text-brand-accent hover:bg-surface-2 active:scale-95 transition-all disabled:opacity-50"
            aria-label="Re-analizar reporte con IA"
          >
            <Sparkles className={`h-3.5 w-3.5 ${isReanalyzing ? 'animate-spin' : ''}`} />
            <span>{isReanalyzing ? 'Analizando con IA...' : 'Re-analizar con IA'}</span>
          </button>
        </div>

        {reanalyzeError && (
          <p className="mt-2 text-xs font-medium text-status-critical-border bg-status-critical/10 p-2.5 rounded-xl border border-status-critical-border">
            {reanalyzeError}
          </p>
        )}

        <div className="mt-3 rounded-2xl border border-border-default bg-gradient-to-br from-surface-1 to-surface-2 p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3 pb-3 border-b border-border-subtle">
            <SeverityBadge level={severity} />
            {report.analysisConfidence !== null && (
              <div className="flex flex-col items-end gap-0.5">
                <span className="font-mono tabular-nums text-base font-semibold text-text-primary">
                  {Math.round(report.analysisConfidence * 100)}%
                </span>
                <span className="text-[10px] uppercase tracking-wider text-text-muted">
                  confianza
                </span>
              </div>
            )}
          </div>
          <div className="mt-3">
            <FormattedAnalysisText text={report.analysisText} />
          </div>
        </div>
      </section>

      {/* GPS Data */}
      <section aria-labelledby="gps-heading" className="mb-6">
        <h2 id="gps-heading" className="text-lg font-bold text-text-primary tracking-tight">
          Ubicación
        </h2>
        <div className="mt-3 rounded-2xl border border-border-default bg-surface-1 p-4 sm:p-5 shadow-sm">
          {report.gpsLatitude !== null && report.gpsLongitude !== null ? (
            <dl className="space-y-2.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-text-muted">Latitud</dt>
                <dd className="font-mono tabular-nums text-text-primary">
                  {report.gpsLatitude.toFixed(6)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-text-muted">Longitud</dt>
                <dd className="font-mono tabular-nums text-text-primary">
                  {report.gpsLongitude.toFixed(6)}
                </dd>
              </div>
              {report.gpsAccuracy !== null && (
                <div className="flex justify-between">
                  <dt className="text-text-muted">Precisión</dt>
                  <dd className="font-mono tabular-nums text-text-primary">
                    {report.gpsAccuracy.toFixed(1)} m
                  </dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-text-muted">Fiable</dt>
                <dd
                  className={
                    report.gpsReliable
                      ? 'font-semibold text-status-minor-bg'
                      : 'font-semibold text-status-moderate-bg'
                  }
                >
                  {report.gpsReliable ? 'Sí' : 'No'}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-text-muted">
              Datos GPS no disponibles para esta captura.
            </p>
          )}
        </div>
      </section>

      {/* Timestamps */}
      <section aria-labelledby="timestamps-heading" className="mb-6">
        <h2
          id="timestamps-heading"
          className="text-lg font-bold text-text-primary tracking-tight"
        >
          Marca de tiempo
        </h2>
        <div className="mt-3 rounded-2xl border border-border-default bg-surface-1 p-4 sm:p-5 shadow-sm">
          <dl className="space-y-2.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-text-muted">Local</dt>
              <dd className="font-mono tabular-nums text-text-primary">
                {formatTimestamp(report.localTimestamp)}
              </dd>
            </div>
            {report.serverTimestamp && (
              <div className="flex justify-between">
                <dt className="text-text-muted">Servidor (certificado)</dt>
                <dd className="font-mono tabular-nums text-text-primary">
                  {formatTimestamp(report.serverTimestamp)}
                </dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-text-muted">Verificado</dt>
              <dd
                className={
                  report.timestampVerified
                    ? 'font-semibold text-status-minor-bg'
                    : 'font-semibold text-status-moderate-bg'
                }
              >
                {report.timestampVerified ? 'Sí' : 'No'}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      {/* Sensor Metadata */}
      {report.sensorMetadata && (
        <section aria-labelledby="sensor-heading" className="mb-6">
          <h2
            id="sensor-heading"
            className="text-lg font-bold text-text-primary tracking-tight"
          >
            Orientación del dispositivo
          </h2>
          <div className="mt-3 rounded-2xl border border-border-default bg-surface-1 p-4 sm:p-5 shadow-sm">
            <dl className="space-y-2.5 text-sm">
              {typeof report.sensorMetadata.alpha === 'number' && (
                <div className="flex justify-between">
                  <dt className="text-text-muted">Alpha (brújula)</dt>
                  <dd className="font-mono tabular-nums text-text-primary">
                    {(report.sensorMetadata.alpha as number).toFixed(1)}
                    &deg;
                  </dd>
                </div>
              )}
              {typeof report.sensorMetadata.beta === 'number' && (
                <div className="flex justify-between">
                  <dt className="text-text-muted">Beta (inclinación)</dt>
                  <dd className="font-mono tabular-nums text-text-primary">
                    {(report.sensorMetadata.beta as number).toFixed(1)}
                    &deg;
                  </dd>
                </div>
              )}
              {typeof report.sensorMetadata.gamma === 'number' && (
                <div className="flex justify-between">
                  <dt className="text-text-muted">Gamma (rotación)</dt>
                  <dd className="font-mono tabular-nums text-text-primary">
                    {(report.sensorMetadata.gamma as number).toFixed(1)}
                    &deg;
                  </dd>
                </div>
              )}
              {report.sensorMetadata.available === false && (
                <p className="text-text-muted">
                  Datos de orientación no disponibles.
                </p>
              )}
            </dl>
          </div>
        </section>
      )}

      {/* PDF Download */}
      <section aria-labelledby="pdf-heading" className="mb-6">
        <h2 id="pdf-heading" className="text-lg font-bold text-text-primary tracking-tight">
          Reporte PDF
        </h2>
        <div className="mt-3 rounded-2xl border border-border-default bg-surface-1 p-4 sm:p-5 shadow-sm">
          {pdfState === 'idle' && !isOffline && (
            <MotionButton
              onClick={handleGeneratePdf}
              buttonProps={{
                className:
                  'flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full bg-brand-cta px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-cta/20 hover:bg-brand-cta/90 focus:outline-none focus:ring-2 focus:ring-brand-accent focus:ring-offset-2 focus:ring-offset-surface-0',
              }}
            >
              <FileText className="h-5 w-5" aria-hidden="true" />
              <span>Generar PDF</span>
            </MotionButton>
          )}

          {pdfState === 'idle' && isOffline && (
            <p className="text-sm text-text-muted">
              La generación del PDF requiere conexión a internet.
            </p>
          )}

          {pdfState === 'generating' && (
            <div className="flex items-center justify-center gap-2 py-3">
              <RefreshCw
                className="h-5 w-5 animate-spin text-brand-accent"
                aria-hidden="true"
              />
              <span className="text-sm text-text-secondary">
                Generando PDF...
              </span>
            </div>
          )}

          {pdfState === 'ready' && pdfUrl && (
            <a
              href={pdfUrl}
              download
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-status-minor px-4 py-3 text-sm font-semibold text-status-minor-fg shadow-sm transition-opacity duration-150 hover:opacity-90 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-status-minor-border focus:ring-offset-2 focus:ring-offset-surface-0"
              aria-label="Descargar reporte PDF"
            >
              <Download className="h-5 w-5" aria-hidden="true" />
              <span>Descargar PDF</span>
            </a>
          )}

          {pdfState === 'ready' && !pdfUrl && (
            <p className="text-sm text-text-muted">
              PDF generado pero la URL de descarga no está disponible. Refresca la página.
            </p>
          )}

          {pdfState === 'error' && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-status-critical-border">{pdfError}</p>
              <button
                onClick={handleGeneratePdf}
                className="w-full min-h-[48px] rounded-xl border border-status-critical-border bg-status-critical px-5 py-2.5 text-sm font-semibold text-status-critical-fg transition-opacity duration-150 hover:opacity-90 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-status-critical-border"
              >
                Reintentar
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Integrity Hash */}
      {report.integrityHash && (
        <section aria-labelledby="integrity-heading" className="mb-6">
          <h2
            id="integrity-heading"
            className="text-lg font-bold text-text-primary tracking-tight"
          >
            Verificación de integridad
          </h2>
          <div className="mt-3 rounded-2xl border border-border-default bg-surface-1 p-4 sm:p-5 shadow-sm">
            <p className="text-xs text-text-muted">Hash SHA-256 (Inmutable)</p>
            <p className="mt-1.5 break-all font-mono text-xs text-text-primary bg-surface-2 p-2.5 rounded-xl border border-border-subtle">
              {report.integrityHash}
            </p>
          </div>
        </section>
      )}

      {/* Calibración Pericial / Aprendizaje Continuo */}
      <ExpertCalibrationSection
        reportId={report.id}
        currentRiskLevel={report.riskLevel}
        currentPattern={report.pattern}
        existingCalibration={
          report.sensorMetadata && typeof report.sensorMetadata.calibration === 'object'
            ? (report.sensorMetadata.calibration as any)
            : null
        }
      />

      {/* Zona de peligro: Eliminar reporte */}
      <section aria-labelledby="danger-zone-heading" className="mb-6 pt-4 border-t border-border-subtle">
        <h2 id="danger-zone-heading" className="sr-only">
          Zona de peligro
        </h2>
        <div className="flex flex-col gap-3">
          {!showDeleteConfirm ? (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-status-critical-border/40 bg-surface-1 px-4 py-2.5 text-xs font-semibold text-status-critical-border hover:bg-status-critical/10 active:scale-[0.98] transition-all"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              <span>Eliminar este reporte</span>
            </button>
          ) : (
            <div className="rounded-2xl border border-status-critical-border bg-surface-1 p-4 sm:p-5 shadow-sm space-y-3">
              <h3 className="text-sm font-bold text-status-critical-border flex items-center gap-2">
                <Trash2 className="h-4 w-4 shrink-0" />
                <span>¿Confirmas que deseas eliminar este reporte?</span>
              </h3>
              <p className="text-xs text-text-secondary leading-relaxed">
                Esta acción eliminará permanentemente los datos y las fotografías asociadas de este reporte en la nube y en tu dispositivo. Esta acción no se puede deshacer.
              </p>
              {deleteError && (
                <p className="text-xs text-status-critical-border font-medium">{deleteError}</p>
              )}
              <div className="flex gap-2 justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeleting}
                  className="min-h-[38px] px-3.5 rounded-xl border border-border-default bg-surface-2 text-xs font-semibold text-text-secondary hover:text-text-primary"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleDeleteReport}
                  disabled={isDeleting}
                  className="min-h-[38px] px-4 rounded-xl bg-status-critical text-xs font-semibold text-white shadow-sm hover:bg-status-critical/90 disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  {isDeleting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  <span>Sí, eliminar definitivamente</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
