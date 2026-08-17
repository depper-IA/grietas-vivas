/**
 * Device Orientation Module
 *
 * Samples a reading from the DeviceOrientation API within a 500ms window.
 * Used to document the physical angle of the camera at capture time.
 */

import type { CaptureMetadata } from './types';

type OrientationData = CaptureMetadata['orientation'];

/** Maximum time (ms) to wait for an orientation reading. */
const SAMPLING_WINDOW_MS = 500;

/**
 * Get the current device orientation from the DeviceOrientation API.
 *
 * Samples one reading within a 500ms window. If the API is unavailable
 * or no reading is received within the window, returns a fallback
 * object with `available: false`.
 */
export async function getDeviceOrientation(): Promise<OrientationData> {
  if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) {
    return {
      alpha: null,
      beta: null,
      gamma: null,
      available: false,
    };
  }

  return new Promise<OrientationData>((resolve) => {
    let resolved = false;

    const handler = (event: DeviceOrientationEvent) => {
      if (resolved) return;
      resolved = true;
      window.removeEventListener('deviceorientation', handler);

      resolve({
        alpha: event.alpha ?? null,
        beta: event.beta ?? null,
        gamma: event.gamma ?? null,
        available: true,
      });
    };

    window.addEventListener('deviceorientation', handler);

    // Timeout after sampling window — API may be unavailable or no event fires
    setTimeout(() => {
      if (resolved) return;
      resolved = true;
      window.removeEventListener('deviceorientation', handler);

      resolve({
        alpha: null,
        beta: null,
        gamma: null,
        available: false,
      });
    }, SAMPLING_WINDOW_MS);
  });
}
