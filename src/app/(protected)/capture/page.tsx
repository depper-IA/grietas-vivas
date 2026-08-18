'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { CameraViewfinder } from '@/components/capture/CameraViewfinder';
import {
  CaptureViewfinderHUD,
  type CaptureState,
} from '@/components/capture/CaptureViewfinderHUD';
import { CapturePreview } from '@/components/capture/CapturePreview';
import { MetadataIndicators } from '@/components/capture/MetadataIndicators';
import { GpsWarningBanner } from '@/components/capture/GpsWarningBanner';
import { useEvaluateSafetyOverride } from './useEvaluateSafetyOverride';
import { SeverityBadge } from '@/components/ui/SeverityBadge';
import type { GpsStatus, OrientationStatus } from '@/components/capture/MetadataIndicators';
import { captureService } from '@/lib/capture/captureService';
import type { CaptureResult } from '@/lib/capture/types';
import { useAIAnalysis } from '@/hooks/useAIAnalysis';
import { useDeviceOrientation } from '@/hooks/useDeviceOrientation';
import { stripExifData } from '@/lib/exif/strip';
import { analyzeWithFallback } from '@/app/actions/analysis';
import { syncCapture } from '@/app/actions/sync';
import { createBrowserSupabaseClient } from '@/lib/db/supabase';
import { retrieveEncryptedByokConfig, hasStoredKey } from '@/lib/crypto/byokEncryption';
import type { AnalysisResult, AIConfig, RiskLevel, IAIProvider } from '@/lib/ai/types';
import { aiService } from '@/lib/ai/aiService';
import { AnthropicProvider } from '@/lib/ai/providers/anthropic';
import { OpenAIProvider } from '@/lib/ai/providers/openai';
import { OpenRouterProvider } from '@/lib/ai/providers/openrouter';
import { GeminiProvider } from '@/lib/ai/providers/gemini';
import { MinimaxProvider } from '@/lib/ai/providers/minimax';
import { NvidiaNimProvider } from '@/lib/ai/providers/nvidia-nim';
import type { CrackPattern, DangerSignals, TriageOutcome } from '@/lib/validation/schemas';
import {
  CircleCheck,
  CircleX,
  FileText,
  RefreshCw,
  ScanLine,
  TriangleAlert,
} from 'lucide-react';
import { arrayBufferToBase64 } from './helpers';
import { mapRiskLevelToSeverity } from '@/lib/ui/severity';
import { CaptureSuccessPanel } from './CaptureSuccessPanel';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

/**
 * Normaliza una foto de galería para analisis:
 *  1. Aplica la orientacion EXIF (algunos telefonos guardan landscape + flag EXIF
 *     para que el browser la rote. Sin esto, la IA ve la imagen rotada.)
 *  2. Convierte a JPEG (los formatos PNG/WebP/HEIC no pueden limpiarse con
 *     `stripExifData` y pueden llevar metadata sensible a proveedores de IA).
 *
 * Usa `createImageBitmap({ imageOrientation: 'from-image' })` si esta disponible
 * (Chrome, Edge, Safari recientes) — automaticamente rota los pixeles segun EXIF.
 * Si no esta disponible, cae a `createImageBitmap(file)` sin rotacion.
 */
async function normalizeImageForAnalysis(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // Fallback: navegadores sin soporte de imageOrientation
    bitmap = await createImageBitmap(file);
  }

  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('No se pudo inicializar el contexto de canvas para normalizar la imagen.');
  }
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close?.();

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('No se pudo convertir la imagen a JPEG.'));
        }
      },
      'image/jpeg',
      0.9,
    );
  });
}

/**
 * Capture Page — Orquestador principal del flujo de captura.
 *
 * Stack de UI oscura con tokens semanticos dark-first. Compone:
 *   - GpsWarningBanner (estado de GPS)
 *   - MetadataIndicators (GPS + orientacion del dispositivo)
 *   - CameraViewfinder (stream de video del usuario)
 *   - CaptureViewfinderHUD (overlay: crosshair, nivel, escala, torch, capture)
 *   - CapturePreview (post-captura)
 *   - DualCaptureFlow (slice 4: 4-step flow captura dual + patron + senales)
 *   - CaptureSuccessPanel (post-analisis con PostTriageActionGuide)
 *
 * Validates: Requirements 1.2, 2.5, R5-R9 (seismic-triage-upgrade).
 */
