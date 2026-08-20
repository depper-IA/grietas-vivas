/**
 * Tests for the analyzeWithFallback Server Action.
 *
 * Validates:
 * - Authorization: only authenticated callers may consume server-managed AI keys
 * - Successful analysis flow with mocked providers
 * - Input validation (empty image, oversized image)
 * - Error handling when all providers fail
 * - Environment variable access for fallback keys
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use vi.hoisted to ensure mock functions are available at factory time
const { mockAnalyze, mockRegisterProvider, mockGetUser } = vi.hoisted(() => ({
  mockAnalyze: vi.fn(),
  mockRegisterProvider: vi.fn(),
  mockGetUser: vi.fn(),
}));

// Mock the Supabase server client (the action authenticates before doing work)
vi.mock('@/lib/db/supabase', () => ({
  createServerSupabaseClient: vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
  }),
}));

// Mock the provider modules
vi.mock('@/lib/ai/providers/openrouter', () => ({
  OpenRouterProvider: vi.fn().mockImplementation((apiKey: string) => ({
    name: 'openrouter',
    apiKey,
    analyze: vi.fn(),
    isAvailable: vi.fn().mockResolvedValue(true),
  })),
}));

vi.mock('@/lib/ai/providers/nvidia-nim', () => ({
  NVIDIANIMProvider: vi.fn().mockImplementation((apiKey: string) => ({
    name: 'nvidia-nim',
    apiKey,
    analyze: vi.fn(),
    isAvailable: vi.fn().mockResolvedValue(true),
  })),
}));

// Mock the AIServiceAdapter
vi.mock('@/lib/ai/aiService', () => ({
  AIServiceAdapter: vi.fn().mockImplementation(() => ({
    analyze: mockAnalyze,
    registerProvider: mockRegisterProvider,
    getAvailableProviders: vi.fn().mockReturnValue([]),
  })),
  AIServiceError: class AIServiceError extends Error {
    public safeResponse: { error: { code: string; message: string } };
    constructor(code: string, message: string) {
      super(message);
      this.name = 'AIServiceError';
      this.safeResponse = { error: { code, message } };
    }
  },
}));

import { analyzeWithFallback } from './analysis';

describe('analyzeWithFallback', () => {
  const validBase64Image = Buffer.from('fake-image-data').toString('base64');

  beforeEach(() => {
    vi.clearAllMocks();
    // Default to an authenticated caller; authorization tests override this.
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });
    // Set env vars for testing
    process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
    process.env.NVIDIA_NIM_API_KEY = 'test-nvidia-key';
  });

  afterEach(() => {
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.NVIDIA_NIM_API_KEY;
  });

  describe('authorization', () => {
    it('rejects unauthenticated callers with UNAUTHORIZED', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

      const result = await analyzeWithFallback({
        imageBase64: validBase64Image,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.error.code).toBe('UNAUTHORIZED');
      }
    });

    it('rejects callers whose session lookup errors', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: new Error('invalid JWT'),
      });

      const result = await analyzeWithFallback({
        imageBase64: validBase64Image,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.error.code).toBe('UNAUTHORIZED');
      }
    });

    it('never consumes server-managed AI keys for unauthenticated callers', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

      await analyzeWithFallback({ imageBase64: validBase64Image });

      // The whole point of the check: no provider is instantiated and no
      // upstream request is made, so the owner's API keys are never spent.
      expect(mockRegisterProvider).not.toHaveBeenCalled();
      expect(mockAnalyze).not.toHaveBeenCalled();
    });

    it('authenticates before validating input', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

      // Invalid input from an anonymous caller must still report UNAUTHORIZED,
      // so the action never doubles as an unauthenticated validation oracle.
      const result = await analyzeWithFallback({ imageBase64: '' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.error.code).toBe('UNAUTHORIZED');
      }
    });
  });

  describe('successful analysis flow', () => {
    it('returns analysis result on success', async () => {
      const expectedResult = {
        riskLevel: 'high' as const,
        description: 'Significant structural crack detected',
        confidence: 0.85,
        provider: 'openrouter',
        analyzedAt: '2024-01-15T10:00:00.000Z',
      };

      mockAnalyze.mockResolvedValue(expectedResult);

      const result = await analyzeWithFallback({
        imageBase64: validBase64Image,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(expectedResult);
      }
    });

    it('registers both providers when both keys are available', async () => {
      mockAnalyze.mockResolvedValue({
        riskLevel: 'low',
        description: 'Minor surface crack',
        confidence: 0.9,
        provider: 'openrouter',
        analyzedAt: '2024-01-15T10:00:00.000Z',
      });

      await analyzeWithFallback({ imageBase64: validBase64Image });

      expect(mockRegisterProvider).toHaveBeenCalledTimes(2);
    });

    it('registers only openrouter when nvidia key is missing', async () => {
      delete process.env.NVIDIA_NIM_API_KEY;
      mockAnalyze.mockResolvedValue({
        riskLevel: 'low',
        description: 'Minor crack',
        confidence: 0.7,
        provider: 'openrouter',
        analyzedAt: '2024-01-15T10:00:00.000Z',
      });

      await analyzeWithFallback({ imageBase64: validBase64Image });

      expect(mockRegisterProvider).toHaveBeenCalledTimes(1);
    });

    it('calls adapter.analyze with fallback config and options', async () => {
      mockAnalyze.mockResolvedValue({
        riskLevel: 'medium',
        description: 'Moderate crack',
        confidence: 0.75,
        provider: 'openrouter',
        analyzedAt: '2024-01-15T10:00:00.000Z',
      });

      await analyzeWithFallback({ imageBase64: validBase64Image });

      expect(mockAnalyze).toHaveBeenCalledWith(
        expect.any(Blob),
        expect.objectContaining({
          mode: 'fallback',
          fallbackPriority: ['nvidia-nim', 'openrouter'],
        }),
        expect.objectContaining({
          contextImage: undefined,
          structuralContext: undefined,
        }),
      );
    });

    it('passes contextImage and structuralContext when provided', async () => {
      mockAnalyze.mockResolvedValue({
        riskLevel: 'critical',
        description: 'Critical crack on column',
        confidence: 0.9,
        provider: 'openrouter',
        analyzedAt: '2024-01-15T10:00:00.000Z',
      });

      const structuralContext = {
        elementType: 'column' as const,
        crossesFullSpan: true,
        hasScaleReference: true,
        scaleReferenceType: 'coin' as const,
        recentGrowth: true,
      };

      await analyzeWithFallback({
        imageBase64: validBase64Image,
        contextImageBase64: validBase64Image,
        structuralContext,
      });

      expect(mockAnalyze).toHaveBeenCalledWith(
        expect.any(Blob),
        expect.objectContaining({
          mode: 'fallback',
          fallbackPriority: ['nvidia-nim', 'openrouter'],
        }),
        expect.objectContaining({
          contextImage: expect.any(Blob),
          structuralContext,
        }),
      );
    });
  });

  describe('input validation', () => {
    it('rejects empty imageBase64', async () => {
      const result = await analyzeWithFallback({ imageBase64: '' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.error.code).toBe('VALIDATION_ERROR');
        expect(result.error.error.message).toContain('required');
      }
    });

    it('rejects oversized imageBase64', async () => {
      // Create a string larger than ~13.7 MB
      const oversizedImage = 'A'.repeat(Math.ceil(10 * 1024 * 1024 * 1.37) + 1);

      const result = await analyzeWithFallback({
        imageBase64: oversizedImage,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.error.code).toBe('VALIDATION_ERROR');
        expect(result.error.error.message).toContain('size');
      }
    });
  });

  describe('error handling', () => {
    it('returns SERVICE_UNAVAILABLE when no keys are configured', async () => {
      delete process.env.OPENROUTER_API_KEY;
      delete process.env.NVIDIA_NIM_API_KEY;

      const result = await analyzeWithFallback({
        imageBase64: validBase64Image,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.error.code).toBe('SERVICE_UNAVAILABLE');
        expect(result.error.error.message).toContain('configurados');
      }
    });

    it('returns ANALYSIS_FAILED when adapter throws', async () => {
      mockAnalyze.mockRejectedValue(
        new Error('Analysis failed: timeout'),
      );

      const result = await analyzeWithFallback({
        imageBase64: validBase64Image,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.error.code).toBe('ANALYSIS_FAILED');
      }
    });

    it('does not expose internal error details for non-analysis errors', async () => {
      mockAnalyze.mockRejectedValue(
        new Error('ECONNREFUSED /var/internal/service'),
      );

      const result = await analyzeWithFallback({
        imageBase64: validBase64Image,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.error.message).not.toContain('/var');
        expect(result.error.error.message).not.toContain('ECONNREFUSED');
        expect(result.error.error.message).toBe(
          'No fue posible completar el análisis en este momento.',
        );
      }
    });

    it('never exposes environment variable names in errors', async () => {
      mockAnalyze.mockRejectedValue(
        new Error('Missing OPENROUTER_API_KEY'),
      );

      const result = await analyzeWithFallback({
        imageBase64: validBase64Image,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.error.message).not.toContain('OPENROUTER_API_KEY');
        expect(result.error.error.message).not.toContain('NVIDIA_NIM_API_KEY');
      }
    });
  });

  describe('environment variable access', () => {
    it('reads OPENROUTER_API_KEY from process.env', async () => {
      delete process.env.NVIDIA_NIM_API_KEY;
      mockAnalyze.mockResolvedValue({
        riskLevel: 'low',
        description: 'Test',
        confidence: 0.5,
        provider: 'openrouter',
        analyzedAt: '2024-01-15T10:00:00.000Z',
      });

      const { OpenRouterProvider } = await import(
        '@/lib/ai/providers/openrouter'
      );

      await analyzeWithFallback({ imageBase64: validBase64Image });

      expect(OpenRouterProvider).toHaveBeenCalledWith('test-openrouter-key');
    });

    it('reads NVIDIA_NIM_API_KEY from process.env', async () => {
      delete process.env.OPENROUTER_API_KEY;
      mockAnalyze.mockResolvedValue({
        riskLevel: 'low',
        description: 'Test',
        confidence: 0.5,
        provider: 'nvidia-nim',
        analyzedAt: '2024-01-15T10:00:00.000Z',
      });

      const { NVIDIANIMProvider } = await import(
        '@/lib/ai/providers/nvidia-nim'
      );

      await analyzeWithFallback({ imageBase64: validBase64Image });

      expect(NVIDIANIMProvider).toHaveBeenCalledWith('test-nvidia-key');
    });
  });
});
