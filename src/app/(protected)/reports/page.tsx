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
import { FileImage, RefreshCw, Trash2, X, TrendingUp, LayoutGrid } from 'lucide-react';
import { createBrowserSupabaseClient } from '@/lib/db/supabase';
import { getAllCaptures, deleteCapture } from '@/lib/db/localDb';
import { deleteReport, getUserClusters, type GetUserClustersSuccess } from '@/app/actions/report';
import { ReportCard, type ReportCardData } from '@/components/reports/ReportCard';
import { ClusterCard } from '@/components/reports/ClusterCard';
import type { RiskLevel } from '@/lib/ai/types';

type LoadingState = 'loading' | 'loaded' | 'error';
type ActiveTab = 'reports' | 'progression';

export default function ReportsPage() {
  const [reports, setReports] = useState<ReportCardData[]>([]);
  const [loadingState, setLoadingState] = useState<LoadingState>('loading');
  const [isOffline, setIsOffline] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [activeTab, setActiveTab] = useState<ActiveTab>('reports');
  const [clusters, setClusters] = useState<GetUserClustersSuccess['clusters']>([]);
  const [clustersLoading, setClustersLoading] = useState(false);

  const handleDeleteClick = (id: string) => {
    setDeletingId(id);
    setDeleteError('');
  };

  const confirmDelete = async () => {
    if (!deletingId) return;
    setIsDeleting(true);
    setDeleteError('');
    try {
      try {
        await deleteCapture(deletingId);
      } catch {
        // Continuar
      }

      if (navigator.onLine && !deletingId.startsWith('local-')) {
        try {
          await deleteReport({ reportId: deletingId });
        } catch {
          // Error en la nube no bloquea la eliminacion visual local
        }
      }

      setReports((prev) => prev.filter((r) => r.id !== deletingId));
      setDeletingId(null);
    } catch {
      setDeleteError('No se pudo eliminar el reporte.');
    } finally {
      setIsDeleting(false);
    }
  };

  const fetchReports = useCallback(async () => {
    setLoadingState('loading');
    setErrorMessage('');

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
            // Degradacion graceful si falla createSignedUrls
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
        await loadCachedReports();
      }
    } else {
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

  const fetchClusters = useCallback(async () => {
    setClustersLoading(true);
    try {
      const result = await getUserClusters();
      if (result.success) {
        setClusters(result.clusters);
      }
    } catch {
      // Ignore errors for clusters
    } finally {
      setClustersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'reports') {
      fetchReports();
    } else if (activeTab === 'progression') {
      fetchClusters();
    }
  }, [activeTab, fetchReports, fetchClusters]);

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
          Tus reportes de analisis de grietas
        </p>
        {isOffline && (
          <div
            className="mt-3 rounded-xl border border-brand-accent/30 bg-surface-2 p-3 text-sm text-text-secondary shadow-sm"
            role="alert"
          >
            Sin conexion. Mostrando reportes almacenados localmente.
          </div>
        )}
      </header>

      {/* Tab selector */}
      <div className="flex rounded-xl bg-surface-1 p-1.5 border border-border-default shadow-sm mb-6">
        <button
          type="button"
          onClick={() => setActiveTab('reports')}
          className={`flex-1 py-2.5 px-3 text-xs sm:text-sm font-semibold rounded-lg transition-all duration-150 flex items-center justify-center gap-2 ${
            activeTab === 'reports'
              ? 'bg-brand-accent text-white shadow-sm'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          <FileImage className="h-4 w-4" aria-hidden="true" />
          <span>Reportes</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('progression')}
          className={`flex-1 py-2.5 px-3 text-xs sm:text-sm font-semibold rounded-lg transition-all duration-150 flex items-center justify-center gap-2 ${
            activeTab === 'progression'
              ? 'bg-brand-accent text-white shadow-sm'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          <TrendingUp className="h-4 w-4" aria-hidden="true" />
          <span>Mi Progresion</span>
        </button>
      </div>

      {/* Reports Tab */}
      {activeTab === 'reports' && (
        <>
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
              <p className="text-sm font-medium text-status-critical-border">{errorMessage}</p>
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
                Sin reportes aun
              </h2>
              <p className="mt-1.5 text-sm text-text-muted max-w-xs mx-auto">
                Captura una foto de una grieta para generar tu primer analisis estructural.
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
        </>
      )}

      {/* Progression Tab */}
      {activeTab === 'progression' && (
        <>
          {clustersLoading && (
            <div
              className="flex items-center justify-center py-16"
              aria-live="polite"
            >
              <RefreshCw
                className="h-8 w-8 animate-spin text-brand-accent"
                role="status"
                aria-label="Cargando progression..."
              />
            </div>
          )}

          {!clustersLoading && clusters.length === 0 && (
            <div className="py-16 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-2 border border-border-default shadow-sm mb-4">
                <LayoutGrid
                  className="h-8 w-8 text-text-muted opacity-80"
                  aria-hidden="true"
                />
              </div>
              <h2 className="text-lg font-bold text-text-primary">
                Sin hogares registrados
              </h2>
              <p className="mt-1.5 text-sm text-text-muted max-w-xs mx-auto">
                Los hogares se crean automaticamente cuando agregas analisis con ubicacion GPS.
              </p>
            </div>
          )}

          {!clustersLoading && clusters.length > 0 && (
            <div className="space-y-4">
              <p className="text-xs text-text-muted">
                Tus hogares agrupados por ubicacion ({clusters.length} hogar{clusters.length !== 1 ? 'es' : ''})
              </p>
              <div className="space-y-4">
                {clusters.map((cluster) => (
                  <ClusterCard
                    key={cluster.clusterId}
                    clusterId={cluster.clusterId}
                    entries={[
                      {
                        id: cluster.latestReportId,
                        date: cluster.latestDate,
                        riskLevel: cluster.worstRisk,
                      },
                    ]}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal de confirmacion de eliminacion */}
      {deletingId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirmar eliminacion"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
        >
          <div className="w-full max-w-sm rounded-2xl border border-status-critical-border bg-surface-1 p-5 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-status-critical/20 text-status-critical-border">
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
                Eliminar reporte?
              </h3>
              <p className="mt-1.5 text-xs text-text-secondary leading-relaxed">
                Esta accion eliminara permanentemente los datos y las fotografias asociadas. No se puede deshacer.
              </p>
            </div>

            {deleteError && (
              <p className="text-xs text-status-critical-border font-medium">{deleteError}</p>
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
