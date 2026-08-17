import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatError, sanitizeMessage } from './formatError';
import { logAnalysis, logSync } from './secureLogger';
import type { SafeErrorResponse } from './types';

describe('formatError', () => {
  describe('stack trace stripping', () => {
    it('should strip stack traces from Error objects', () => {
      const error = new Error('Something went wrong');
      error.stack = `Error: Something went wrong
    at Function.Module._resolveFilename (node:internal/modules/cjs/loader:933:15)
    at Function.Module._load (node:internal/modules/cjs/loader:778:27)
    at Module.require (node:internal/modules/cjs/loader:1005:19)`;

      const result = formatError(error);

      expect(result.error.message).not.toContain('at Function');
      expect(result.error.message).not.toContain('Module._resolveFilename');
      expect(result.error.message).not.toContain('node:internal');
    });

    it('should strip source map references from messages', () => {
      const msg = 'Error occurred in handler.ts:45:12 while processing request';
      const sanitized = sanitizeMessage(msg);

      expect(sanitized).not.toMatch(/\.ts:\d+:\d+/);
    });
  });

  describe('file path stripping', () => {
    it('should strip Unix file paths', () => {
      const msg = 'Failed to read /src/lib/db/localDb.ts for module resolution';
      const sanitized = sanitizeMessage(msg);

      expect(sanitized).not.toContain('/src/lib/db/localDb.ts');
      expect(sanitized).toContain('[redacted]');
    });

    it('should strip Windows file paths', () => {
      const msg = 'Cannot find module at C:\\Users\\dev\\project\\src\\index.ts';
      const sanitized = sanitizeMessage(msg);

      expect(sanitized).not.toContain('C:\\Users');
      expect(sanitized).toContain('[redacted]');
    });

    it('should strip /var and /home paths', () => {
      const msg = 'Permission denied: /var/log/app.log and /home/user/.env';
      const sanitized = sanitizeMessage(msg);

      expect(sanitized).not.toContain('/var/log');
      expect(sanitized).not.toContain('/home/user');
    });
  });

  describe('known error type mapping', () => {
    it('should map Zod validation errors to VALIDATION_ERROR', () => {
      const zodError = {
        issues: [
          { path: ['email'], message: 'Invalid email format' },
          { path: ['password'], message: 'Too short' },
        ],
      };

      const result = formatError(zodError);

      expect(result.error.code).toBe('VALIDATION_ERROR');
      expect(result.error.message).toBe('One or more fields are invalid.');
      expect(result.error.fields).toEqual({
        email: 'Invalid email format',
        password: 'Too short',
      });
    });

    it('should map authentication errors to UNAUTHORIZED', () => {
      const error = new Error('User is not authenticated');
      const result = formatError(error);

      expect(result.error.code).toBe('UNAUTHORIZED');
      expect(result.error.message).toBe('Authentication is required to access this resource.');
    });

    it('should map forbidden errors to FORBIDDEN', () => {
      const error = new Error('Access denied for this resource');
      const result = formatError(error);

      expect(result.error.code).toBe('FORBIDDEN');
    });

    it('should map not found errors to NOT_FOUND', () => {
      const error = new Error('Resource not found');
      const result = formatError(error);

      expect(result.error.code).toBe('NOT_FOUND');
    });

    it('should map timeout errors to TIMEOUT', () => {
      const error = new Error('Request timed out after 60s');
      const result = formatError(error);

      expect(result.error.code).toBe('TIMEOUT');
    });

    it('should map rate limit errors to RATE_LIMITED', () => {
      const error = new Error('Rate limit exceeded: too many requests');
      const result = formatError(error);

      expect(result.error.code).toBe('RATE_LIMITED');
    });

    it('should map network errors to NETWORK_ERROR', () => {
      const error = new Error('Network request failed: ECONNREFUSED');
      const result = formatError(error);

      expect(result.error.code).toBe('NETWORK_ERROR');
    });

    it('should map upload errors to UPLOAD_FAILED', () => {
      const error = new Error('Upload to storage bucket failed');
      const result = formatError(error);

      expect(result.error.code).toBe('UPLOAD_FAILED');
    });
  });

  describe('unknown errors produce generic message', () => {
    it('should return generic message for non-Error objects', () => {
      const result = formatError({ random: 'object' });

      expect(result.error.code).toBe('INTERNAL_ERROR');
      expect(result.error.message).toBe('An unexpected error occurred. Please try again later.');
    });

    it('should return generic message for null', () => {
      const result = formatError(null);

      expect(result.error.code).toBe('INTERNAL_ERROR');
      expect(result.error.message).toBe('An unexpected error occurred. Please try again later.');
    });

    it('should return generic message for undefined', () => {
      const result = formatError(undefined);

      expect(result.error.code).toBe('INTERNAL_ERROR');
    });

    it('should return generic message for string errors without known patterns', () => {
      const result = formatError('something broke');

      expect(result.error.code).toBe('INTERNAL_ERROR');
      expect(result.error.message).toBe('An unexpected error occurred. Please try again later.');
    });
  });

  describe('database identifier redaction', () => {
    it('should redact UUIDs in error messages', () => {
      const msg = 'Row with id 550e8400-e29b-41d4-a716-446655440000 not found in reports table';
      const sanitized = sanitizeMessage(msg);

      expect(sanitized).not.toContain('550e8400-e29b-41d4-a716-446655440000');
      expect(sanitized).toContain('[id]');
    });

    it('should redact multiple UUIDs', () => {
      const msg = 'Conflict between 123e4567-e89b-12d3-a456-426614174000 and 987fcdeb-51a2-43e7-b6c8-abcdef123456';
      const sanitized = sanitizeMessage(msg);

      expect(sanitized).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
      expect(sanitized).toContain('[id]');
    });
  });

  describe('internal service name stripping', () => {
    it('should redact supabase references', () => {
      const msg = 'Connection to supabase failed at endpoint';
      const sanitized = sanitizeMessage(msg);

      expect(sanitized).not.toContain('supabase');
      expect(sanitized).toContain('[service]');
    });

    it('should redact postgres references', () => {
      const msg = 'PostgreSQL error: relation "reports" violated constraint';
      const sanitized = sanitizeMessage(msg);

      expect(sanitized).not.toMatch(/postgres/i);
      expect(sanitized).toContain('[service]');
    });

    it('should redact redis references', () => {
      const msg = 'redis connection pool exhausted';
      const sanitized = sanitizeMessage(msg);

      expect(sanitized).not.toContain('redis');
    });

    it('should redact internal-api references', () => {
      const msg = 'Call to internal-api/v2/reports failed with 503';
      const sanitized = sanitizeMessage(msg);

      expect(sanitized).not.toContain('internal-api');
    });
  });

  describe('SafeErrorResponse structure', () => {
    it('should always return a valid SafeErrorResponse shape', () => {
      const result = formatError(new Error('test'));

      expect(result).toHaveProperty('error');
      expect(result.error).toHaveProperty('code');
      expect(result.error).toHaveProperty('message');
      expect(typeof result.error.code).toBe('string');
      expect(typeof result.error.message).toBe('string');
    });

    it('should never include stack property in the response', () => {
      const error = new Error('test');
      const result = formatError(error);

      expect(result).not.toHaveProperty('stack');
      expect(result.error).not.toHaveProperty('stack');
    });
  });
});

