/**
 * Tests for the report Server Actions.
 *
 * Focus: input validation on the actions that write user-authored content,
 * because `calibrateReport` feeds the shared RAG calibration bank whose
 * contents are injected into OTHER users' analysis prompts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockGetUser,
  mockIndexCalibration,
  mockUpdate,
  mockSingle,
  mockDownload,
  mockRunFallbackAnalysis,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockIndexCalibration: vi.fn(),
  mockUpdate: vi.fn(),
  mockSingle: vi.fn(),
  mockDownload: vi.fn(),
  mockRunFallbackAnalysis: vi.fn(),
}));

vi.mock('@/lib/ai/rag', () => ({
  indexCalibration: mockIndexCalibration,
}));

vi.mock('@/lib/ai/fallbackAnalysis', () => ({
  runFallbackAnalysis: mockRunFallbackAnalysis,
  NoProvidersConfiguredError: class NoProvidersConfiguredError extends Error {},
}));

vi.mock('@/lib/db/supabase', () => {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.update = vi.fn((values: unknown) => {
    mockUpdate(values);
    return chain;
  });
  chain.eq = vi.fn(() => chain);
  chain.single = vi.fn(() => mockSingle());
  // Terminal await on the update chain resolves here.
  chain.then = (resolve: (v: { error: null }) => unknown) =>
    Promise.resolve({ error: null }).then(resolve);

  return {
    createServerSupabaseClient: vi.fn().mockResolvedValue({
      auth: { getUser: mockGetUser },
      from: vi.fn(() => chain),
      storage: {
        from: vi.fn(() => ({ download: mockDownload })),
      },
    }),
  };
});

import { calibrateReport, reanalyzeReport } from './report';
import { _resetRateLimitStore } from '@/lib/security/rateLimit';

describe('calibrateReport', () => {
  const validInput = {
    reportId: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
    isAccurate: false,
    verifiedRiskLevel: 'critical',
    verifiedPattern: 'diagonal_shear',
    notes: 'La grieta atraviesa la columna de lado a lado.',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });
    mockSingle.mockResolvedValue({
      data: { id: validInput.reportId, sensor_metadata: {} },
      error: null,
    });
    mockIndexCalibration.mockResolvedValue({ indexed: true });
  });

  describe('happy path', () => {
    it('accepts a well-formed calibration and indexes it', async () => {
      const result = await calibrateReport(validInput);

      expect(result.success).toBe(true);
      expect(mockIndexCalibration).toHaveBeenCalledWith(
        expect.objectContaining({
          reportId: validInput.reportId,
          userId: 'user-123',
          riskLevel: 'critical',
          pattern: 'diagonal_shear',
        }),
      );
    });
  });

  describe('input validation', () => {
    it('rejects notes longer than the allowed limit', async () => {
      const result = await calibrateReport({
        ...validInput,
        notes: 'A'.repeat(501),
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('VALIDATION_ERROR');
    });

    it('rejects a risk level outside the canonical enum', async () => {
      const result = await calibrateReport({
        ...validInput,
        verifiedRiskLevel: 'catastrophic',
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('VALIDATION_ERROR');
    });

    it('rejects a pattern outside the crack taxonomy', async () => {
      const result = await calibrateReport({
        ...validInput,
        verifiedPattern: 'not_a_real_pattern',
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('VALIDATION_ERROR');
    });

    it('rejects a reportId that is not a UUID', async () => {
      const result = await calibrateReport({
        ...validInput,
        reportId: 'not-a-uuid',
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('RAG bank integrity', () => {
    it('never indexes content that failed validation', async () => {
      // The bank is shared: rejected input must not reach other users' prompts.
      await calibrateReport({ ...validInput, notes: 'A'.repeat(5000) });

      expect(mockIndexCalibration).not.toHaveBeenCalled();
    });

    it('never writes to the report when validation fails', async () => {
      await calibrateReport({ ...validInput, verifiedRiskLevel: 'bogus' });

      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('validates before touching the database', async () => {
      // An unauthenticated caller with invalid input must not be told which
      // field was wrong — authorization is still the first gate.
      mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

      const result = await calibrateReport({ ...validInput, notes: 'A'.repeat(5000) });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('UNAUTHORIZED');
    });
  });
});

describe('reanalyzeReport', () => {
  const reportId = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';

  /** What the server's own AI call returns — the only admissible source. */
  const serverAiResult = {
    riskLevel: 'critical' as const,
    description: 'Fisura por cortante que compromete la columna.',
    confidence: 0.91,
    provider: 'nvidia-nim',
    analyzedAt: '2026-08-20T00:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    _resetRateLimitStore();
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });
    mockSingle.mockResolvedValue({
      data: {
        id: reportId,
        image_storage_path: 'user-123/capture.jpg',
        sensor_metadata: {},
      },
      error: null,
    });
    mockDownload.mockResolvedValue({
      data: new Blob(['image-bytes'], { type: 'image/jpeg' }),
      error: null,
    });
    mockRunFallbackAnalysis.mockResolvedValue(serverAiResult);
  });

  it('rejects unauthenticated callers', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const result = await reanalyzeReport({ reportId });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('UNAUTHORIZED');
  });

  it('never runs an AI analysis for unauthenticated callers', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    await reanalyzeReport({ reportId });

    expect(mockRunFallbackAnalysis).not.toHaveBeenCalled();
  });

  it('persists the analysis produced by the server, not any client input', async () => {
    // The integrity property: the caller supplies only a report id, so the
    // stored analysis provably originates from the server's own AI call.
    const result = await reanalyzeReport({ reportId });

    expect(result.success).toBe(true);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        risk_level: serverAiResult.riskLevel,
        analysis_text: serverAiResult.description,
        analysis_confidence: serverAiResult.confidence,
        analysis_provider: serverAiResult.provider,
      }),
    );
  });

  it('reads the image from storage rather than trusting the caller', async () => {
    await reanalyzeReport({ reportId });

    expect(mockDownload).toHaveBeenCalledWith('user-123/capture.jpg');
  });

  it('fails cleanly when the report has no stored image', async () => {
    mockSingle.mockResolvedValue({
      data: { id: reportId, image_storage_path: null, sensor_metadata: {} },
      error: null,
    });

    const result = await reanalyzeReport({ reportId });

    expect(result.success).toBe(false);
    expect(mockRunFallbackAnalysis).not.toHaveBeenCalled();
  });

  it('rejects a reportId that is not a UUID', async () => {
    const result = await reanalyzeReport({ reportId: 'not-a-uuid' });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('VALIDATION_ERROR');
  });
});
