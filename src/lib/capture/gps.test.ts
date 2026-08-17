/**
 * Property-Based Test — GPS Metadata Integrity
 *
 * **Validates: Requirements 2.1, 2.5**
 *
 * Property 3: GPS Metadata Integrity
 * For any GPS reading with reported horizontal accuracy:
 *   a. accuracy <= 50m → reliable MUST be true
 *   b. accuracy > 50m → reliable MUST be false
 *   c. GPS unavailable → reliable MUST be false AND available MUST be false
 *   d. Stored coordinates must have at least 6 decimal places of precision
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import { getCurrentPosition } from './gps';

// Helper to mock the Geolocation API
function mockGeolocation(
  position: { latitude: number; longitude: number; accuracy: number }
) {
  Object.defineProperty(navigator, 'geolocation', {
    value: {
      getCurrentPosition: (
        success: PositionCallback
      ) => {
        success({
          coords: {
            latitude: position.latitude,
            longitude: position.longitude,
            accuracy: position.accuracy,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
          },
          timestamp: Date.now(),
        } as GeolocationPosition);
      },
    },
    writable: true,
    configurable: true,
  });
}

function mockGeolocationError(code: number = 1) {
  Object.defineProperty(navigator, 'geolocation', {
    value: {
      getCurrentPosition: (
        _success: PositionCallback,
        error: PositionErrorCallback
      ) => {
        error({
          code,
          message: 'Position unavailable',
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
        } as GeolocationPositionError);
      },
    },
    writable: true,
    configurable: true,
  });
}

function mockGeolocationUnavailable() {
  Object.defineProperty(navigator, 'geolocation', {
    value: undefined,
    writable: true,
    configurable: true,
  });
}

describe('Property 3: GPS Metadata Integrity', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('accuracy <= 50m → reliable MUST be true', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.double({ min: -90, max: 90, noNaN: true }),
        fc.double({ min: -180, max: 180, noNaN: true }),
        fc.double({ min: 0.001, max: 50, noNaN: true }),
        async (latitude, longitude, accuracy) => {
          mockGeolocation({ latitude, longitude, accuracy });

          const result = await getCurrentPosition();

          expect(result.reliable).toBe(true);
          expect(result.available).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('accuracy > 50m → reliable MUST be false', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.double({ min: -90, max: 90, noNaN: true }),
        fc.double({ min: -180, max: 180, noNaN: true }),
        fc.double({ min: 50.001, max: 10000, noNaN: true }),
        async (latitude, longitude, accuracy) => {
          mockGeolocation({ latitude, longitude, accuracy });

          const result = await getCurrentPosition();

          expect(result.reliable).toBe(false);
          expect(result.available).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('GPS unavailable → reliable MUST be false AND available MUST be false', async () => {
    // Test with geolocation API completely unavailable
    mockGeolocationUnavailable();
    const resultNoApi = await getCurrentPosition();

    expect(resultNoApi.reliable).toBe(false);
    expect(resultNoApi.available).toBe(false);
    expect(resultNoApi.latitude).toBeNull();
    expect(resultNoApi.longitude).toBeNull();
    expect(resultNoApi.accuracy).toBeNull();

    // Test with geolocation error (permission denied, timeout, etc.)
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(1, 2, 3), // PERMISSION_DENIED, POSITION_UNAVAILABLE, TIMEOUT
        async (errorCode) => {
          mockGeolocationError(errorCode);

          const result = await getCurrentPosition();

          expect(result.reliable).toBe(false);
          expect(result.available).toBe(false);
          expect(result.latitude).toBeNull();
          expect(result.longitude).toBeNull();
          expect(result.accuracy).toBeNull();
        }
      ),
      { numRuns: 10 }
    );
  });

  it('stored coordinates must have at least 6 decimal places of precision', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.double({ min: -90, max: 90, noNaN: true }),
        fc.double({ min: -180, max: 180, noNaN: true }),
        fc.double({ min: 0.001, max: 50, noNaN: true }),
        async (latitude, longitude, accuracy) => {
          mockGeolocation({ latitude, longitude, accuracy });

          const result = await getCurrentPosition();

          // Verify coordinates are stored (not null for available GPS)
          expect(result.latitude).not.toBeNull();
          expect(result.longitude).not.toBeNull();

          // Verify precision: the stored value, when converted to string,
          // should not lose precision beyond 6 decimal places.
          // The ensurePrecision function guarantees rounding to 6 places.
          const latStr = result.latitude!.toString();
          const lonStr = result.longitude!.toString();

          // The value after rounding should be within 0.000001 of original
          const precisionFactor = 1e6;
          expect(result.latitude).toBe(
            Math.round(latitude * precisionFactor) / precisionFactor
          );
          expect(result.longitude).toBe(
            Math.round(longitude * precisionFactor) / precisionFactor
          );

          // Verify numerical precision is maintained (no floating point drift beyond 6 decimals)
          const latDiff = Math.abs(result.latitude! - latitude);
          const lonDiff = Math.abs(result.longitude! - longitude);
          expect(latDiff).toBeLessThanOrEqual(0.0000005);
          expect(lonDiff).toBeLessThanOrEqual(0.0000005);
        }
      ),
      { numRuns: 100 }
    );
  });
});
