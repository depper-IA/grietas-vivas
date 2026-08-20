/**
 * Mapa Page — Mapa de calor publico de reportes de grietas.
 *
 * Pagina publica que muestra un mapa de calor con las zonas afectadas.
 * No requiere autenticacion.
 *
 * Caracteristicas:
 * - Mapa interactivo con Leaflet y OpenStreetMap
 * - Circulos de calor por zona con intensidad
 * - Popup con estadisticas al hacer click
 * - Barra de estadisticas generales
 * - Leyenda de colores
 */

import { getHeatmapData } from '@/app/actions/heatmap';
import { HeatmapMap } from '@/components/heatmap/HeatmapMap';
import { HeatmapLegend } from '@/components/heatmap/HeatmapLegend';
import { HeatmapStats } from '@/components/heatmap/HeatmapStats';

export const dynamic = 'force-dynamic';

export default async function MapaPage() {
  const result = await getHeatmapData();

  const zones = result.success ? result.data ?? [] : [];

  return (
    <main className="min-h-screen bg-surface-0">
      <header className="sticky top-0 z-10 border-b border-border-default bg-surface-1/95 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-4 py-4">
          <h1 className="text-xl font-bold tracking-tight text-text-primary">
            Mapa de Calor — Grietas Vivas
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Zonas afectadas por riesgo estructural en tiempo real
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 space-y-6">
        {zones.length > 0 && <HeatmapStats zones={zones} />}

        <div className="relative">
          <div className="absolute top-4 right-4 z-[1000]">
            <HeatmapLegend />
          </div>
          <HeatmapMap zones={zones} className="h-[calc(100vh-300px)] min-h-[500px]" />
        </div>

        {!result.success && (
          <div className="rounded-xl border border-status-critical-border bg-status-critical/10 p-4 text-sm text-status-critical">
            No fue posible cargar los datos del mapa. Por favor intenta mas tarde.
          </div>
        )}

        {zones.length === 0 && result.success && (
          <div className="rounded-xl border border-border-default bg-surface-1 p-8 text-center">
            <p className="text-text-secondary">
              No hay datos de reportes con ubicacion disponibles todavia.
            </p>
            <p className="mt-2 text-sm text-text-muted">
              El mapa seguira visible. Los datos aparecern automaticamente cuando se reporten grietas.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
