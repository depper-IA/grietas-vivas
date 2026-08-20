'use client';

import { useEffect, useRef } from 'react';
import type { HeatmapZone } from '@/app/actions/heatmap';

interface HeatmapMapProps {
  zones: HeatmapZone[];
  className?: string;
}

export function HeatmapMap({ zones, className = '' }: HeatmapMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    let mounted = true;

    import('leaflet').then((L) => {
      if (!mounted || !mapRef.current || mapInstanceRef.current) return;

      // Fix default marker icon issue in Leaflet with bundlers
      delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
      });

      // Initialize map centered on Cali, Colombia
      const map = L.map(mapRef.current!).setView([3.4516, -76.5320], 13);
      mapInstanceRef.current = map;

      // Add OpenStreetMap tiles
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      // Add heat circles for each zone
      zones.forEach((zone) => {
        const color = getIntensityColor(zone.intensity);
        const radius = Math.max(200, zone.reportCount * 80);

        const circle = L.circle([zone.lat, zone.lng], {
          color: color,
          fillColor: color,
          fillOpacity: 0.5,
          radius: radius,
          weight: 2,
        }).addTo(map);

        circle.bindPopup(`
          <div style="min-width: 180px;">
            <strong style="font-size: 1rem;">${zone.barrio}</strong>
            <hr style="margin: 8px 0; border: 1px solid #e5e5e5;" />
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 0.875rem;">
              <span>Casas/edificios afectados:</span>
              <strong>${zone.reportCount}</strong>
              <span style="color: #dc2626;">Criticos:</span>
              <strong>${zone.criticalCount}</strong>
              <span style="color: #ea580c;">Altos:</span>
              <strong>${zone.highCount}</strong>
              <span style="color: #ca8a04;">Medios:</span>
              <strong>${zone.mediumCount}</strong>
              <span style="color: #16a34a;">Bajos:</span>
              <strong>${zone.lowCount}</strong>
            </div>
          </div>
        `);
      });

      // Fit bounds if there are zones
      if (zones.length > 0) {
        const bounds = L.latLngBounds(zones.map((z) => [z.lat, z.lng]));
        map.fitBounds(bounds, { padding: [50, 50] });
      }
    });

    return () => {
      mounted = false;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [zones]);

  return (
    <div className={`relative rounded-xl overflow-hidden border border-border-default ${className}`}>
      <div ref={mapRef} className="h-full w-full" style={{ minHeight: '500px' }} />
    </div>
  );
}

function getIntensityColor(intensity: number): string {
  if (intensity >= 8) return '#dc2626'; // red-600
  if (intensity >= 6) return '#ea580c'; // orange-600
  if (intensity >= 4) return '#ca8a04'; // yellow-600
  if (intensity >= 2) return '#16a34a'; // green-600
  return '#22c55e'; // green-500
}
