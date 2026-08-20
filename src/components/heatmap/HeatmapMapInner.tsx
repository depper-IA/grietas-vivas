'use client';

/**
 * HeatmapMapInner — Implementacion del mapa Leaflet.
 *
 * Este componente se carga dinamicamente para evitar problemas con SSR.
 */

import { useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import type { HeatmapZone } from '@/app/actions/heatmap';
import 'leaflet/dist/leaflet.css';

interface HeatmapMapInnerProps {
  zones: HeatmapZone[];
  className?: string;
}

function getColor(intensity: number): string {
  if (intensity <= 2) return '#10b981';
  if (intensity <= 5) return '#eab308';
  if (intensity <= 8) return '#f97316';
  return '#dc2626';
}

function getRadius(intensity: number): number {
  return 100 + intensity * 50;
}

function MapController({ zones }: { zones: HeatmapZone[] }) {
  const map = useMap();

  useEffect(() => {
    if (zones.length > 0) {
      const bounds = zones.map((z) => [z.lat, z.lng] as [number, number]);
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [map, zones]);

  return null;
}

export function HeatmapMapInner({ zones, className = '' }: HeatmapMapInnerProps) {
  const defaultCenter: [number, number] = [4.711, -74.0721];

  return (
    <div className={`rounded-xl overflow-hidden border border-border-default ${className}`}>
      <MapContainer
        center={defaultCenter}
        zoom={12}
        style={{ height: '100%', minHeight: '400px', width: '100%' }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapController zones={zones} />
        {zones.map((zone, index) => (
          <CircleMarker
            key={`${zone.lat}-${zone.lng}-${index}`}
            center={[zone.lat, zone.lng]}
            radius={getRadius(zone.intensity) / 10}
            pathOptions={{
              color: getColor(zone.intensity),
              fillColor: getColor(zone.intensity),
              fillOpacity: 0.6,
              weight: 2,
            }}
          >
            <Popup>
              <div className="text-sm min-w-[150px]">
                <h3 className="font-bold text-text-primary mb-2">{zone.barrio}</h3>
                <div className="space-y-1 text-xs text-text-secondary">
                  <p>Reportes: <span className="font-semibold">{zone.reportCount}</span></p>
                  <p>Intensidad: <span className="font-semibold">{zone.intensity}/10</span></p>
                  <div className="border-t border-border-default my-1 pt-1 space-y-0.5">
                    <p>Criticos: <span className="font-semibold text-status-critical">{zone.criticalCount}</span></p>
                    <p>Altos: <span className="font-semibold text-orange-500">{zone.highCount}</span></p>
                    <p>Medios: <span className="font-semibold text-yellow-500">{zone.mediumCount}</span></p>
                    <p>Bajos: <span className="font-semibold text-emerald-500">{zone.lowCount}</span></p>
                  </div>
                </div>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
