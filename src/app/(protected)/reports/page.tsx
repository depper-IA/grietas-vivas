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
import { FileImage, RefreshCw, Trash2, X } from 'lucide-react';
import { createBrowserSupabaseClient } from '@/lib/db/supabase';
import { getAllCaptures, deleteCapture } from '@/lib/db/localDb';
import { deleteReport } from '@/app/actions/report';
import { ReportCard, type ReportCardData } from '@/components/reports/ReportCard';
import type { RiskLevel } from '@/lib/ai/types';

type LoadingState = 'loading' | 'loaded' | 'error';

export default function ReportsPage() {
  const [reports, setReports] = useState<ReportCardData[]>([]);
  const [loadingState, setLoadingState] = useState<LoadingState>('loading');
  const [isOffline, setIsOffline] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const handleDeleteClick = (id: string) => {
    setDeletingId(id);
    setDeleteError('');
  };

  const confirmDelete = async () => {
    if (!deletingId) return;
    setIsDeleting(true);
    setDeleteError('');
    try {
      const res = await deleteReport({ reportId: deletingId });
      if (res.success) {
        await deleteCapture(deletingId);
        setReports((prev) => prev.filter((r) => r.id !== deletingId));
        setDeletingId(null);
      } else {
        setDeleteError(res.error?.message || 'No se pudo eliminar el reporte.');
      }
    } catch {
      // Si falla por red u offline, borrar de localDb de todas formas
      await deleteCapture(deletingId);
      setReports((prev) => prev.filter((r) => r.id !== deletingId));
      setDeletingId(null);
    } finally {
      setIsDeleting(false);
    }
  };

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
          .select('id, risk_level, created_at, status, analysis_text, image_storage_path')
          .order('created_at', { ascending: false });

        if (error) {
          throw new Error(error.message);
        }

        // Obtener URLs firmadas para las miniaturas desde Supabase Storage
        const paths = (data ?? [])
          .map((row) => row.image_storage_path)
          .filter((p): p is string => Boolean(p));

        const urlMap = new Map<string, string>();
        if (paths.length > 0) {
          try {
            const { data: signedData } = await supabase.storage
              .from('captures')
              .createSignedUrls(paths, 3600);

            if (signedData) {
              for (const item of signedData) {
                if (item.signedUrl && item.path) {
                  urlMap.set(item.path, item.signedUrl);
                }
              }
            }
          } catch {
            // Degradación graceful si falla createSignedUrls
          }
        }

        const remoteReports: ReportCardData[] = (data ?? []).map((row) => ({
          id: row.id,
          riskLevel: row.risk_level as RiskLevel,
          createdAt: row.created_at,
          status: row.status,
          analysisText: row.analysis_text ?? undefined,
          imageUrl: row.image_storage_path ? urlMap.get(row.image_storage_path) ?? null : null,
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
        .map((capture) => {
          let localImageUrl: string | null = null;
          if (capture.imageBlob) {
            try {
              localImageUrl = URL.createObjectURL(capture.imageBlob);
            } catch {
              localImageUrl = null;
            }
          }
          return {
            id: capture.id,
            riskLevel: capture.analysisResult!.riskLevel,
            createdAt: capture.createdAt,
            status: capture.syncStatus === 'synced' ? 'analyzed' : 'pending',
            analysisText: capture.analysisResult!.description,
            imageUrl: localImageUrl,
            isOfflineCached: true,
          };
        })
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
            <ReportCard key={report.id} report={report} onDelete={handleDeleteClick} />
          ))}
        </ul>
      )}

      {/* Modal de confirmación de eliminación */}
      {deletingId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirmar eliminación"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
        >
          <div className="w-full max-w-sm rounded-2xl border border-status-critical-border bg-surface-1 p-5 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-status-critical/20 text-status-critical-fg">
                <Trash2 className="h-5 w-5" aria-hidden="true" />
              </div>
              <button
                type="button"
                onClick={() => setDeletingId(null)}
                aria-label="Cerrar modal"
                className="text-text-muted hover:text-text-primary p-1 rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div>
              <h3 className="text-base font-bold text-text-primary tracking-tight">
                ¿Eliminar reporte?
              </h3>
              <p className="mt-1.5 text-xs text-text-secondary leading-relaxed">
                Esta acción eliminará permanentemente los datos y las fotografías asociadas. No se puede deshacer.
              </p>
            </div>

            {deleteError && (
              <p className="text-xs text-status-critical-fg font-medium">{deleteError}</p>
            )}

            <div className="flex gap-2.5 justify-end pt-2">
              <button
                type="button"
                onClick={() => setDeletingId(null)}
                disabled={isDeleting}
                className="min-h-[40px] px-4 rounded-xl border border-border-default bg-surface-2 text-xs font-semibold text-text-secondary hover:text-text-primary active:scale-95 transition-all"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={isDeleting}
                className="min-h-[40px] px-4 rounded-xl bg-status-critical text-xs font-semibold text-white shadow-md hover:bg-status-critical/90 active:scale-95 transition-all disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {isDeleting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                <span>Eliminar</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
