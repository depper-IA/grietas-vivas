'use client';

import { useState, useCallback, useEffect } from 'react';
import { MetadataIndicators } from '@/components/capture/MetadataIndicators';
import { GpsWarningBanner } from '@/components/capture/GpsWarningBanner';
import type { GpsStatus, OrientationStatus } from '@/components/capture/MetadataIndicators';
import { captureService } from '@/lib/capture/captureService';
import type { CaptureResult } from '@/lib/capture/types';
import { useAIAnalysis } from '@/hooks/useAIAnalysis';
import { useDeviceOrientation } from '@/hooks/useDeviceOrientation';
import { useLatestRef } from '@/hooks/useLatestRef';
import { stripExifData } from '@/lib/exif/strip';
import { analyzeWithFallback } from '@/app/actions/analysis';
import { syncCapture } from '@/app/actions/sync';
import { loadByokConfig } from '@/app/actions/byokSettings';
import type { AnalysisResult, AIConfig, RiskLevel, IAIProvider, AIProvider } from '@/lib/ai/types';
import { aiService } from '@/lib/ai/aiService';
// AI providers are dynamically imported inside `executeTriageAnalysis` so the
// initial bundle does not pull all 6 of them. The fallback Server Action
// `analyzeWithFallback` stays statically imported. (sdd/improve-project 3.3)
import {
  evaluateSafetyOverride,
  evaluateEmergencyOffline,
  type CrackPattern,
  type DangerSignals,
  type TriageOutcome,
} from '@/lib/validation/schemas';
import {
  applyStructuralRules,
  type StructuralContext,
} from '@/lib/ai/structuralPrompt';
import {
  DualCaptureFlow,
  type DualCaptureFlowResult,
  DEFAULT_DANGER_SIGNALS,
  DEFAULT_STRUCTURAL_CONTEXT,
} from '@/components/capture/DualCaptureFlow';
import { CaptureSuccessPanel } from './CaptureSuccessPanel';
import { AnalysisLoadingScreen } from '@/components/capture/AnalysisLoadingScreen';
import { CircleX, RefreshCw } from 'lucide-react';
import { arrayBufferToBase64 } from './helpers';

/**
 * Capture Page — Orquestador principal del flujo de triaje post-sismo.
 *
 * Flujo guiado de 5 pasos (DualCaptureFlow):
 *   1. Captura dual (detalle 30-50 cm con escala + contexto 2 m / upload)
 *   2. Cuestionario estructural (elemento, cruce, crecimiento, escala)
 *   3. Selector de patrón de grieta (10 patrones canónicos FEMA 306 / NSR-10)
 *   4. Checklist de señales de peligro (5 booleanos de colapso)
 *   5. Confirmación y análisis con IA (o motor heurístico offline de emergencia)
 */
