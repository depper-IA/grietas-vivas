'use client';

/**
 * Reports List Page — Lista de reportes con tokens semanticos dark-first.
 *
 * Muestra reportes desde Supabase (online) o IndexedDB (offline) usando
 * el componente `ReportCard` (que internamente delega a `DamageReportCard`
 * del slice 3). Estados:
 *
 *   - loading: spinner accesible (sr-only)
 *   - loaded: lista de cards o empty state con icono Lucide
 *   - error: alerta con retry
 *
 * Migracion visual aplicada:
 *   - surface-0/2 + text-primary/secondary/muted en lugar de bg-white/text-gray
 *   - banner offline con border-status-info + bg-surface-2
 *   - empty state con icono Lucide FileImage (sin emojis)
 *   - retry/error styling con tokens semanticos
 *
 * Ref: spec `visual-redesign-core` (Damage Assessment Cards, No Emojis in UI).
 */

import { useEffect, useState, useCallback } from 'react';
import { FileImage, RefreshCw } from 'lucide-react';
import { createBrowserSupabaseClient } from '@/lib/db/supabase';
import { getAllCaptures } from '@/lib/db/localDb';
import { ReportCard, type ReportCardData } from '@/components/reports/ReportCard';
import type { RiskLevel } from '@/lib/ai/types';

type LoadingState = 'loading' | 'loaded' | 'error';

export default function ReportsPage() {
  const [reports, setReports] = useState<ReportCardData[]>([]);
  const [loadingState, setLoadingState] = useState<LoadingState>('loading');
  const [isOffline, setIsOffline] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const fetchReports = useCallback(async () => {
    setLoadingState('loading');
    setErrorMessage('');

    // Check connectivity
    const online = navigator.onLine;
    setIsOffline(!online);

    if (online) {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data, error } = await supabase
          .from('reports')
          .select('id, risk_level, created_at, status, analysis_text')
          .order('created_at', { ascending: false });

        if (error) {
          throw new Error(error.message);
        }

        const remoteReports: ReportCardData[] = (data ?? []).map((row) => ({
          id: row.id,
          riskLevel: row.risk_level as RiskLevel,
          createdAt: row.created_at,
          status: row.status,
          analysisText: row.analysis_text ?? undefined,
          isOfflineCached: false,
        }));

        setReports(remoteReports);
        setLoadingState('loaded');
      } catch {
        // If fetch fails, fall back to local cache
        await loadCachedReports();
      }
    } else {
      // Offline: load from IndexedDB
      await loadCachedReports();
    }
  }, []);

  const loadCachedReports = async () => {
    try {
      const captures = await getAllCaptures();
      const cachedReports: ReportCardData[] = captures
        .filter((capture) => capture.analysisResult !== null)
        .map((capture) => ({
          id: capture.id,
          riskLevel: capture.analysisResult!.riskLevel,
          createdAt: capture.createdAt,
          status: capture.syncStatus === 'synced' ? 'analyzed' : 'pending',
          analysisText: capture.analysisResult!.description,
          isOfflineCached: true,
        }))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      setReports(cachedReports);
      setIsOffline(true);
      setLoadingState('loaded');
    } catch {
      setErrorMessage('No se pudieron cargar los reportes. Intenta de nuevo.');
      setLoadingState('error');
    }
  };

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  // Listen to connectivity changes
  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      fetchReports();
    };
    const handleOffline = () => {
      setIsOffline(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [fetchReports]);

  return (
    <main className="mx-auto max-w-lg px-4 py-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[calc(5rem+env(safe-area-inset-bottom))] overflow-x-hidden">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">Reportes</h1>
        <p className="mt-1 text-sm text-text-muted">
          Tus reportes de análisis de grietas
        </p>
        {isOffline && (
          <div
            className="mt-3 rounded-xl border border-brand-accent/30 bg-surface-2 p-3 text-sm text-text-secondary shadow-sm"
            role="alert"
          >
            Sin conexión. Mostrando reportes almacenados localmente.
          </div>
        )}
      </header>

      {loadingState === 'loading' && (
        <div
          className="flex items-center justify-center py-16"
          aria-live="polite"
        >
          <RefreshCw
            className="h-8 w-8 animate-spin text-brand-accent"
            role="status"
            aria-label="Cargando reportes..."
          />
        </div>
      )}

      {loadingState === 'error' && (
        <div
          className="rounded-2xl border border-status-critical-border bg-surface-2 p-5 text-center shadow-md"
          role="alert"
        >
          <p className="text-sm font-medium text-status-critical-fg">{errorMessage}</p>
          <button
            onClick={fetchReports}
            className="mt-4 min-h-[44px] rounded-xl border border-status-critical-border bg-status-critical px-5 py-2.5 text-sm font-semibold text-status-critical-fg transition-opacity duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] hover:opacity-90 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-status-critical-border"
          >
            Reintentar
          </button>
        </div>
      )}

      {loadingState === 'loaded' && reports.length === 0 && (
        <div className="py-16 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-2 border border-border-default shadow-sm mb-4">
            <FileImage
              className="h-8 w-8 text-text-muted opacity-80"
              aria-hidden="true"
            />
          </div>
          <h2 className="text-lg font-bold text-text-primary">
            Sin reportes aún
          </h2>
          <p className="mt-1.5 text-sm text-text-muted max-w-xs mx-auto">
            Captura una foto de una grieta para generar tu primer análisis estructural.
          </p>
        </div>
      )}

      {loadingState === 'loaded' && reports.length > 0 && (
        <ul className="space-y-3.5" aria-label="Lista de reportes">
          {reports.map((report) => (
            <ReportCard key={report.id} report={report} />
          ))}
        </ul>
      )}
    </main>
  );
}
