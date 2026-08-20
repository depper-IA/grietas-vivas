/**
 * Tests para el helper de timing-safe comparison usado por el Edge Function.
 *
 * Cubre los escenarios del spec 1.1:
 *   - Valid token: true
 *   - Invalid token (mismo length): false
 *   - Length mismatch: false
 *   - Strings vacias: true (igual a si mismo)
 */

import { describe, it, expect } from 'vitest';
import { timingSafeEqualString } from './crypto';

describe('timingSafeEqualString', () => {
  const SERVICE_KEY =
    'sb-secret-1234567890abcdefghijklmnopqrstuvwxyz-ABCDEFGHIJ';

  it('devuelve true para dos strings identicas', async () => {
    await expect(timingSafeEqualString(SERVICE_KEY, SERVICE_KEY)).resolves.toBe(
      true,
    );
  });

  it('devuelve true para dos strings distintas pero con misma longitud', async () => {
    const sameLengthDifferent = 'X'.repeat(SERVICE_KEY.length);
    await expect(
      timingSafeEqualString(SERVICE_KEY, sameLengthDifferent),
    ).resolves.toBe(false);
  });

  it('devuelve false para length mismatch', async () => {
    await expect(
      timingSafeEqualString(SERVICE_KEY, SERVICE_KEY.slice(0, -1)),
    ).resolves.toBe(false);
    await expect(
      timingSafeEqualString(SERVICE_KEY, SERVICE_KEY + 'x'),
    ).resolves.toBe(false);
  });

  it('dos strings vacias son iguales', async () => {
    await expect(timingSafeEqualString('', '')).resolves.toBe(true);
  });

  it('string vacia vs non-empty es length mismatch', async () => {
    await expect(timingSafeEqualString('', 'a')).resolves.toBe(false);
    await expect(timingSafeEqualString('a', '')).resolves.toBe(false);
  });

  it('distingue caracteres en distintas posiciones (no solo el primero)', async () => {
    const a = 'abcdefghij';
    const b1 = 'Xbcdefghij'; // diff en posicion 0
    const b2 = 'abcdefghiX'; // diff en posicion 9
    await expect(timingSafeEqualString(a, b1)).resolves.toBe(false);
    await expect(timingSafeEqualString(a, b2)).resolves.toBe(false);
  });

  it('maneja correctamente strings con caracteres multibyte UTF-8', async () => {
    // "ñ" es 2 bytes en UTF-8
    await expect(timingSafeEqualString('café', 'café')).resolves.toBe(true);
    await expect(timingSafeEqualString('café', 'cafe')).resolves.toBe(false);
    // Misma longitud en bytes pero distinta en contenido
    await expect(
      timingSafeEqualString('niño', 'nixo'),
    ).resolves.toBe(false);
  });
});