export default function CapturePage() {
  // Estado de sensores
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>('unavailable');
  const [orientationStatus, setOrientationStatus] = useState<OrientationStatus>('unavailable');
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);

  const { supported: orientationSupported } = useDeviceOrientation();

  // Estado del flujo de triaje
  const [pattern, setPattern] = useState<CrackPattern | null>(null);
  const [dangerSignals, setDangerSignals] = useState<DangerSignals>(DEFAULT_DANGER_SIGNALS);
  const [structuralContext, setStructuralContext] = useState<StructuralContext>(DEFAULT_STRUCTURAL_CONTEXT);
  const [contextImageBlob, setContextImageBlob] = useState<Blob | null>(null);
  const [detailImageBlob, setDetailImageBlob] = useState<Blob | null>(null);
  const [captureResult, setCaptureResult] = useState<CaptureResult | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);

  // Refs para closures asincrónicas — useLatestRef consolida los 6 pares
  // useRef+useEffect del legacy en una sola linea por state slice.
  // (sdd/improve-project 3.2)
  const patternRef = useLatestRef(pattern);
  const dangerSignalsRef = useLatestRef(dangerSignals);
  const structuralContextRef = useLatestRef(structuralContext);
  const contextImageBlobRef = useLatestRef(contextImageBlob);
  const captureResultRef = useLatestRef(captureResult);
  const detailImageBlobRef = useLatestRef(detailImageBlob);

  // Estado de análisis y sincronización
  const { analyze, isAnalyzing, error: analysisError } = useAIAnalysis();
  const [finalResult, setFinalResult] = useState<AnalysisResult | null>(null);
  const [triageOutcome, setTriageOutcome] = useState<TriageOutcome | null>(null);
  const [isRunningAnalysis, setIsRunningAnalysis] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const [syncError, setSyncError] = useState<string | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);

  // Sensor listeners
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

  useEffect(() => {
    if (orientationSupported) {
      setOrientationStatus('available');
    }
  }, [orientationSupported]);

  // Reset del flujo completo
  const handleResetFlow = useCallback(() => {
    setPattern(null);
    setDangerSignals(DEFAULT_DANGER_SIGNALS);
    setStructuralContext(DEFAULT_STRUCTURAL_CONTEXT);
    setContextImageBlob(null);
    setDetailImageBlob(null);
    setCaptureResult(null);
    setCaptureError(null);
    setFinalResult(null);
    setTriageOutcome(null);
    setIsRunningAnalysis(false);
    setSyncStatus('idle');
    setSyncError(null);
    setReportId(null);
  }, []);

  // Sync del resultado a Supabase backend
  const syncToBackend = useCallback(
    async (
      result: AnalysisResult,
      activeCapture: CaptureResult,
      ctxBlob: Blob | null,
      pat: CrackPattern | null,
      signals: DangerSignals | null
    ) => {
      setSyncStatus('syncing');
      setSyncError(null);

      try {
        const arrayBuffer = await activeCapture.imageBlob.arrayBuffer();
        const imageBase64 = arrayBufferToBase64(arrayBuffer);

        let contextImageBase64: string | undefined;
        if (ctxBlob) {
          const ctxBuffer = await ctxBlob.arrayBuffer();
          contextImageBase64 = arrayBufferToBase64(ctxBuffer);
        }

        const syncResult = await syncCapture({
          imageBase64,
          metadata: activeCapture.metadata,
          analysisResult: result,
          contextImageBase64,
          pattern: pat ?? undefined,
          dangerSignals: signals ?? undefined,
          inspectionReportId: activeCapture.id,
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
    []
  );

  // Ejecución de análisis (Online con IA o Offline con Heurística de Emergencia)
  const executeTriageAnalysis = useCallback(
    async (
      activeCapture: CaptureResult,
      ctxBlob: Blob | null,
      structCtx: StructuralContext,
      pat: CrackPattern,
      signals: DangerSignals
    ) => {
      setIsRunningAnalysis(true);
      setCaptureError(null);

      // 1. Modo offline o sin conexión a internet
      const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
      if (!isOnline) {
        const offlineResult = evaluateEmergencyOffline(structCtx, pat, signals);
        const outcome = evaluateSafetyOverride(pat, signals, offlineResult.riskLevel);
        setFinalResult(offlineResult);
        setTriageOutcome(outcome);
        setIsRunningAnalysis(false);
        // Still attempt sync — will queue for later if truly offline
        await syncToBackend(offlineResult, activeCapture, ctxBlob, pat, signals);
        return;
      }

      // 2. Modo Online
      try {
        let cleanImage: Blob;
        try {
          cleanImage = await stripExifData(activeCapture.imageBlob);
        } catch {
          cleanImage = activeCapture.imageBlob;
        }

        const byokResult = await loadByokConfig();
        if (byokResult.success && byokResult.config?.apiKey) {
          const { apiKey, provider, model, baseUrl } = byokResult.config;
          let providerInstance: IAIProvider | null = null;

          switch (provider) {
            case 'anthropic': {
              const mod = await import('@/lib/ai/providers/anthropic');
              providerInstance = new mod.AnthropicProvider(apiKey, model);
              break;
            }
            case 'openrouter': {
              const mod = await import('@/lib/ai/providers/openrouter');
              providerInstance = new mod.OpenRouterProvider(apiKey, model, baseUrl);
              break;
            }
            case 'gemini': {
              const mod = await import('@/lib/ai/providers/gemini');
              providerInstance = new mod.GeminiProvider(apiKey, model);
              break;
            }
            case 'minimax': {
              const mod = await import('@/lib/ai/providers/minimax');
              providerInstance = new mod.MinimaxProvider(apiKey, model, baseUrl);
              break;
            }
            case 'nvidia-nim': {
              const mod = await import('@/lib/ai/providers/nvidia-nim');
              providerInstance = new mod.NvidiaNimProvider(apiKey, model, baseUrl);
              break;
            }
            case 'openai':
            case 'custom':
            default: {
              const mod = await import('@/lib/ai/providers/openai');
              providerInstance = new mod.OpenAIProvider(apiKey, model);
              break;
            }
          }

          if (providerInstance) {
            aiService.registerProvider(providerInstance);
          }

          const config: AIConfig = {
            mode: 'byok',
            byok: { provider: provider as AIProvider, apiKey, model, baseUrl },
            fallbackPriority: ['nvidia-nim', 'openrouter'],
          };

          const rawByokResult = await analyze(cleanImage, config);
          if (rawByokResult) {
            const weighted = applyStructuralRules(
              {
                riskLevel: rawByokResult.riskLevel,
                description: rawByokResult.description,
                confidence: rawByokResult.confidence,
              },
              structCtx
            );
            const enrichedResult: AnalysisResult = {
              ...rawByokResult,
              riskLevel: weighted.riskLevel,
              description: weighted.description,
            };
            const outcome = evaluateSafetyOverride(pat, signals, enrichedResult.riskLevel);
            setFinalResult(enrichedResult);
            setTriageOutcome(outcome);
            setIsRunningAnalysis(false);
            await syncToBackend(enrichedResult, activeCapture, ctxBlob, pat, signals);
            return;
          }
        }

        // Fallback mode del servidor
        const arrayBuffer = await cleanImage.arrayBuffer();
        const imageBase64 = arrayBufferToBase64(arrayBuffer);

        let contextImageBase64: string | undefined;
        if (ctxBlob) {
          const ctxBuffer = await ctxBlob.arrayBuffer();
          contextImageBase64 = arrayBufferToBase64(ctxBuffer);
        }

        const fallbackResult = await analyzeWithFallback({
          imageBase64,
          contextImageBase64,
          structuralContext: structCtx,
        });

        if (fallbackResult.success) {
          const outcome = evaluateSafetyOverride(pat, signals, fallbackResult.data.riskLevel);
          setFinalResult(fallbackResult.data);
          setTriageOutcome(outcome);
          setIsRunningAnalysis(false);
          await syncToBackend(fallbackResult.data, activeCapture, ctxBlob, pat, signals);
        } else {
          // Si el servidor falla, activar inmediatamente el motor de emergencia local
          const emergencyResult = evaluateEmergencyOffline(structCtx, pat, signals);
          const outcome = evaluateSafetyOverride(pat, signals, emergencyResult.riskLevel);
          setFinalResult(emergencyResult);
          setTriageOutcome(outcome);
          setIsRunningAnalysis(false);
          await syncToBackend(emergencyResult, activeCapture, ctxBlob, pat, signals);
        }
      } catch {
        // En caso de cualquier excepción no capturada, motor offline de emergencia
        const emergencyResult = evaluateEmergencyOffline(structCtx, pat, signals);
        const outcome = evaluateSafetyOverride(pat, signals, emergencyResult.riskLevel);
        setFinalResult(emergencyResult);
        setTriageOutcome(outcome);
        setIsRunningAnalysis(false);
        await syncToBackend(emergencyResult, activeCapture, ctxBlob, pat, signals);
      }
    },
    [analyze, syncToBackend]
  );

  // Callback al completar el flujo DualCaptureFlow de 5 pasos
  const handleTriageComplete = useCallback(
    async (result: DualCaptureFlowResult) => {
      setDetailImageBlob(result.detailImageBlob);
      setContextImageBlob(result.contextImageBlob);
      setStructuralContext(result.structuralContext);
      setPattern(result.pattern);
      setDangerSignals(result.dangerSignals);

      try {
        const captureRes = await captureService.capture(result.detailImageBlob);
        setCaptureResult(captureRes);

        await executeTriageAnalysis(
          captureRes,
          result.contextImageBlob,
          result.structuralContext,
          result.pattern,
          result.dangerSignals
        );
      } catch (err) {
        setCaptureError(
          err instanceof Error
            ? err.message
            : 'Error durante la captura. Activando triaje de emergencia...'
        );
        const emergencyResult = evaluateEmergencyOffline(
          result.structuralContext,
          result.pattern,
          result.dangerSignals
        );
        const outcome = evaluateSafetyOverride(
          result.pattern,
          result.dangerSignals,
          emergencyResult.riskLevel
        );
        setFinalResult(emergencyResult);
        setTriageOutcome(outcome);
        setIsRunningAnalysis(false);
        setSyncStatus('synced');
      }
    },
    [executeTriageAnalysis]
  );

  // Reintento manual
  const handleRetry = useCallback(() => {
    if (
      captureResultRef.current &&
      patternRef.current &&
      dangerSignalsRef.current &&
      structuralContextRef.current
    ) {
      void executeTriageAnalysis(
        captureResultRef.current,
        contextImageBlobRef.current,
        structuralContextRef.current,
        patternRef.current,
        dangerSignalsRef.current
      );
    } else {
      handleResetFlow();
    }
    // Las refs de useLatestRef son estables (identidad de useRef), así que
    // listarlas no re-crea el callback; solo satisface exhaustive-deps.
  }, [
    executeTriageAnalysis,
    handleResetFlow,
    captureResultRef,
    contextImageBlobRef,
    structuralContextRef,
    patternRef,
    dangerSignalsRef,
  ]);

  return (
    <div className="flex flex-col flex-1 w-full max-w-2xl mx-auto text-text-primary px-3 sm:px-4 py-2 overflow-x-hidden">
      <GpsWarningBanner gpsStatus={gpsStatus} />

      <header className="flex items-center justify-between py-2.5 mb-2">
        <div>
          <h1 className="text-base sm:text-lg font-bold tracking-tight text-text-primary">
            Triaje de Grietas Post-Sismo
          </h1>
          <p className="text-[11px] text-text-muted">
            Evaluación asistida por IA y matriz forense NSR-10
          </p>
        </div>
        <MetadataIndicators
          gpsStatus={gpsStatus}
          orientationStatus={orientationStatus}
          gpsAccuracy={gpsAccuracy}
        />
      </header>

      <main className="flex flex-1 flex-col items-stretch justify-start gap-4">
        {/* Vista de análisis en curso */}
        {(isAnalyzing || isRunningAnalysis) && (
          <AnalysisLoadingScreen
            onTimeout={() => {
              setIsRunningAnalysis(false);
              setCaptureError('El análisis excedió el tiempo máximo. Usa "Reintentar" o verifica tu conexión.');
            }}
          />
        )}

        {/* Vista de éxito: reporte sincronizado o resultado de emergencia */}
        {!isRunningAnalysis && !isAnalyzing && finalResult && triageOutcome && (
          <CaptureSuccessPanel
            outcome={triageOutcome}
            aiRiskLevel={finalResult.riskLevel as RiskLevel}
            confidence={finalResult.confidence}
            description={finalResult.description}
            reportId={reportId}
            onNewCapture={handleResetFlow}
          />
        )}

        {/* Vista de error si falla sin resultado */}
        {!isRunningAnalysis &&
          !isAnalyzing &&
          !finalResult &&
          (analysisError || captureError || syncStatus === 'error') && (
            <div
              role="alert"
              aria-live="assertive"
              className="rounded-2xl border border-red-300 bg-red-50 p-5 shadow-md"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-200 text-red-900">
                  <CircleX
                    className="h-5 w-5 text-red-700"
                    aria-hidden="true"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-red-950">
                    Error en la evaluación
                  </p>
                  <p className="mt-1 text-xs text-red-900 max-h-20 overflow-y-auto font-medium">
                    {syncError ||
                      captureError ||
                      analysisError?.message ||
                      'No se pudo completar el análisis.'}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-col sm:flex-row gap-2.5">
                <button
                  type="button"
                  onClick={handleRetry}
                  className="min-h-[44px] flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-brand-cta px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-cta/25 hover:bg-brand-cta/90 active:scale-[0.98] transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-brand-accent focus:ring-offset-2 focus:ring-offset-surface-1"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  <span>Reintentar</span>
                </button>
                <a
                  href="/settings?reason=fallback_failed"
                  className="min-h-[44px] flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-border-default bg-white px-5 py-2.5 text-sm font-semibold text-brand-accent hover:bg-surface-2 active:scale-[0.98] transition-all"
                >
                  <span>Conectar mi propia API</span>
                </a>
              </div>
            </div>
          )}

        {/* Flujo principal de 5 pasos */}
        {!isRunningAnalysis && !isAnalyzing && !finalResult && (
          <DualCaptureFlow onComplete={handleTriageComplete} />
        )}
      </main>
    </div>
  );
}