export default function CapturePage() {
  // Estado de sensores
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>('unavailable');
  const [orientationStatus, setOrientationStatus] = useState<OrientationStatus>('unavailable');
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);

  // Estado del HUD (slice 4)
  const [torchOn, setTorchOn] = useState(false);
  const { pitch, roll, supported: orientationSupported } = useDeviceOrientation();

  // Estado del flujo de captura
  const [captureRequested, setCaptureRequested] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureResult, setCaptureResult] = useState<CaptureResult | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);

  // Ref al input file oculto (para disparar picker desde el HUD).
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // Estado del flujo de triaje (slice 4)
  const [showTriageFlow, setShowTriageFlow] = useState(false);
  const [pattern, setPattern] = useState<CrackPattern | null>(null);
  const [dangerSignals, setDangerSignals] = useState<DangerSignals | null>(null);
  const [contextImageBlob, setContextImageBlob] = useState<Blob | null>(null);

  // Refs para evitar closures stale en handlers async. Las promesas
  // disparadas por handleTriageComplete invocan syncToBackend despues
  // del cambio de estado, por lo que leer state directamente en la
  // closure produce undefined. Los refs se sincronizan via useEffect
  // y siempre exponen el valor mas reciente.
  const patternRef = useRef<CrackPattern | null>(pattern);
  const dangerSignalsRef = useRef<DangerSignals | null>(dangerSignals);
  const contextImageBlobRef = useRef<Blob | null>(contextImageBlob);
  // Ref del resultado de captura — triggerAnalysis se llama desde
  // handleStartAnalysis (handler del boton) y necesita ver el captureResult
  // mas reciente. Sin el ref, el useCallback cierra sobre el valor inicial
  // (null) y sale por el guard `if (!captureResult) return;`.
  const captureResultRef = useRef<CaptureResult | null>(null);
  useEffect(() => {
    patternRef.current = pattern;
  }, [pattern]);
  useEffect(() => {
    dangerSignalsRef.current = dangerSignals;
  }, [dangerSignals]);
  useEffect(() => {
    contextImageBlobRef.current = contextImageBlob;
  }, [contextImageBlob]);
  useEffect(() => {
    captureResultRef.current = captureResult;
  }, [captureResult]);

  // Estado del flujo de analisis
  const { analyze, isAnalyzing, analysisState, result: analysisResult, error: analysisError } = useAIAnalysis();
  const [finalResult, setFinalResult] = useState<AnalysisResult | null>(null);
  const [isRunningAnalysis, setIsRunningAnalysis] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const [syncError, setSyncError] = useState<string | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);

  // Hook de override de seguridad (memoiza la evaluacion).
  // Pasa la severidad AI cuando el analisis termino para que el triage
  // baseline refleje la confianza real de la IA.
  // Sin input manual del usuario: la IA determina todo. El hook queda
  // con valores null para mantener la firma y no romper `triageOutcome`
  // (siempre cae al riskLevel de la IA).
  const triageOutcome = useEvaluateSafetyOverride(
    null,
    null,
    finalResult?.riskLevel
  );

  // Maquina de estados consolidada para el HUD
  const captureState: CaptureState = isCapturing
    ? 'capturing'
    : isRunningAnalysis || isAnalyzing
      ? 'processing'
      : 'idle';

  // Probe GPS availability on mount
  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsStatus('unavailable');
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const accuracy = position.coords.accuracy;
        setGpsAccuracy(accuracy);
        setGpsStatus(accuracy <= 50 ? 'reliable' : 'low-accuracy');
      },
      () => {
        setGpsStatus('unavailable');
        setGpsAccuracy(null);
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 10000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Marca orientacion como disponible cuando useDeviceOrientation emite datos
  useEffect(() => {
    if (orientationSupported) {
      setOrientationStatus('available');
    }
  }, [orientationSupported]);

  // Toggle de linterna
  const handleTorchToggle = useCallback(() => {
    setTorchOn((prev) => !prev);
  }, []);

  // Handle capture button press desde el HUD
  const handleHudCapture = useCallback(() => {
    setCaptureError(null);
    setCaptureRequested(true);
    setIsCapturing(true);
  }, []);

  // Handle image blob from viewfinder or upload
  const handleImageCaptured = useCallback(async (blob: Blob) => {
    try {
      const result = await captureService.capture(blob);
      setCaptureResult(result);

      const url = URL.createObjectURL(result.imageBlob);
      setPreviewUrl(url);
    } catch (err) {
      setCaptureError(
        err instanceof Error ? err.message : 'Error en la captura. Por favor intenta de nuevo.'
      );
    } finally {
      setIsCapturing(false);
      setUploading(false);
    }
  }, []);

  /** Abre el file picker (boton upload del HUD). */
  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  /** Procesa el archivo seleccionado por el usuario. */
  const handleFileSelected = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      // Reset del input para permitir re-seleccionar el mismo archivo
      e.target.value = '';
      if (!file) return;

      if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
        setCaptureError(
          `Formato no soportado (${file.type || 'desconocido'}). Usa JPG, PNG, WebP o HEIC.`
        );
        return;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        setCaptureError(
          `La imagen pesa ${(file.size / 1024 / 1024).toFixed(1)}MB. Máximo permitido: 10MB.`
        );
        return;
      }

      setUploading(true);
      setCaptureError(null);
      setIsCapturing(true);

      try {
        // Normaliza la imagen: aplica rotacion EXIF + convierte a JPEG
        // (necesario para que `stripExifData` pueda limpiarla antes de la IA).
        const normalizedBlob = await normalizeImageForAnalysis(file);
        await handleImageCaptured(normalizedBlob);
      } catch (err) {
        setIsCapturing(false);
        setUploading(false);
        setCaptureError(
          err instanceof Error
            ? err.message
            : 'No se pudo procesar la imagen. Intenta con otro formato (JPG/PNG/WebP).'
        );
      }
    },
    [handleImageCaptured]
  );

  // Dismiss preview and return to camera
  const handleDismissPreview = useCallback(() => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setCaptureResult(null);
    setPreviewUrl(null);
    setCaptureError(null);
    setFinalResult(null);
    setIsRunningAnalysis(false);
    setSyncStatus('idle');
    setSyncError(null);
    setReportId(null);
  }, [previewUrl]);

  // Trigger the AI analysis with the triaje data
  const triggerAnalysis = useCallback(async () => {
    // Lee captureResult desde el ref para evitar closure stale
    // cuando se dispara desde handleStartAnalysis (boton "Analizar con IA").
    const currentCapture = captureResultRef.current;
    if (!currentCapture) return;

    setIsRunningAnalysis(true);
    setCaptureError(null);

    try {
      // Strip EXIF before sending to AI
      let cleanImage: Blob;
      try {
        cleanImage = await stripExifData(currentCapture.imageBlob);
      } catch {
        cleanImage = currentCapture.imageBlob;
      }

      // Determine AI config: BYOK or Fallback
      const hasByokKey = hasStoredKey();

      if (hasByokKey) {
        const supabase = createBrowserSupabaseClient();
        const { data: { session } } = await supabase.auth.getSession();

        if (session?.access_token) {
          const byokConfig = await retrieveEncryptedByokConfig(session.access_token);
          if (byokConfig?.apiKey) {
            const { apiKey, provider, model, baseUrl } = byokConfig;
            let providerInstance: IAIProvider | null = null;

            switch (provider) {
              case 'anthropic':
                providerInstance = new AnthropicProvider(apiKey, model);
                break;
              case 'openrouter':
                providerInstance = new OpenRouterProvider(apiKey, model, baseUrl);
                break;
              case 'gemini':
                providerInstance = new GeminiProvider(apiKey, model);
                break;
              case 'minimax':
                providerInstance = new MinimaxProvider(apiKey, model, baseUrl);
                break;
              case 'nvidia-nim':
                providerInstance = new NvidiaNimProvider(apiKey, model, baseUrl);
                break;
              case 'openai':
              case 'custom':
              default:
                providerInstance = new OpenAIProvider(apiKey, model);
                break;
            }

            if (providerInstance) {
              aiService.registerProvider(providerInstance);
            }

            const config: AIConfig = {
              mode: 'byok',
              byok: { provider, apiKey, model, baseUrl },
              fallbackPriority: ['nvidia-nim', 'openrouter'],
            };

            await analyze(cleanImage, config);
            return;
          }
        }
      }

      // Fallback mode
      const arrayBuffer = await cleanImage.arrayBuffer();
      const base64 = arrayBufferToBase64(arrayBuffer);

      const fallbackResult = await analyzeWithFallback({ imageBase64: base64 });

      if (fallbackResult.success) {
        setFinalResult(fallbackResult.data);
        setIsRunningAnalysis(false);
        await syncToBackend(fallbackResult.data);
      } else {
        setIsRunningAnalysis(false);
        setCaptureError(fallbackResult.error.error.message);
      }
    } catch (err) {
      setIsRunningAnalysis(false);
      setCaptureError(
        err instanceof Error ? err.message : 'Falló el análisis. Se reintentará automáticamente.'
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captureResult, analyze]);

  // Inicia el analisis de IA directamente (sin DualCaptureFlow manual).
  // La IA determina patron, riesgo y senales a partir de la foto.
  const handleStartAnalysis = useCallback(() => {
    void triggerAnalysis();
  }, [triggerAnalysis]);

  // Sync the capture + analysis result to Supabase backend.
  // Usa refs para leer pattern/dangerSignals/contextImageBlob
  // actuales y evitar closures stale cuando el handler es invocado
  // desde el flujo async (handleTriageComplete -> triggerAnalysis).
  const syncToBackend = useCallback(
    async (result: AnalysisResult) => {
      // Lee captureResult del ref (mismo patron que arriba)
      const currentCapture = captureResultRef.current;
      if (!currentCapture) return;

      setSyncStatus('syncing');
      setSyncError(null);

      try {
        const arrayBuffer = await currentCapture.imageBlob.arrayBuffer();
        const imageBase64 = arrayBufferToBase64(arrayBuffer);

        // Convierte la segunda foto (si existe) a base64
        let contextImageBase64: string | undefined;
        if (contextImageBlobRef.current) {
          const ctxBuffer = await contextImageBlobRef.current.arrayBuffer();
          contextImageBase64 = arrayBufferToBase64(ctxBuffer);
        }

        const syncResult = await syncCapture({
          imageBase64,
          metadata: currentCapture.metadata,
          analysisResult: result,
          contextImageBase64,
          pattern: patternRef.current ?? undefined,
          dangerSignals: dangerSignalsRef.current ?? undefined,
          inspectionReportId: currentCapture.id,
        });

        if (syncResult.success) {
          setSyncStatus('synced');
          setReportId(syncResult.reportId);
        } else {
          setSyncStatus('error');
          setSyncError(syncResult.error.message);
        }
      } catch (err) {
        setSyncStatus('error');
        setSyncError(err instanceof Error ? err.message : 'Error al sincronizar');
      }
    },
    [captureResult]
  );

  // When BYOK analysis completes, sync to backend
  useEffect(() => {
    if (analysisResult && captureResult && syncStatus === 'idle') {
      setFinalResult(analysisResult);
      setIsRunningAnalysis(false);
      void syncToBackend(analysisResult);
    }
  }, [analysisResult, captureResult, syncStatus, syncToBackend]);

  // Reset capture trigger
  const handleCaptureComplete = useCallback(() => {
    setCaptureRequested(false);
  }, []);

  // Computa el TriageOutcome final (override aplicado al AI result)
  // Garantiza pisos de seguridad: si senales o patron lo indican, se eleva
  // el nivel a evacuate_emergency sin importar la severidad AI.
  const finalTriageOutcome: TriageOutcome | null = finalResult && triageOutcome
    ? triageOutcome
    : null;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-surface-0 text-text-primary pt-[env(safe-area-inset-top)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] overflow-x-hidden">
      <GpsWarningBanner gpsStatus={gpsStatus} />

      <header className="flex items-center justify-between px-4 py-3 sm:px-6">
        <h1 className="text-lg font-bold tracking-tight text-text-primary">Captura</h1>
        <MetadataIndicators
          gpsStatus={gpsStatus}
          orientationStatus={orientationStatus}
          gpsAccuracy={gpsAccuracy}
        />
      </header>

      <div className="flex flex-1 flex-col items-stretch justify-start gap-4 px-0 pb-20 sm:px-0">
        {captureResult && previewUrl ? (
          <div className="flex w-full flex-col gap-4">
            <CapturePreview
              imageUrl={previewUrl}
              metadata={captureResult.metadata}
              onDismiss={handleDismissPreview}
            />

            {/* Analisis en curso */}
            {(isAnalyzing || isRunningAnalysis) && (
              <div
                role="status"
                aria-live="polite"
                className="rounded-lg border border-status-info-border bg-surface-2 p-4 text-center"
              >
                <RefreshCw
                  className="mx-auto mb-2 h-6 w-6 animate-spin text-brand-accent"
                  aria-hidden="true"
                />
                <p className="text-sm font-medium text-text-primary">
                  Analizando grieta con IA
                </p>
                <p className="mt-1 text-xs text-text-muted">
                  Esto puede tomar unos segundos
                </p>
              </div>
            )}

            {/* Sincronizacion en curso */}
            {syncStatus === 'syncing' && (
              <div
                role="status"
                aria-live="polite"
                className="rounded-lg border border-status-moderate-border bg-surface-2 p-4 text-center"
              >
                <RefreshCw
                  className="mx-auto mb-2 h-6 w-6 animate-spin text-status-moderate-fg"
                  aria-hidden="true"
                />
                <p className="text-sm font-medium text-text-primary">
                  Sincronizando reporte
                </p>
              </div>
            )}

            {/* Error de analisis */}
            {(analysisError || captureError) && !isRunningAnalysis && syncStatus !== 'syncing' && syncStatus !== 'synced' && (
              <div
                role="alert"
                aria-live="assertive"
                className="rounded-2xl border border-status-critical-border bg-status-critical/10 backdrop-blur-sm p-5 shadow-lg shadow-status-critical/10"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-status-critical/20">
                    <CircleX
                      className="h-5 w-5 text-status-critical-fg"
                      aria-hidden="true"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-status-critical-fg">
                      Error en el análisis
                    </p>
                    <p className="mt-1 text-xs text-status-critical-fg/80 max-h-20 overflow-y-auto">
                      {captureError || analysisError?.message || 'Falló el análisis. Por favor reintenta.'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCaptureError(null);
                    void triggerAnalysis();
                  }}
                  className="mt-4 w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-brand-cta px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-cta/25 hover:bg-brand-cta/90 active:scale-[0.98] transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-brand-accent focus:ring-offset-2 focus:ring-offset-surface-1"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  Reintentar análisis
                </button>
                {analysisState === 'retrying' && (
                  <p className="mt-3 flex items-center justify-center gap-2 text-xs text-status-moderate-fg">
                    <RefreshCw className="h-3 w-3 animate-spin" aria-hidden="true" />
                    Reintentando automáticamente
                  </p>
                )}
              </div>
            )}

            {/* Error de sincronizacion */}
            {syncStatus === 'error' && (
              <div
                role="alert"
                aria-live="assertive"
                className="rounded-2xl border border-status-critical-border bg-status-critical/10 backdrop-blur-sm p-5 shadow-lg shadow-status-critical/10"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-status-critical/20">
                    <CircleX
                      className="h-5 w-5 text-status-critical-fg"
                      aria-hidden="true"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-status-critical-fg">
                      Error al sincronizar
                    </p>
                    <p className="mt-1 text-xs text-status-critical-fg/80 max-h-20 overflow-y-auto">
                      {syncError || 'No se pudo guardar el reporte.'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Exito: reporte sincronizado con triaje 4-tier */}
            {syncStatus === 'synced' && finalResult && finalTriageOutcome && (
              <CaptureSuccessPanel
                outcome={finalTriageOutcome}
                aiRiskLevel={finalResult.riskLevel as RiskLevel}
                confidence={finalResult.confidence}
                description={finalResult.description}
                reportId={reportId}
                onNewCapture={handleDismissPreview}
              />
            )}

            {/* Exito legacy: fallback si triageOutcome es null */}
            {syncStatus === 'synced' && finalResult && !finalTriageOutcome && (
              <div className="rounded-lg border border-status-minor-border bg-surface-2 p-4">
                <p className="text-center font-semibold text-status-minor-fg">
                  <CircleCheck
                    className="mr-2 inline-block h-5 w-5 align-middle"
                    aria-hidden="true"
                  />
                  Reporte generado exitosamente
                </p>
                <div className="mt-3 flex justify-center">
                  <SeverityBadge
                    level={mapRiskLevelToSeverity(finalResult.riskLevel as RiskLevel)}
                    size="md"
                  />
                </div>
                <p className="mt-3 line-clamp-4 text-xs text-text-secondary">
                  {finalResult.description}
                </p>
                {reportId && (
                  <a
                    href={`/reports/${reportId}`}
                    className="mt-4 flex min-h-[48px] items-center justify-center w-full rounded-xl bg-status-minor px-4 py-3 text-center text-sm font-semibold text-status-minor-fg transition-opacity duration-150 hover:opacity-90 active:scale-[0.98]"
                  >
                    <FileText
                      className="mr-2 inline-block h-4 w-4 align-middle"
                      aria-hidden="true"
                    />
                    Ver Reporte Completo
                  </a>
                )}
              </div>
            )}

            {/* Boton de analizar (solo si no se ha iniciado) */}
            {!isRunningAnalysis && !isAnalyzing && !finalResult && syncStatus === 'idle' && !captureError && (
              <button
                type="button"
                onClick={handleStartAnalysis}
                className="w-full min-h-[48px] flex items-center justify-center gap-2 rounded-xl bg-status-minor px-4 py-3 text-base font-semibold text-status-minor-fg shadow-lg shadow-status-minor/20 transition-opacity duration-150 active:scale-[0.98] hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-status-minor-border"
              >
                <ScanLine
                  className="h-5 w-5 shrink-0"
                  aria-hidden="true"
                />
                Analizar con IA
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="relative w-full flex-1 min-h-[60vh]">
              <CameraViewfinder
                captureRequested={captureRequested}
                onCapture={handleImageCaptured}
                onCaptureComplete={handleCaptureComplete}
                torchOn={torchOn}
              />
              <CaptureViewfinderHUD
                captureState={captureState}
                onCapture={handleHudCapture}
                onTorchToggle={handleTorchToggle}
                torchOn={torchOn}
                onUpload={handleUploadClick}
                uploading={uploading}
                pitch={pitch}
                roll={roll}
              />
            </div>

            {captureError && (
              <p
                role="alert"
                className="text-center text-sm text-status-critical-fg"
              >
                <TriangleAlert
                  className="mr-1 inline-block h-4 w-4 align-middle"
                  aria-hidden="true"
                />
                {captureError}
              </p>
            )}

            {/* Input file oculto para el flujo de upload */}
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_IMAGE_TYPES.join(',')}
              onChange={handleFileSelected}
              className="hidden"
              aria-hidden="true"
              tabIndex={-1}
            />
          </>
        )}
      </div>
    </div>
  );
}
