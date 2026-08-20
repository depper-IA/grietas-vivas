/**
 * Rate Limiter — Per-user sliding window for Server Actions.
 *
 * Implementacion in-memory: cada (userId, action) mantiene una cola de
 * timestamps de requests dentro de la ventana. Si la cola >= maxPerMinute,
 * el siguiente request lanza `SafeError RATE_LIMITED`.
 *
 * Limites:
 *   - In-memory -> NO comparte cuota entre instancias. Para produccion
 *     distribuida, reemplazar por Redis / Upstash.
 *   - La ventana es de 60 segundos desde el timestamp mas viejo.
 *
 * Seguridad:
 *   - El `userId` viene del servidor (Supabase getUser) -> no es user input.
 *   - El mensaje de error es user-safe (no expone internos).
 *
 * Spec: sdd/improve-project 1.3 — Rate limiting on Server Actions.
 */

import type { SafeErrorResponse } from '@/lib/errors/types';

/** Acciones rate-limited del proyecto. Anade aqui solo si necesitas mas. */
export type RateLimitAction = 'analysis' | 'sync' | 'report';

/** Tamano de la ventana deslizante en milisegundos. */
const WINDOW_MS = 60_000;

/**
 * Error estructurado que cumple el contrato `SafeErrorResponse` del proyecto.
 * El caller usa `safeError` (o `safeResponse.error`) para mapear a la
 * respuesta user-safe de un Server Action sin exponer detalles internos.
 */
export class SafeError extends Error {
  public readonly code: string;
  /** Inner shape: matches `SafeErrorResponse['error']`. */
  public readonly safeError: SafeErrorResponse['error'];
  /** Full SafeErrorResponse envelope (kept for callers that want it). */
  public readonly safeResponse: SafeErrorResponse;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'SafeError';
    this.code = code;
    this.safeError = { code, message };
    this.safeResponse = { error: this.safeError };
  }
}

/** Store in-memory: key = `${userId}:${action}` -> cola de timestamps. */
const store: Map<string, number[]> = new Map();

/**
 * Verifica si la request cabe dentro de la ventana. Si pasa, registra el
 * timestamp; si excede el limite, lanza `SafeError RATE_LIMITED`.
 *
 * Atomicidad: el Map.get + push/set ocurre en el mismo tick de JS, asi que
 * requests secuenciales no se pasan del limite. Para requests concurrentes
 * que ejecutan checkRateLimit en el mismo microtask antes de cualquier
 * await, la cola captura exactamente N entries antes de bloquear el N+1.
 */
export async function checkRateLimit(
  userId: string,
  action: RateLimitAction,
  maxPerMinute: number,
): Promise<void> {
  if (maxPerMinute <= 0) {
    throw new SafeError(
      'CONFIGURATION_ERROR',
      'Limite invalido: maxPerMinute debe ser positivo.',
    );
  }

  const key = `${userId}:${action}`;
  const now = Date.now();
  const cutoff = now - WINDOW_MS;

  // Filtra timestamps expirados (>60s atras)
  const previous = store.get(key) ?? [];
  const active: number[] = [];
  for (const ts of previous) {
    if (ts > cutoff) {
      active.push(ts);
    }
  }

  if (active.length >= maxPerMinute) {
    throw new SafeError(
      'RATE_LIMITED',
      'Demasiadas solicitudes. Por favor espera un momento antes de reintentar.',
    );
  }

  active.push(now);
  store.set(key, active);
}

/**
 * Limpia todo el store. Pensado SOLO para tests — nunca invocar en runtime
 * porque resetearia cuotas de todos los usuarios.
 *
 * El underscore al inicio del nombre senala intencion de uso interno.
 */
export function _resetRateLimitStore(): void {
  store.clear();
}
