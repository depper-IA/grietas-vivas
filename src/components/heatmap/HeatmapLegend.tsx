'use client';

/**
 * HeatmapLegend — Leyenda de colores para el mapa de calor.
 * Muestra la escala de intensidad de 1 a 10 con colores correspondientes.
 */
export function HeatmapLegend() {
  const levels = [
    { label: 'Bajo', color: '#22c55e', intensity: 1 },
    { label: '', color: '#16a34a', intensity: 2 },
    { label: '', color: '#ca8a04', intensity: 4 },
    { label: 'Medio', color: '#ea580c', intensity: 6 },
    { label: '', color: '#dc2626', intensity: 8 },
    { label: 'Critico', color: '#b91c1c', intensity: 10 },
  ];

  return (
    <div className="rounded-lg border border-border-default bg-surface-0/95 p-3 shadow-lg">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
        Intensidad
      </p>
      <div className="flex items-center gap-1">
        {levels.map((level, i) => (
          <div key={i} className="flex flex-col items-center">
            <div
              className="h-4 w-4 rounded-sm border border-black/10"
              style={{ backgroundColor: level.color }}
            />
            {level.label && (
              <span className="mt-1 text-[10px] text-text-muted">{level.label}</span>
            )}
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-text-muted">
        <span>1</span>
        <span>10</span>
      </div>
    </div>
  );
}
