/**
 * Tests for the canonical ReportManifest builder.
 *
 * The manifest is the byte-exact payload that gets hashed for the
 * integrity_hash column. Stable key order is critical: any two builds
 * with the same logical inputs must produce identical SHA-256 hashes.
 */

import { describe, it, expect } from 'vitest';
import { buildManifest } from './types';

const baseMetadata = {
  id: 'cap-001',
  timestamp: { local: '2026-01-01T00:00:00Z', server: '2026-01-01T00:00:01Z', verified: true },
  gps: { latitude: 4.6, longitude: -74.08, accuracy: 10, available: true, reliable: true },
  orientation: { alpha: 0, beta: 0, gamma: 0, available: true },
  deviceInfo: { userAgent: 'test', platform: 'web' },
};

const baseAnalysis = {
  riskLevel: 'high' as const,
  description: 'Test',
  confidence: 0.85,
  provider: 'nvidia-nim',
  analyzedAt: '2026-01-01T00:00:02Z',
};

const baseInput = {
  captureId: 'cap-001',
  userId: 'user-001',
  imageStoragePath: 'user-001/cap-001.jpg',
  metadata: baseMetadata,
  analysis: baseAnalysis,
};

describe('buildManifest', () => {
  it('incluye todos los campos requeridos en orden canonico', () => {
    const manifest = buildManifest(baseInput, '2026-01-01T00:00:03Z', 'user-001/r-001.pdf');

    expect(manifest.captureId).toBe('cap-001');
    expect(manifest.userId).toBe('user-001');
    expect(manifest.metadata).toEqual(baseMetadata);
    expect(manifest.analysis).toEqual(baseAnalysis);
    expect(manifest.generatedAt).toBe('2026-01-01T00:00:03Z');
    expect(manifest.pdfStoragePath).toBe('user-001/r-001.pdf');
  });

  it('produce JSON byte-exact reproducible para los mismos inputs', () => {
    const m1 = buildManifest(baseInput, '2026-01-01T00:00:03Z', 'user-001/r-001.pdf');
    const m2 = buildManifest(baseInput, '2026-01-01T00:00:03Z', 'user-001/r-001.pdf');

    const json1 = JSON.stringify(m1);
    const json2 = JSON.stringify(m2);

    expect(json1).toBe(json2);
    expect(json1.length).toBeGreaterThan(0);
  });

  it('produce JSON distintos para timestamps distintos', () => {
    const m1 = buildManifest(baseInput, '2026-01-01T00:00:03Z', 'p.pdf');
    const m2 = buildManifest(baseInput, '2026-01-01T00:00:04Z', 'p.pdf');

    expect(JSON.stringify(m1)).not.toBe(JSON.stringify(m2));
  });

  it('produce JSON distintos para pdfStoragePath distintos', () => {
    const m1 = buildManifest(baseInput, '2026-01-01T00:00:03Z', 'a.pdf');
    const m2 = buildManifest(baseInput, '2026-01-01T00:00:03Z', 'b.pdf');

    expect(JSON.stringify(m1)).not.toBe(JSON.stringify(m2));
  });

  it('NO incluye campos extra fuera de la whitelist canonica', () => {
    const m = buildManifest(baseInput, '2026-01-01T00:00:03Z', 'p.pdf') as Record<string, unknown>;
    const keys = Object.keys(m).sort();
    expect(keys).toEqual([
      'analysis',
      'captureId',
      'generatedAt',
      'metadata',
      'pdfStoragePath',
      'userId',
    ]);
  });
});
