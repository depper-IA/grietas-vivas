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
import { DualCaptureFlow, type DualCaptureFlowResult } from '@/components/capture/DualCaptureFlow';
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
import { retrieveEncryptedKey, hasStoredKey } from '@/lib/crypto/byokEncryption';
import type { AnalysisResult, AIConfig, RiskLevel } from '@/lib/ai/types';
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
  useEffect(() => {
    patternRef.current = pattern;
  }, [pattern]);
  useEffect(() => {
    dangerSignalsRef.current = dangerSignals;
  }, [dangerSignals]);
  useEffect(() => {
    contextImageBlobRef.current = contextImageBlob;
  }, [contextImageBlob]);

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
  const triageOutcome = useEvaluateSafetyOverride(
    pattern,
    dangerSignals,
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

  // Handle image blob from viewfinder
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
    }
  }, []);

  // Dismiss preview and return to camera
  const handleDismissPreview = useCallback(() => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setCaptureResult(null);
    setPreviewUrl(null);
    setCaptureError(null);
    setShowTriageFlow(false);
    setPattern(null);
    setDangerSignals(null);
    setContextImageBlob(null);
    setFinalResult(null);
    setIsRunningAnalysis(false);
    setSyncStatus('idle');
    setSyncError(null);
    setReportId(null);
  }, [previewUrl]);

  // Start the triage flow
  const handleStartTriage = useCallback(() => {
    setShowTriageFlow(true);
  }, []);

  // Trigger the AI analysis with the triaje data
  const triggerAnalysis = useCallback(async () => {
    if (!captureResult) return;

    setIsRunningAnalysis(true);
    setCaptureError(null);

    try {
      // Strip EXIF before sending to AI
      let cleanImage: Blob;
      try {
        cleanImage = await stripExifData(captureResult.imageBlob);
      } catch {
        cleanImage = captureResult.imageBlob;
      }

      // Determine AI config: BYOK or Fallback
      const hasByokKey = hasStoredKey();

      if (hasByokKey) {
        const supabase = createBrowserSupabaseClient();
        const { data: { session } } = await supabase.auth.getSession();

        if (session?.access_token) {
          const apiKey = await retrieveEncryptedKey(session.access_token);
          if (apiKey) {
            const provider: AIConfig['byok'] = {
              provider: apiKey.startsWith('sk-ant-')
                ? 'anthropic'
                : apiKey.startsWith('sk-or-')
                ? 'openrouter'
                : apiKey.startsWith('AIza')
                ? 'gemini'
                : 'openai',
              apiKey,
            };

            const config: AIConfig = {
              mode: 'byok',
              byok: provider,
              fallbackPriority: ['openrouter', 'nvidia-nim'],
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

  // Callback cuando DualCaptureFlow completa los 4 pasos
  const handleTriageComplete = useCallback(
    (data: DualCaptureFlowResult) => {
      setPattern(data.pattern);
      setDangerSignals(data.dangerSignals);
      setContextImageBlob(data.contextImageBlob);
      setShowTriageFlow(false);
      void triggerAnalysis();
    },
    [triggerAnalysis]
  );

  // Sync the capture + analysis result to Supabase backend.
  // Usa refs para leer pattern/dangerSignals/contextImageBlob
  // actuales y evitar closures stale cuando el handler es invocado
  // desde el flujo async (handleTriageComplete -> triggerAnalysis).
  const syncToBackend = useCallback(
    async (result: AnalysisResult) => {
      if (!captureResult) return;

      setSyncStatus('syncing');
      setSyncError(null);

      try {
        const arrayBuffer = await captureResult.imageBlob.arrayBuffer();
        const imageBase64 = arrayBufferToBase64(arrayBuffer);

        // Convierte la segunda foto (si existe) a base64
        let contextImageBase64: string | undefined;
        if (contextImageBlobRef.current) {
          const ctxBuffer = await contextImageBlobRef.current.arrayBuffer();
          contextImageBase64 = arrayBufferToBase64(ctxBuffer);
        }

        const syncResult = await syncCapture({
          imageBase64,
          metadata: captureResult.metadata,
          analysisResult: result,
          contextImageBase64,
          pattern: patternRef.current ?? undefined,
          dangerSignals: dangerSignalsRef.current ?? undefined,
          inspectionReportId: captureResult.id,
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

      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 pb-4 sm:px-6">
        {showTriageFlow && captureResult ? (
          <DualCaptureFlow
            onComplete={handleTriageComplete}
            onCancel={handleStartTriage}
          />
        ) : captureResult && previewUrl ? (
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
                className="rounded-lg border border-status-critical-border bg-surface-2 p-4 text-center"
              >
                <CircleX
                  className="mx-auto mb-2 h-5 w-5 text-status-critical-fg"
                  aria-hidden="true"
                />
                <p className="text-sm font-medium text-status-critical-fg">
                  Error en el análisis
                </p>
                <p className="mt-1 text-xs text-status-critical-fg/80">
                  {captureError || analysisError?.message || 'Falló el análisis. Se reintentará automáticamente.'}
                </p>
                {analysisState === 'retrying' && (
                  <p className="mt-2 flex items-center justify-center gap-1 text-xs text-status-moderate-fg">
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
                className="rounded-lg border border-status-critical-border bg-surface-2 p-4 text-center"
              >
                <CircleX
                  className="mx-auto mb-2 h-5 w-5 text-status-critical-fg"
                  aria-hidden="true"
                />
                <p className="text-sm font-medium text-status-critical-fg">
                  Error al sincronizar
                </p>
                <p className="mt-1 text-xs text-status-critical-fg/80">
                  {syncError || 'No se pudo guardar el reporte.'}
                </p>
              </div>
            )}

            {/* Exito: reporte sincronizado con triaje 4-tier */}
            {syncStatus === 'synced' && finalResult && finalTriageOutcome && (
              <CaptureSuccessPanel
                outcome={finalTriageOutcome}
                aiRiskLevel={finalResult.riskLevel as RiskLevel}
                confidence={finalResult.confidence}
                provider={finalResult.provider}
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
                onClick={handleStartTriage}
                className="w-full min-h-[48px] flex items-center justify-center gap-2 rounded-xl bg-status-minor px-4 py-3 text-base font-semibold text-status-minor-fg shadow-lg shadow-status-minor/20 transition-opacity duration-150 active:scale-[0.98] hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-status-minor-border"
              >
                <ScanLine
                  className="h-5 w-5 shrink-0"
                  aria-hidden="true"
                />
                Clasificar y Analizar
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="relative w-full">
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
          </>
        )}
      </div>
    </div>
  );
}
