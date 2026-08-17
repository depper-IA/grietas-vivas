/**
 * GPS Module — Geolocation Capture
 *
 * Reads device GPS position via the Geolocation API and returns
 * structured metadata for legal evidence purposes.
 * Precision rules: accuracy <= 50m → reliable; > 50m → unreliable.
 */

import type { CaptureMetadata } from './types';

type GpsData = CaptureMetadata['gps'];

/** Minimum number of decimal places required for coordinate storage. */
const MIN_DECIMAL_PLACES = 6;

/**
 * Ensures a coordinate value has at least 6 decimal places of precision.
 * This preserves sub-meter accuracy for legal documentation purposes.
 */
function ensurePrecision(value: number): number {
  const factor = Math.pow(10, MIN_DECIMAL_PLACES);
  return Math.round(value * factor) / factor;
}

/**
 * Get the current GPS position from the device.
 *
 * Returns structured GPS data with reliability assessment.
 * If the Geolocation API is unavailable or permission is denied,
 * returns a fallback object with `available: false`.
 */
export async function getCurrentPosition(): Promise<GpsData> {
  if (!navigator.geolocation) {
    return {
      latitude: null,
      longitude: null,
      accuracy: null,
      available: false,
      reliable: false,
    };
  }

  try {
    const position = await new Promise<GeolocationPosition>(
      (resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        });
      }
    );

    const { latitude, longitude, accuracy } = position.coords;
    const reliable = accuracy <= 50;

    return {
      latitude: ensurePrecision(latitude),
      longitude: ensurePrecision(longitude),
      accuracy,
      available: true,
      reliable,
    };
  } catch {
    return {
      latitude: null,
      longitude: null,
      accuracy: null,
      available: false,
      reliable: false,
    };
  }
}
