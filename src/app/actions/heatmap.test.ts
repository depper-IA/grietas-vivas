/**
 * Tests for the getHeatmapData Server Action.
 *
 * These are privacy invariants, not cosmetics: the action reads every
 * user's GPS via service role, and a report can mark a home as unsafe.
 *
 * Validates:
 * - Public access: anonymous callers are served (this backs the public map)
 * - k-anonymity: sparse cells are suppressed entirely
 * - De-identification: emitted coordinates are cell centers, never a
 *   report's real position, and are stable across repeated calls
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSelect } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
}));

vi.mock('@/lib/db/supabase', () => ({
  createServiceRoleClient: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        not: vi.fn().mockReturnValue({
          not: mockSelect,
        }),
      }),
    }),
  }),
}));

import { getHeatmapData } from './heatmap';

/** Build n reports inside the same ~111m cell, at slightly different spots. */
function reportsInCell(n: number, risk = 'critical') {
  return Array.from({ length: n }, (_, i) => ({
    // All of these round to 4.651 / -74.062 at 3 decimals.
    gps_latitude: 4.65104 + i * 0.00001,
    gps_longitude: -74.06196 - i * 0.00001,
    risk_level: risk,
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getHeatmapData — public access', () => {
  it('serves anonymous callers, since it backs the public map', async () => {
    mockSelect.mockResolvedValue({ data: reportsInCell(10), error: null });

    const result = await getHeatmapData();

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
  });
});

describe('getHeatmapData — k-anonymity', () => {
  it('suppresses a cell holding a single report', async () => {
    mockSelect.mockResolvedValue({ data: reportsInCell(1), error: null });

    const result = await getHeatmapData();

    expect(result.success).toBe(true);
    expect(result.data).toEqual([]);
  });

  it('suppresses cells below the threshold and keeps those at or above it', async () => {
    mockSelect.mockResolvedValue({
      data: [
        ...reportsInCell(5),
        // A lone report far away — must not surface as its own zone.
        { gps_latitude: 10.5, gps_longitude: -20.25, risk_level: 'critical' },
      ],
      error: null,
    });

    const result = await getHeatmapData();

    expect(result.data).toHaveLength(1);
    expect(result.data?.[0].reportCount).toBe(5);
  });

  it('counts reports with an unknown risk level toward the threshold', async () => {
    mockSelect.mockResolvedValue({
      data: [...reportsInCell(4), ...reportsInCell(1, 'unclassified')],
      error: null,
    });

    const result = await getHeatmapData();

    // 5 people are in this cell even though one is unclassified.
    expect(result.data).toHaveLength(1);
    expect(result.data?.[0].reportCount).toBe(5);
  });
});

describe('getHeatmapData — de-identification', () => {
  it('emits the cell center', async () => {
    mockSelect.mockResolvedValue({ data: reportsInCell(6), error: null });

    const result = await getHeatmapData();

    expect(result.data?.[0].lat).toBe(4.651);
    expect(result.data?.[0].lng).toBe(-74.062);
  });

  it('emits the same coordinates however the reports are placed inside the cell', async () => {
    // Same cell, but every report sits somewhere else within it. If the
    // output moved with them, it would be leaking real positions.
    mockSelect.mockResolvedValue({ data: reportsInCell(6), error: null });
    const spread = await getHeatmapData();

    mockSelect.mockResolvedValue({
      data: Array.from({ length: 6 }, () => ({
        gps_latitude: 4.65149,
        gps_longitude: -74.06249,
        risk_level: 'critical',
      })),
      error: null,
    });
    const clustered = await getHeatmapData();

    expect(clustered.data?.[0].lat).toBe(spread.data?.[0].lat);
    expect(clustered.data?.[0].lng).toBe(spread.data?.[0].lng);
  });

  it('returns identical coordinates across calls so averaging cannot recover the source', async () => {
    mockSelect.mockResolvedValue({ data: reportsInCell(6), error: null });

    const first = await getHeatmapData();
    const second = await getHeatmapData();
    const third = await getHeatmapData();

    expect(first.data?.[0].lat).toBe(second.data?.[0].lat);
    expect(second.data?.[0].lat).toBe(third.data?.[0].lat);
    expect(first.data?.[0].lng).toBe(second.data?.[0].lng);
    expect(second.data?.[0].lng).toBe(third.data?.[0].lng);
  });
});
