/**
 * Photo Capture Module — Core Type Definitions
 *
 * Types for orchestrating image capture with sensor metadata
 * (GPS, device orientation, timestamps) for legal evidence purposes.
 */

/** Metadata collected at the moment of photo capture. */
export interface CaptureMetadata {
  /** UUID v4 generated client-side */
  id: string;

  /** Timestamp information for legal validity */
  timestamp: {
    /** ISO 8601 local device timestamp */
    local: string;
    /** ISO 8601 server-certified timestamp, null if pending */
    server: string | null;
    /** Whether the timestamp has been server-verified */
    verified: boolean;
  };

  /** GPS geolocation data */
  gps: {
    /** Latitude with minimum 6 decimal places precision */
    latitude: number | null;
    /** Longitude with minimum 6 decimal places precision */
    longitude: number | null;
    /** Horizontal accuracy in meters */
    accuracy: number | null;
    /** Whether the Geolocation API is available */
    available: boolean;
    /** True if accuracy <= 50m */
    reliable: boolean;
  };

  /** Device orientation from DeviceOrientation API */
  orientation: {
    /** Compass direction 0-360 degrees */
    alpha: number | null;
    /** Front-back tilt -180 to 180 degrees */
    beta: number | null;
    /** Left-right tilt -90 to 90 degrees */
    gamma: number | null;
    /** Whether the DeviceOrientation API is available */
    available: boolean;
  };

  /** Device information for audit trail */
  deviceInfo: {
    userAgent: string;
    platform: string;
  };
}

/** Result of a photo capture operation. */
export interface CaptureResult {
  /** UUID v4 matching the metadata id */
  id: string;
  /** Raw image blob (max 10MB) */
  imageBlob: Blob;
  /** All sensor metadata collected at capture time */
  metadata: CaptureMetadata;
  /** Synchronization status */
  status: 'pending_sync' | 'synced' | 'failed';
  /** Number of sync retry attempts */
  retryCount: number;
  /** ISO 8601 creation timestamp */
  createdAt: string;
}
