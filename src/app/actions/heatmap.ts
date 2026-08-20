'use server';

/**
 * Server Action — Heatmap Data
 *
 * Retrieves aggregated report data for the heatmap. Uses service role to
 * read across users, so every coordinate it emits must be de-identified
 * before leaving this module.
 *
 * Privacy model (GPS here is effectively a home address, and a report can
 * mark that home as structurally critical):
 *
 *   1. Coordinates are snapped to the CENTER of their geohash cell
 *      (3 decimals, ~111m), never derived from any single report's real
 *      position. Random per-request jitter was rejected: it is re-rolled
 *      on every call and this action can be called repeatedly, so
 *      averaging N responses converges on the true coordinate.
 *   2. Cells with fewer than MIN_REPORTS_PER_ZONE reports are dropped
 *      (k-anonymity). A cell of size 1 would otherwise publish one
 *      household's location, and `reportCount` would flag exactly which
 *      zones those are.
 * The action is deliberately reachable anonymously (it backs the public
 * map), which is exactly why 1 and 2 are enforced here rather than left to
 * the caller.
 */

import { createServiceRoleClient } from '@/lib/db/supabase';

/**
 * Minimum reports per cell before a zone is publishable (k-anonymity).
 * Below this, the aggregate is too close to an individual disclosure.
 */
const MIN_REPORTS_PER_ZONE = 5;

/** Geohash precision in decimal places (~111m per cell). */
const GEOHASH_DECIMALS = 3;

export type HeatmapZone = {
  barrio: string;
  lat: number;
  lng: number;
  intensity: number;
  reportCount: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
};

/**
 * Calculate the geohash cell key (~111m precision) used for grouping.
 */
function toGeohash(lat: number, lng: number): string {
  return `${lat.toFixed(GEOHASH_DECIMALS)},${lng.toFixed(GEOHASH_DECIMALS)}`;
}

/**
 * Resolve a geohash cell key back to its center coordinate.
 *
 * This is what gets published, so the output depends only on the cell —
 * never on where inside the cell any individual report actually was.
 */
function geohashToCenter(geohash: string): { lat: number; lng: number } {
  // `toFixed` rounds to nearest rather than truncating, so every value in a
  // cell already rounds to that cell's midpoint — the key IS the center.
  const [latPart, lngPart] = geohash.split(',');
  return { lat: Number(latPart), lng: Number(lngPart) };
}

/**
 * Calculate intensity from risk counts.
 * Formula: min(10, round((criticalCount*5 + highCount*3 + mediumCount*1 + lowCount*1) / 10))
 */
function calculateIntensity(
  criticalCount: number,
  highCount: number,
  mediumCount: number,
  lowCount: number,
): number {
  const raw = (criticalCount * 5 + highCount * 3 + mediumCount * 1 + lowCount * 1) / 10;
  return Math.min(10, Math.round(raw));
}

/**
 * Get heatmap data for all reports with GPS coordinates.
 *
 * Intentionally callable without a session: this backs the public map.
 * That is only safe because every zone it returns is an aggregate of at
 * least MIN_REPORTS_PER_ZONE reports positioned at its cell center — no
 * output traces back to an individual report.
 */
export async function getHeatmapData(): Promise<{
  success: boolean;
  data?: HeatmapZone[];
  error?: { code: string; message: string };
}> {
  try {
    const supabase = createServiceRoleClient();

    const { data: reports, error: fetchError } = await supabase
      .from('reports')
      .select('gps_latitude, gps_longitude, risk_level')
      .not('gps_latitude', 'is', null)
      .not('gps_longitude', 'is', null);

    if (fetchError) {
      return {
        success: false,
        error: {
          code: 'FETCH_ERROR',
          message: 'No fue posible obtener los datos para el mapa de calor.',
        },
      };
    }

    // Raw coordinates are deliberately NOT accumulated here — a zone's
    // position is derived from its cell key alone, so no individual
    // report's real position can survive into the response.
    const groups = new Map<
      string,
      {
        reportCount: number;
        criticalCount: number;
        highCount: number;
        mediumCount: number;
        lowCount: number;
      }
    >();

    for (const report of reports ?? []) {
      const lat = report.gps_latitude;
      const lng = report.gps_longitude;
      const risk = report.risk_level;

      if (lat === null || lng === null) continue;

      const geohash = toGeohash(lat, lng);
      let group = groups.get(geohash);

      if (!group) {
        group = {
          reportCount: 0,
          criticalCount: 0,
          highCount: 0,
          mediumCount: 0,
          lowCount: 0,
        };
        groups.set(geohash, group);
      }

      // Counted regardless of risk level: an unclassified report is still a
      // person in this cell, so it must count toward the k-anonymity floor.
      group.reportCount++;

      switch (risk) {
        case 'critical':
          group.criticalCount++;
          break;
        case 'high':
          group.highCount++;
          break;
        case 'medium':
          group.mediumCount++;
          break;
        case 'low':
          group.lowCount++;
          break;
      }
    }

    const zones: HeatmapZone[] = [];

    for (const [geohash, group] of groups) {
      // k-anonymity: a cell this sparse describes individuals, not an area.
      if (group.reportCount < MIN_REPORTS_PER_ZONE) continue;

      const center = geohashToCenter(geohash);

      zones.push({
        barrio: `Zona ${zones.length + 1}`,
        lat: center.lat,
        lng: center.lng,
        intensity: calculateIntensity(
          group.criticalCount,
          group.highCount,
          group.mediumCount,
          group.lowCount,
        ),
        reportCount: group.reportCount,
        criticalCount: group.criticalCount,
        highCount: group.highCount,
        mediumCount: group.mediumCount,
        lowCount: group.lowCount,
      });
    }

    return { success: true, data: zones };
  } catch {
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Ocurrio un error al procesar los datos del mapa de calor.',
      },
    };
  }
}
