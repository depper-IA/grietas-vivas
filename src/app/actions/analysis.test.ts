/**
 * Tests for the analyzeWithFallback Server Action.
 *
 * Validates:
 * - Successful analysis flow with mocked providers
 * - Input validation (empty image, oversized image)
 * - Error handling when all providers fail
 * - Environment variable access for fallback keys
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use vi.hoisted to ensure mock functions are available at factory time
const { mockAnalyze, mockRegisterProvider } = vi.hoisted(() => ({
  mockAnalyze: vi.fn(),
  mockRegisterProvider: vi.fn(),
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
    // Set env vars for testing
    process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
    process.env.NVIDIA_NIM_API_KEY = 'test-nvidia-key';
  });

  afterEach(() => {
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.NVIDIA_NIM_API_KEY;
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

    it('calls adapter.analyze with fallback config', async () => {
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