describe('secureLogger', () => {
  let consoleInfoSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('logAnalysis', () => {
    it('should log provider, success, and duration safely', () => {
      logAnalysis({ provider: 'openai', success: true, duration: 1500 });

      expect(consoleInfoSpy).toHaveBeenCalledOnce();
      const logged = consoleInfoSpy.mock.calls[0][1];
      const parsed = JSON.parse(logged);

      expect(parsed.provider).toBe('openai');
      expect(parsed.success).toBe(true);
      expect(parsed.durationMs).toBe(1500);
    });

    it('should sanitize error messages in logs', () => {
      logAnalysis({
        provider: 'anthropic',
        success: false,
        duration: 300,
        error: 'Failed at /src/lib/ai/providers/anthropic.ts:42:10 with key sk-abc123456789012345678901234567',
      });

      expect(consoleWarnSpy).toHaveBeenCalledOnce();
      const logged = consoleWarnSpy.mock.calls[0][1];

      expect(logged).not.toContain('/src/lib/ai');
      expect(logged).not.toContain('sk-abc123');
    });

    it('should never log API keys', () => {
      logAnalysis({
        provider: 'openai',
        success: false,
        duration: 100,
        error: 'Invalid API key: sk-proj-abcdefghij1234567890abcdefghij1234567890',
      });

      const logged = consoleWarnSpy.mock.calls[0][1];
      expect(logged).not.toContain('sk-proj-abcdefghij');
    });

    it('should never log image data', () => {
      logAnalysis({
        provider: 'nvidia-nim',
        success: false,
        duration: 200,
        error: 'Payload too large: data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQEBAQEB',
      });

      const logged = consoleWarnSpy.mock.calls[0][1];
      expect(logged).not.toContain('base64');
      expect(logged).not.toContain('/9j/4AAQ');
    });

    it('should never log GPS coordinates', () => {
      logAnalysis({
        provider: 'openrouter',
        success: false,
        duration: 500,
        error: 'Metadata validation failed at coords 3.451234, -76.532100',
      });

      const logged = consoleWarnSpy.mock.calls[0][1];
      expect(logged).not.toContain('3.451234');
      expect(logged).not.toContain('-76.532100');
    });

    it('should never log PII (emails)', () => {
      logAnalysis({
        provider: 'anthropic',
        success: false,
        duration: 400,
        error: 'User john.doe@example.com exceeded quota',
      });

      const logged = consoleWarnSpy.mock.calls[0][1];
      expect(logged).not.toContain('john.doe@example.com');
    });
  });

  describe('logSync', () => {
    it('should log itemId, success, and duration', () => {
      logSync({ itemId: 'capture-001', success: true, duration: 2500 });

      expect(consoleInfoSpy).toHaveBeenCalledOnce();
      const logged = consoleInfoSpy.mock.calls[0][1];
      const parsed = JSON.parse(logged);

      expect(parsed.itemId).toBe('capture-001');
      expect(parsed.success).toBe(true);
      expect(parsed.durationMs).toBe(2500);
    });

    it('should sanitize sync error messages', () => {
      logSync({
        itemId: 'item-42',
        success: false,
        duration: 30000,
        error: 'Upload to supabase storage failed: /var/data/captures/image.jpg - PostgreSQL constraint violation',
      });

      expect(consoleWarnSpy).toHaveBeenCalledOnce();
      const logged = consoleWarnSpy.mock.calls[0][1];

      expect(logged).not.toContain('supabase');
      expect(logged).not.toContain('/var/data');
      expect(logged).not.toMatch(/postgres/i);
    });
  });
});
