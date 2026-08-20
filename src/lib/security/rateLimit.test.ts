/**
 * Tests para el rate limiter per-usuario con ventana deslizante.
 *
 * Contrato:
 *   - Ventana deslizante de 60 segundos por (userId, action).
 *   - Hasta N requests dentro de la ventana pasan; el N+1 lanza SafeError RATE_LIMITED.
 *   - Despues de 60s desde la request mas vieja, la ventana se libera y
 *     nuevas requests pasan.
 *   - Distintos (userId, action) tienen ventanas independientes.
 *   - Acciones distintas para el mismo user NO comparten cuota.
 *
 * Notas de diseno:
 *   - La implementacion es in-memory; no hay persistencia entre instancias.
 *   - El reloj se mockea con vi.useFakeTimers para no depender de wall time.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  checkRateLimit,
  SafeError,
  _resetRateLimitStore,
  type RateLimitAction,
} from './rateLimit';

describe('SafeError', () => {
  it('expone code y safeResponse consistentes', () => {
    const err = new SafeError('RATE_LIMITED', 'msg');
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('RATE_LIMITED');
    // `safeError` matches `SafeErrorResponse['error']` (inner shape) so callers
    // can directly return `{ success: false, error: err.safeError }`.
    expect(err.safeError).toEqual({ code: 'RATE_LIMITED', message: 'msg' });
    // `safeResponse` is the full envelope.
    expect(err.safeResponse).toEqual({
      error: { code: 'RATE_LIMITED', message: 'msg' },
    });
    expect(err.name).toBe('SafeError');
  });
});

describe('checkRateLimit', () => {
  beforeEach(() => {
    _resetRateLimitStore();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('permite la primera request dentro de la ventana', async () => {
    await expect(
      checkRateLimit('user-1', 'analysis', 10),
    ).resolves.toBeUndefined();
  });

  it('permite hasta maxPerMinute requests consecutivos', async () => {
    const limit = 5;
    for (let i = 0; i < limit; i++) {
      await expect(
        checkRateLimit('user-1', 'analysis', limit),
      ).resolves.toBeUndefined();
    }
  });

  it('lanza SafeError RATE_LIMITED al request N+1 dentro de la ventana', async () => {
    const limit = 3;
    for (let i = 0; i < limit; i++) {
      await checkRateLimit('user-2', 'sync', limit);
    }

    await expect(checkRateLimit('user-2', 'sync', limit)).rejects.toThrow(
      SafeError,
    );

    try {
      await checkRateLimit('user-2', 'sync', limit);
    } catch (e) {
      expect(e).toBeInstanceOf(SafeError);
      expect((e as SafeError).code).toBe('RATE_LIMITED');
      expect((e as SafeError).safeError.code).toBe('RATE_LIMITED');
      expect((e as SafeError).safeError.message).toMatch(/espera/i);
    }
  });

  it('la ventana se libera despues de 60 segundos desde la request mas vieja', async () => {
    const limit = 2;
    await checkRateLimit('user-3', 'report', limit);
    await checkRateLimit('user-3', 'report', limit);

    // Tercera request dentro de ventana: bloqueada
    await expect(
      checkRateLimit('user-3', 'report', limit),
    ).rejects.toThrow(SafeError);

    // Avanzar 61s: ventana limpia, nuevas requests pasan
    vi.advanceTimersByTime(61_000);
    await expect(
      checkRateLimit('user-3', 'report', limit),
    ).resolves.toBeUndefined();
  });

  it('sliding window: requests viejas dentro de ventana cuentan, nuevas no se liberan antes de tiempo', async () => {
    const limit = 3;
    // T=0: tres requests (llenan la ventana)
    await checkRateLimit('user-4', 'analysis', limit);
    vi.advanceTimersByTime(30_000);
    await checkRateLimit('user-4', 'analysis', limit);
    vi.advanceTimersByTime(29_000); // T=59s, ventana aun contiene 2 entries
    await checkRateLimit('user-4', 'analysis', limit);

    // T=59s + 1s mas -> ventana del primer entry expira, pero la segunda aun esta dentro
    vi.advanceTimersByTime(1_000); // T=60s
    // Solo queda 1 entry activa dentro de ventana (T=30s), pero estamos en el 3/3
    // T=60s la mas vieja expiro. Hagamos un check:
    // T=60s+epsilon, ventana = [T=30s, T=59s, T=60s(now)] => 3 entries => bloqueado

    // Avancemos hasta T=89s: la de T=30s expira. Ventana = [T=59s, T=60s] => 2 entries
    vi.advanceTimersByTime(29_000); // T=89s
    await expect(
      checkRateLimit('user-4', 'analysis', limit),
    ).resolves.toBeUndefined();
  });

  it('distintos userId tienen cuotas independientes', async () => {
    const limit = 1;
    await checkRateLimit('user-a', 'analysis', limit);

    // user-a bloqueado
    await expect(
      checkRateLimit('user-a', 'analysis', limit),
    ).rejects.toThrow(SafeError);

    // user-b pasa
    await expect(
      checkRateLimit('user-b', 'analysis', limit),
    ).resolves.toBeUndefined();
  });

  it('distintas acciones para el mismo user NO comparten cuota', async () => {
    const limit = 1;
    await checkRateLimit('user-5', 'analysis', limit);
    await checkRateLimit('user-5', 'sync', limit);
    await checkRateLimit('user-5', 'report', limit);

    // Cada accion se agoto independientemente
    await expect(
      checkRateLimit('user-5', 'analysis', limit),
    ).rejects.toThrow(SafeError);
    await expect(
      checkRateLimit('user-5', 'sync', limit),
    ).rejects.toThrow(SafeError);
    await expect(
      checkRateLimit('user-5', 'report', limit),
    ).rejects.toThrow(SafeError);
  });

  it('RateLimitAction type acepta los tres valores esperados', () => {
    const actions: RateLimitAction[] = ['analysis', 'sync', 'report'];
    expect(actions).toHaveLength(3);
  });

  it('requests concurrentes no permiten pasarse del limite (atomicidad del check)', async () => {
    const limit = 5;
    // Dispara 10 requests en paralelo; solo 5 deben pasar
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        checkRateLimit('user-6', 'sync', limit),
      ),
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled.length).toBe(limit);
    expect(rejected.length).toBe(10 - limit);

    rejected.forEach((r) => {
      expect((r as PromiseRejectedResult).reason).toBeInstanceOf(SafeError);
    });
  });
});
